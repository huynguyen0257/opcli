import { Command } from "commander";
import { execSync, spawn } from "child_process";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const PID_FILE = path.join(os.homedir(), ".opcli", "focus.pid");
const ACTIVITY_DIR = path.join(os.homedir(), ".opcli", "activity");
const CHECK_INTERVAL = 60; // check every 60 seconds
const ACTIVE_THRESHOLD = 60; // idle < 60s = active
const AUTO_LOGIN_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours

function getIdleSeconds(): number {
  try {
    const out = execSync("ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print $NF/1000000000; exit}'", { encoding: "utf-8" });
    return parseFloat(out.trim()) || 0;
  } catch {
    return 0;
  }
}

function sendNotification(title: string, message: string): void {
  console.log(chalk.bold(`\n🔔 ${title}`));
  console.log(`   ${message}\n`);
  try {
    const escaped = message.replace(/"/g, '\\"');
    const titleEscaped = title.replace(/"/g, '\\"');
    execSync(`terminal-notifier -title "${titleEscaped}" -message "${escaped}" -sound default -group opcli-focus`, { stdio: "ignore" });
  } catch {
    try {
      const escaped = message.replace(/"/g, '\\"');
      const titleEscaped = title.replace(/"/g, '\\"');
      execSync(`osascript -e 'display notification "${escaped}" with title "${titleEscaped}" sound name "Glass"'`);
    } catch {
      process.stdout.write("\x07");
    }
  }
}

function savePid(pid: number): void {
  const dir = path.dirname(PID_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PID_FILE, String(pid));
}

function loadPid(): number | null {
  if (!fs.existsSync(PID_FILE)) return null;
  const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
  // Check if process is running
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    fs.unlinkSync(PID_FILE);
    return null;
  }
}

function removePid(): void {
  if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
}

function logActivity(): void {
  if (!fs.existsSync(ACTIVITY_DIR)) fs.mkdirSync(ACTIVITY_DIR, { recursive: true });
  const now = new Date();
  const dateStr = now.toISOString().substring(0, 10);
  const minuteOfDay = now.getHours() * 60 + now.getMinutes();
  const filePath = path.join(ACTIVITY_DIR, `${dateStr}.json`);

  let data: { date: string; minutes: number[] } = { date: dateStr, minutes: [] };
  if (fs.existsSync(filePath)) {
    data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }
  if (!data.minutes.includes(minuteOfDay)) {
    data.minutes.push(minuteOfDay);
    data.minutes.sort((a, b) => a - b);
  }
  fs.writeFileSync(filePath, JSON.stringify(data));
}

export function loadActivityForDate(dateStr: string): number[] {
  const filePath = path.join(ACTIVITY_DIR, `${dateStr}.json`);
  if (!fs.existsSync(filePath)) return [];
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return data.minutes || [];
}

export const focusCommand = new Command("focus");

focusCommand
  .command("on")
  .description("Start focus monitor (notify when idle > 10min)")
  .option("-i, --interval <minutes>", "Idle threshold in minutes", "10")
  .action((options: { interval?: string }) => {
    const existing = loadPid();
    if (existing) {
      console.log(chalk.yellow(`Focus monitor already running (PID: ${existing}).`));
      return;
    }

    const threshold = parseInt(options.interval || "10", 10) * 60;
    const binPath = process.argv[1];
    const child = spawn("node", [binPath, "focus", "_monitor", String(threshold)], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    if (child.pid) {
      savePid(child.pid);
      console.log(chalk.green(`Focus monitor started (PID: ${child.pid}).`));
      console.log(chalk.gray(`Will notify when idle > ${options.interval || "10"} minutes.`));
    }
  });

focusCommand
  .command("off")
  .description("Stop focus monitor")
  .action(() => {
    const pid = loadPid();
    if (!pid) {
      console.log(chalk.gray("Focus monitor is not running."));
      return;
    }
    try {
      process.kill(pid);
    } catch {
      // already dead
    }
    removePid();
    console.log(chalk.green("Focus monitor stopped."));
  });

focusCommand
  .command("status")
  .description("Show focus monitor status")
  .action(() => {
    const pid = loadPid();
    if (pid) {
      const idle = getIdleSeconds();
      console.log(chalk.green(`Focus monitor: ON (PID: ${pid})`));
      console.log(chalk.gray(`Current idle: ${Math.floor(idle)}s`));
    } else {
      console.log(chalk.gray("Focus monitor: OFF"));
    }
  });

focusCommand
  .command("_monitor <threshold>", { hidden: true })
  .action(async (threshold: string) => {
    const { loadConfig, saveConfig } = await import("../config/store.js");
    const { OpenProjectClient } = await import("../api/openproject.js");

    const thresholdSec = parseInt(threshold, 10);
    let notified = false;

    const refreshSession = async () => {
      const config = loadConfig();
      if (!config || !config.autoLogin) return;
      try {
        const session = await OpenProjectClient.login(config.url, config.username, config.password);
        config.session = session;
        saveConfig(config);
      } catch {
        // silent fail
      }
    };

    const config = loadConfig();
    if (config?.autoLogin) {
      setInterval(refreshSession, AUTO_LOGIN_INTERVAL);
    }

    setInterval(() => {
      const idle = getIdleSeconds();
      if (idle < ACTIVE_THRESHOLD) {
        logActivity();
      }
      if (idle >= thresholdSec && !notified) {
        sendNotification("opcli — Focus", `You've been idle for ${Math.floor(idle / 60)} minutes. Time to get back to work! 💪`);
        notified = true;
      } else if (idle < 60 && notified) {
        notified = false;
      }
    }, CHECK_INTERVAL * 1000);
  });
