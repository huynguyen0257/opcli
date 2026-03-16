import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface WorkSchedule {
  startHour: number;    // e.g. 8
  endHour: number;      // e.g. 17
  lunchStart: string;   // e.g. "12:00"
  lunchEnd: string;     // e.g. "13:30"
}

export function getExpectedHours(schedule: WorkSchedule): number {
  const [lsH, lsM] = schedule.lunchStart.split(":").map(Number);
  const [leH, leM] = schedule.lunchEnd.split(":").map(Number);
  const lunchHours = (leH + leM / 60) - (lsH + lsM / 60);
  return schedule.endHour - schedule.startHour - lunchHours;
}

export interface OpcliConfig {
  url: string;
  username: string;
  password: string;
  session?: string;
  schedule?: WorkSchedule;
  autoLogin?: boolean;
}

interface StoredConfig {
  url: string;
  username: string;
  password: string;
  session?: string;
  schedule?: WorkSchedule;
  autoLogin?: boolean;
}

export function getConfigPath(): string {
  return path.join(os.homedir(), ".opcli", "config.json");
}

export function loadConfig(): OpcliConfig | null {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const raw: StoredConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  return {
    url: raw.url,
    username: raw.username,
    password: Buffer.from(raw.password, "base64").toString("utf-8"),
    session: raw.session,
    schedule: raw.schedule,
    autoLogin: raw.autoLogin,
  };
}

export function saveConfig(config: OpcliConfig): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const stored: StoredConfig = {
    url: config.url,
    username: config.username,
    password: Buffer.from(config.password).toString("base64"),
    session: config.session,
    schedule: config.schedule,
    autoLogin: config.autoLogin,
  };
  fs.writeFileSync(configPath, JSON.stringify(stored, null, 2));
}
