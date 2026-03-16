import { Command } from "commander";
import chalk from "chalk";
import { loadConfig } from "../config/store.js";
import { OpenProjectClient } from "../api/openproject.js";
import type { TimeEntry } from "../api/openproject.js";
import { loadActivityForDate } from "./focus.js";

function requireConfig() {
  const config = loadConfig();
  if (!config) {
    console.error("No configuration found. Run 'opcli config setup' first.");
    process.exit(1);
  }
  return config;
}

function colorHours(hours: number): string {
  const str = hours.toFixed(1) + "h";
  if (hours <= 4) return chalk.red(str);
  if (hours < 7) return chalk.yellow(str);
  return chalk.green(str);
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isWeekend(dateStr: string): boolean {
  const day = new Date(dateStr).getDay();
  return day === 0 || day === 6;
}

function getDayName(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" });
}

export const statsCommand = new Command("stats");

function calcWorkMinutes(
  dateStr: string,
  schedule: { startHour: number; endHour: number; lunchStart: string; lunchEnd: string }
): { workMinutes: number; idleMinutes: number; totalScheduleMinutes: number } {
  const activeMinutes = loadActivityForDate(dateStr);
  const startMin = schedule.startHour * 60;
  const endMin = schedule.endHour * 60;
  const [lsH, lsM] = schedule.lunchStart.split(":").map(Number);
  const [leH, leM] = schedule.lunchEnd.split(":").map(Number);
  const lunchStartMin = lsH * 60 + lsM;
  const lunchEndMin = leH * 60 + leM;

  const scheduleMins = (endMin - startMin) - (lunchEndMin - lunchStartMin);

  const workMins = activeMinutes.filter((m) => {
    if (m < startMin || m >= endMin) return false;
    if (m >= lunchStartMin && m < lunchEndMin) return false;
    return true;
  });

  return {
    workMinutes: workMins.length,
    idleMinutes: Math.max(0, scheduleMins - workMins.length),
    totalScheduleMinutes: scheduleMins,
  };
}

function formatHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function getWeekNumber(dateStr: string): number {
  const d = new Date(dateStr);
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - start.getTime();
  return Math.ceil((diff / (1000 * 60 * 60 * 24) + start.getDay() + 1) / 7);
}

statsCommand
  .description("Show time logging statistics")
  .option("-m, --month <month>", "Month (1-12, default: current)")
  .option("-y, --year <year>", "Year (default: current)")
  .option("-t, --team", "Show team stats")
  .option("-w, --week [weekNumber]", "Week mode: no value = summary by week, with number = detail for that week")
  .action(async (options: { month?: string; year?: string; team?: boolean; week?: string | boolean }) => {
    const config = requireConfig();
    const client = new OpenProjectClient(config);
    const schedule = config.schedule || { startHour: 8, endHour: 17, lunchStart: "12:00", lunchEnd: "13:30" };

    try {
      const now = new Date();
      const month = parseInt(options.month || String(now.getMonth() + 1), 10);
      const year = parseInt(options.year || String(now.getFullYear()), 10);
      const daysInMonth = getDaysInMonth(year, month);
      const from = `${year}-${String(month).padStart(2, "0")}-01`;
      const to = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

      if (options.team) {
        const weekNum = typeof options.week === "string" ? parseInt(options.week, 10) : undefined;
        const weekSummary = options.week === true;
        await showTeamStats(client, from, to, year, month, daysInMonth, weekSummary, weekNum);
      } else {
        await showMyStats(client, from, to, year, month, daysInMonth, now, schedule);
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

async function showMyStats(
  client: OpenProjectClient, from: string, to: string,
  year: number, month: number, daysInMonth: number, now: Date,
  schedule: { startHour: number; endHour: number; lunchStart: string; lunchEnd: string }
) {
  const { getExpectedHours } = await import("../config/store.js");
  const expectedPerDay = getExpectedHours(schedule);
  const entries = await client.getTimeEntries(from, to);
  const monthName = new Date(year, month - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  console.log(chalk.bold(`\nTime Stats — ${monthName}`));
  console.log(chalk.gray(`  Schedule: ${schedule.startHour}:00 - ${schedule.endHour}:00 | Lunch: ${schedule.lunchStart} - ${schedule.lunchEnd} | Expected: ${expectedPerDay.toFixed(1)}h/day\n`));

  const byDate = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.spentOn) || [];
    list.push(e);
    byDate.set(e.spentOn, list);
  }

  const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));
  let totalLoggedHours = 0;
  let totalWorkMin = 0;
  let totalIdleMin = 0;
  let workDays = 0;
  let loggedDays = 0;
  const today = now.toISOString().substring(0, 10);

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayName = getDayName(dateStr);
    const weekend = isWeekend(dateStr);

    if (!weekend) workDays++;

    const dayEntries = byDate.get(dateStr) || [];
    const dayTotal = dayEntries.reduce((sum, e) => sum + e.hours, 0);

    if (dayTotal > 0) {
      loggedDays++;
      totalLoggedHours += dayTotal;
    }

    const dateLabel = weekend ? chalk.gray(`${dateStr} ${dayName}`) : `${dateStr} ${chalk.gray(dayName)}`;

    if (weekend) {
      console.log(`  ${dateLabel}  ${chalk.gray("—")}`);
      continue;
    }

    if (dateStr > today) {
      console.log(`  ${dateLabel}  ${chalk.gray("—")}`);
      continue;
    }

    const activity = calcWorkMinutes(dateStr, schedule);
    totalWorkMin += activity.workMinutes;
    totalIdleMin += activity.idleMinutes;

    const hasActivity = activity.workMinutes > 0;
    const workLabel = hasActivity
      ? chalk.green(formatHM(activity.workMinutes))
      : chalk.red("0m");
    const idleLabel = activity.idleMinutes > 0
      ? chalk.yellow(formatHM(activity.idleMinutes))
      : chalk.green("0m");
    const logLabel = dayTotal > 0 ? colorHours(dayTotal) : chalk.red("0.0h");

    console.log(`  ${dateLabel}  ${workLabel} ${chalk.gray("work")}  ${idleLabel} ${chalk.gray("idle")}  ${logLabel} ${chalk.gray("logged")}`);

    if (dayEntries.length > 0) {
      dayEntries.forEach((e) => {
        const taskLabel = chalk.gray(`#${e.workPackageId}`);
        const title = e.workPackageTitle.length > 50
          ? e.workPackageTitle.substring(0, 49) + "…"
          : e.workPackageTitle;
        console.log(`    ${taskLabel} ${pad(e.hours.toFixed(1) + "h", 6)} ${title}`);
      });
    }
  }

  const pastWorkDays = (() => {
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (!isWeekend(dateStr) && dateStr <= today) count++;
    }
    return count;
  })();
  const expectedTotal = pastWorkDays * expectedPerDay;
  const avgLogged = loggedDays > 0 ? totalLoggedHours / loggedDays : 0;

  console.log(chalk.bold(`\n  Active:   ${chalk.green(formatHM(totalWorkMin))} work  ${totalIdleMin > 0 ? chalk.yellow(formatHM(totalIdleMin)) : chalk.green("0m")} idle`));
  console.log(chalk.bold(`  Logged:   ${colorHours(totalLoggedHours)} / ${expectedTotal.toFixed(1)}h expected`));
  console.log(chalk.bold(`  Average:  ${colorHours(avgLogged)} logged / day`));
  console.log(chalk.gray(`  Work days: ${workDays} | Logged: ${loggedDays} | Missing: ${workDays - loggedDays}`));
  if (totalWorkMin === 0 && pastWorkDays > 0) {
    console.log(chalk.gray(`  Note: No activity data. Run 'opcli focus on' to track activity.`));
  }
  console.log();
}

async function showTeamStats(
  client: OpenProjectClient, from: string, to: string,
  year: number, month: number, daysInMonth: number, weekSummary?: boolean, weekNumber?: number
) {
  const entries = await client.getTimeEntries(from, to, { team: true });
  const monthName = new Date(year, month - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  if (weekNumber) {
    // Detail mode for specific week
    const weekEntries = entries.filter((e) => getWeekNumber(e.spentOn) === weekNumber);
    console.log(chalk.bold(`\nTeam Stats — ${monthName} — Week ${weekNumber}\n`));

    const users = [...new Set(weekEntries.map((e) => e.user))].sort();
    const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));

    // Collect dates in this week
    const dates = [...new Set(weekEntries.map((e) => e.spentOn))].sort();
    const nameW = Math.max(10, ...users.map((u) => u.split("@")[0].length));
    const colW = 6;

    const padColor = (raw: string, colored: string, w: number) =>
      colored + " ".repeat(Math.max(0, w - raw.length));

    // Header
    const header = pad("Member", nameW) + " | " + dates.map((d) => pad(d.substring(5) + " " + getDayName(d), colW)).join(" | ") + " | Total";
    console.log(chalk.bold(`  ${header}`));
    console.log(chalk.gray("  " + "-".repeat(header.length)));

    // Group by user + date
    const byUserDate = new Map<string, Map<string, number>>();
    for (const e of weekEntries) {
      if (!byUserDate.has(e.user)) byUserDate.set(e.user, new Map());
      const m = byUserDate.get(e.user)!;
      m.set(e.spentOn, (m.get(e.spentOn) || 0) + e.hours);
    }

    for (const user of users) {
      const name = user.split("@")[0];
      const userMap = byUserDate.get(user) || new Map();
      let total = 0;
      const cols = dates.map((d) => {
        const h = userMap.get(d) || 0;
        total += h;
        if (h > 0) {
          return padColor(h.toFixed(1) + "h", colorHours(h), colW);
        }
        return padColor("—", chalk.gray("—"), colW);
      });
      console.log(`  ${pad(name, nameW)} | ${cols.join(" | ")} | ${colorHours(total)}`);
    }

    const totalAll = weekEntries.reduce((sum, e) => sum + e.hours, 0);
    console.log(chalk.bold(`\n  Team Total: ${colorHours(totalAll)} | Members: ${users.length}\n`));
    return;
  }

  console.log(chalk.bold(`\nTeam Stats — ${monthName}\n`));

  // Collect users
  const users = [...new Set(entries.map((e) => e.user))].sort();
  const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));

  if (weekSummary) {
    // Group by user + week
    const byUserWeek = new Map<string, Map<number, number>>();
    const weeks = new Set<number>();
    for (const e of entries) {
      const week = getWeekNumber(e.spentOn);
      weeks.add(week);
      if (!byUserWeek.has(e.user)) byUserWeek.set(e.user, new Map());
      const userMap = byUserWeek.get(e.user)!;
      userMap.set(week, (userMap.get(week) || 0) + e.hours);
    }

    const sortedWeeks = [...weeks].sort((a, b) => a - b);
    const nameW = Math.max(10, ...users.map((u) => u.split("@")[0].length));
    const colW = 8;

    // Header
    const header = pad("Member", nameW) + " | " + sortedWeeks.map((w) => pad(`W${w}`, colW)).join(" | ") + " | Total";
    console.log(chalk.bold(`  ${header}`));
    console.log(chalk.gray("  " + "-".repeat(header.length)));

    const padColor = (raw: string, colored: string, w: number) =>
      colored + " ".repeat(Math.max(0, w - raw.length));

    for (const user of users) {
      const name = user.split("@")[0];
      const userMap = byUserWeek.get(user) || new Map();
      let total = 0;
      const cols = sortedWeeks.map((w) => {
        const h = userMap.get(w) || 0;
        total += h;
        if (h > 0) {
          const raw = h.toFixed(1) + "h";
          return padColor(raw, colorHours(h), colW);
        }
        return padColor("—", chalk.gray("—"), colW);
      });
      console.log(`  ${pad(name, nameW)} | ${cols.join(" | ")} | ${colorHours(total)}`);
    }
  } else {
    // Group by user + date
    const byUserDate = new Map<string, Map<string, number>>();
    for (const e of entries) {
      if (!byUserDate.has(e.user)) byUserDate.set(e.user, new Map());
      const userMap = byUserDate.get(e.user)!;
      userMap.set(e.spentOn, (userMap.get(e.spentOn) || 0) + e.hours);
    }

    const nameW = Math.max(10, ...users.map((u) => u.split("@")[0].length));

    for (const user of users) {
      const name = user.split("@")[0];
      const userMap = byUserDate.get(user) || new Map();
      let totalHours = 0;
      let loggedDays = 0;

      console.log(chalk.bold.cyan(`  ${name}`));

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const weekend = isWeekend(dateStr);
        const h = userMap.get(dateStr) || 0;
        if (h > 0) {
          loggedDays++;
          totalHours += h;
        }
        if (!weekend && h > 0) {
          console.log(`    ${dateStr} ${colorHours(h)}`);
        }
      }
      console.log(chalk.gray(`    Total: ${totalHours.toFixed(1)}h | Days: ${loggedDays}\n`));
    }
  }

  // Team summary
  const totalAll = entries.reduce((sum, e) => sum + e.hours, 0);
  console.log(chalk.bold(`  Team Total: ${colorHours(totalAll)} | Members: ${users.length}\n`));
}
