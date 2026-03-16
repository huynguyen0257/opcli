import { Command } from "commander";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { select, input, confirm } from "@inquirer/prompts";
import { loadConfig } from "../config/store.js";
import { OpenProjectClient } from "../api/openproject.js";
import { getCurrentBranch, extractTaskId, getRepoHash, getCommitsOnBranch } from "../utils/git.js";
import type { CommitInfo } from "../utils/git.js";

function getLogStatePath(): string {
  return path.join(os.homedir(), ".opcli", "logs");
}

function loadLoggedCommits(repoHash: string): Set<string> {
  const filePath = path.join(getLogStatePath(), `${repoHash}.json`);
  if (!fs.existsSync(filePath)) return new Set();
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return new Set(data.logged || []);
}

function saveLoggedCommits(repoHash: string, logged: Set<string>): void {
  const dir = getLogStatePath();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${repoHash}.json`);
  fs.writeFileSync(filePath, JSON.stringify({ logged: [...logged] }, null, 2));
}

function calcHoursFromCommits(commits: CommitInfo[]): number {
  if (commits.length <= 1) return 0.5;
  const first = commits[0].timestamp;
  const last = commits[commits.length - 1].timestamp;
  const hours = (last - first) / 3600;
  return Math.max(0.5, Math.round(hours * 2) / 2); // round to 0.5
}

export const logCommand = new Command("log");

logCommand
  .description("Log time from git branch activity")
  .option("--hours <hours>", "Skip mode selection, log directly")
  .action(async (options: { hours?: string }) => {
    const config = loadConfig();
    if (!config) {
      console.error("No configuration found. Run 'opcli config setup' first.");
      process.exit(1);
    }

    const branch = getCurrentBranch();
    const taskId = extractTaskId(branch);
    if (!taskId) {
      console.error(`Cannot extract task ID from branch "${branch}".`);
      console.error("Expected format: <prefix>/op-<id>-<slug>");
      process.exit(1);
    }

    const client = new OpenProjectClient(config);
    const task = await client.getWorkPackage(taskId);
    console.log(chalk.bold(`#${task.id} ${task.subject}`));
    console.log(`Branch: ${chalk.cyan(branch)}\n`);

    const repoHash = getRepoHash();
    const logged = loadLoggedCommits(repoHash);
    const allCommits = getCommitsOnBranch();
    const unlogged = allCommits.filter((c) => !logged.has(c.hash));

    if (unlogged.length === 0) {
      console.log(chalk.gray("No new commits to log."));
      return;
    }

    console.log(chalk.bold(`Commits to log (${unlogged.length}):\n`));
    unlogged.forEach((c) => {
      console.log(`  ${chalk.gray(c.hash.substring(0, 7))} ${c.date} ${c.message}`);
    });
    console.log();

    let hours: number;

    if (options.hours) {
      hours = parseFloat(options.hours);
    } else {
      const mode = await select({
        message: "How to calculate hours?",
        choices: [
          { name: `Auto (${calcHoursFromCommits(unlogged)}h from commit timestamps)`, value: "auto" },
          { name: "Manual (enter hours)", value: "manual" },
        ],
      });

      if (mode === "auto") {
        hours = calcHoursFromCommits(unlogged);
      } else {
        const val = await input({ message: "Hours:" });
        hours = parseFloat(val);
      }
    }

    const spentOn = unlogged[unlogged.length - 1].date;
    const comment = unlogged.map((c) => `${c.hash.substring(0, 7)} ${c.message}`).join("\n");

    console.log(`\n  Hours: ${chalk.yellow(String(hours) + "h")}`);
    console.log(`  Date:  ${spentOn}`);
    console.log(`  Commits: ${unlogged.length}\n`);

    const ok = await confirm({ message: "Log time?" });
    if (!ok) {
      console.log(chalk.gray("Cancelled."));
      return;
    }

    await client.logTime(taskId, hours, spentOn, comment);
    unlogged.forEach((c) => logged.add(c.hash));
    saveLoggedCommits(repoHash, logged);
    console.log(chalk.green(`Logged ${hours}h on ${spentOn}.`));
  });
