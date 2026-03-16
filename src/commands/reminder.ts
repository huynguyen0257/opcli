import { Command } from "commander";
import chalk from "chalk";
import { loadConfig } from "../config/store.js";
import { OpenProjectClient } from "../api/openproject.js";
import type { WorkPackage } from "../api/openproject.js";

function requireConfig() {
  const config = loadConfig();
  if (!config) {
    console.error("No configuration found. Run 'opcli config setup' first.");
    process.exit(1);
  }
  return config;
}

function colorStatus(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === "new") return chalk.white(status);
  if (s.includes("progress")) return chalk.blue(status);
  if (s.includes("develop")) return chalk.cyan(status);
  if (s.includes("tested") && !s.includes("fail")) return chalk.magenta(status);
  if (s.includes("closed")) return chalk.green(status);
  if (s.includes("reject")) return chalk.red(status);
  if (s.includes("fail")) return chalk.redBright(status);
  return chalk.yellow(status);
}

function daysUntil(dateStr: string, today: string): number {
  const d = new Date(dateStr);
  const t = new Date(today);
  return Math.ceil((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDueLabel(dueDate: string, today: string): string {
  if (!dueDate) return chalk.gray("no due date");
  const days = daysUntil(dueDate, today);
  if (days < 0) return chalk.red(`${Math.abs(days)}d overdue`);
  if (days === 0) return chalk.redBright("due today");
  if (days === 1) return chalk.yellow("due tomorrow");
  if (days <= 3) return chalk.yellow(`${days}d left`);
  return chalk.gray(`${days}d left`);
}

export const reminderCommand = new Command("reminder");

reminderCommand
  .description("Show task reminders: deadline, new, overdue")
  .option("-d, --days <days>", "Include tasks due within N days", "3")
  .action(async (options: { days?: string }) => {
    const config = requireConfig();
    const client = new OpenProjectClient(config);

    try {
      const tasks = await client.listWorkPackages();
      const today = new Date().toISOString().substring(0, 10);
      const daysThreshold = parseInt(options.days || "3", 10);

      const open = tasks.filter((t) => {
        const s = t.status.toLowerCase();
        return !s.includes("closed") && !s.includes("reject");
      });

      const overdue: WorkPackage[] = [];
      const dueToday: WorkPackage[] = [];
      const dueSoon: WorkPackage[] = [];
      const newTasks: WorkPackage[] = [];
      const rest: WorkPackage[] = [];

      for (const t of open) {
        if (!t.dueDate) {
          rest.push(t);
          continue;
        }
        const days = daysUntil(t.dueDate, today);
        if (days < 0) overdue.push(t);
        else if (days === 0) dueToday.push(t);
        else if (days <= daysThreshold) dueSoon.push(t);
        else if (t.status.toLowerCase() === "new") newTasks.push(t);
        else rest.push(t);
      }

      // New tasks without due date
      for (const t of [...rest]) {
        if (t.status.toLowerCase() === "new") {
          newTasks.push(t);
          rest.splice(rest.indexOf(t), 1);
        }
      }

      overdue.sort((a, b) => daysUntil(a.dueDate, today) - daysUntil(b.dueDate, today));
      dueSoon.sort((a, b) => daysUntil(a.dueDate, today) - daysUntil(b.dueDate, today));

      const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));

      const printTask = (t: WorkPackage) => {
        const due = formatDueLabel(t.dueDate, today);
        console.log(`  ${chalk.gray("#" + t.id)} ${pad(colorStatus(t.status), 20)} ${due}  ${t.subject}`);
      };

      const total = overdue.length + dueToday.length + dueSoon.length + newTasks.length + rest.length;
      console.log(chalk.bold(`\nReminder — ${today} (${total} open tasks)\n`));

      if (dueToday.length > 0) {
        console.log(chalk.bold.redBright(`🔴 Due today (${dueToday.length}):`));
        dueToday.forEach(printTask);
        console.log();
      }

      if (dueSoon.length > 0) {
        console.log(chalk.bold.yellow(`🟡 Due soon (${dueSoon.length}):`));
        dueSoon.forEach(printTask);
        console.log();
      }

      if (newTasks.length > 0) {
        console.log(chalk.bold.white(`🔵 New (${newTasks.length}):`));
        newTasks.forEach(printTask);
        console.log();
      }

      if (overdue.length > 0) {
        console.log(chalk.bold.red(`🔴 Overdue (${overdue.length}):`));
        overdue.forEach(printTask);
        console.log();
      }

      if (rest.length > 0) {
        console.log(chalk.bold.gray(`⚪ Other (${rest.length}):`));
        rest.forEach(printTask);
        console.log();
      }

      if (total === 0) {
        console.log(chalk.green("No open tasks. 🎉"));
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });
