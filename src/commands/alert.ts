import { Command } from "commander";
import { execSync } from "child_process";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig } from "../config/store.js";
import { OpenProjectClient } from "../api/openproject.js";

const CRON_MARKER = "# opcli-alert-check";
const ALERT_CONFIG_PATH = path.join(os.homedir(), ".opcli", "alert.json");

function loadAlertConfig(): { enabled: boolean; hour: number } {
  if (!fs.existsSync(ALERT_CONFIG_PATH)) return { enabled: false, hour: 17 };
  return JSON.parse(fs.readFileSync(ALERT_CONFIG_PATH, "utf-8"));
}

function saveAlertConfig(config: { enabled: boolean; hour: number }): void {
  const dir = path.dirname(ALERT_CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ALERT_CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getBinPath(): string {
  try {
    return execSync("which opcli", { encoding: "utf-8" }).trim();
  } catch {
    return path.resolve(process.argv[1] || "opcli");
  }
}

function installCron(hour: number): void {
  const bin = getBinPath();
  const cronLine = `0 ${hour} * * 1-5 ${bin} alert check ${CRON_MARKER}`;

  let existing = "";
  try {
    existing = execSync("crontab -l 2>/dev/null", { encoding: "utf-8" });
  } catch {
    // no crontab
  }

  // Remove old opcli cron
  const filtered = existing.split("\n").filter((l) => !l.includes(CRON_MARKER)).join("\n").trim();
  const newCrontab = filtered ? `${filtered}\n${cronLine}\n` : `${cronLine}\n`;

  execSync(`echo '${newCrontab.replace(/'/g, "'\\''")}' | crontab -`, { encoding: "utf-8" });
}

function removeCron(): void {
  let existing = "";
  try {
    existing = execSync("crontab -l 2>/dev/null", { encoding: "utf-8" });
  } catch {
    return;
  }

  const filtered = existing.split("\n").filter((l) => !l.includes(CRON_MARKER)).join("\n").trim();
  if (filtered) {
    execSync(`echo '${filtered.replace(/'/g, "'\\''")}' | crontab -`, { encoding: "utf-8" });
  } else {
    execSync("crontab -r 2>/dev/null || true", { encoding: "utf-8" });
  }
}

function sendNotification(title: string, message: string): void {
  // Always print to terminal
  console.log(chalk.bold(`\n🔔 ${title}`));
  console.log(`   ${message}\n`);

  // OS notification: terminal-notifier
  try {
    const escaped = message.replace(/"/g, '\\"');
    const titleEscaped = title.replace(/"/g, '\\"');
    execSync(`terminal-notifier -title "${titleEscaped}" -message "${escaped}" -sound default -group opcli`, { stdio: "ignore" });
  } catch {
    // fallback osascript
    try {
      const escaped = message.replace(/"/g, '\\"');
      const titleEscaped = title.replace(/"/g, '\\"');
      execSync(`osascript -e 'display notification "${escaped}" with title "${titleEscaped}" sound name "Glass"'`);
    } catch {
      // beep fallback
      process.stdout.write("\x07");
    }
  }
}

export const alertCommand = new Command("alert");

alertCommand
  .command("on")
  .description("Enable daily time log reminder")
  .option("-h, --hour <hour>", "Hour to check (default: 17)", "17")
  .action((options: { hour?: string }) => {
    const hour = parseInt(options.hour || "18", 10);
    saveAlertConfig({ enabled: true, hour });
    installCron(hour);
    console.log(chalk.green(`Alert enabled. Will check at ${hour}:00 on weekdays.`));
    try {
      const cron = execSync("crontab -l", { encoding: "utf-8" });
      const line = cron.split("\n").find((l) => l.includes(CRON_MARKER));
      if (line) console.log(chalk.gray(`Cron: ${line.replace(CRON_MARKER, "").trim()}`));
    } catch {
      // ignore
    }
  });

alertCommand
  .command("off")
  .description("Disable daily time log reminder")
  .action(() => {
    saveAlertConfig({ enabled: false, hour: 17 });
    removeCron();
    console.log(chalk.green("Alert disabled. Cron removed."));
  });

alertCommand
  .command("status")
  .description("Show alert status")
  .action(() => {
    const config = loadAlertConfig();
    if (config.enabled) {
      console.log(chalk.green(`Alert: ON — check at ${config.hour}:00 weekdays`));
    } else {
      console.log(chalk.gray("Alert: OFF"));
    }
  });

alertCommand
  .command("check")
  .description("Check and alert if no time logged today")
  .action(async () => {
    const config = loadConfig();
    if (!config) {
      sendNotification("opcli", "No configuration found. Run 'opcli config setup'.");
      process.exit(1);
    }

    const client = new OpenProjectClient(config);
    const today = new Date().toISOString().substring(0, 10);

    try {
      const entries = await client.getTimeEntries(today, today);
      const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

      if (totalHours >= 8) {
        sendNotification("opcli — Great job!", `${totalHours}h logged today. Well done! 🎉`);
      } else if (totalHours === 0) {
        sendNotification("opcli — Log Time", `You haven't logged any time today (${today}). Don't forget!`);
      } else if (totalHours < 4) {
        sendNotification("opcli — Log Time", `Only ${totalHours}h logged today. Consider logging more.`);
      } else {
        sendNotification("opcli — Fighting!", `${totalHours}h logged today. Keep going! 💪`);
      }
    } catch {
      sendNotification("opcli", "Failed to check time entries. Check your session.");
    }
  });
