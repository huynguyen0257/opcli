import { Command } from "commander";
import { execSync } from "child_process";
import chalk from "chalk";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { loadConfig } from "../config/store.js";
import { OpenProjectClient } from "../api/openproject.js";
import { select, input, checkbox, search, confirm } from "@inquirer/prompts";
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

function formatDate(iso: string): string {
  if (!iso) return "";
  return iso.substring(0, 10);
}

function reformatTable(tableLines: string[]): string[] {
  const maxTableWidth = Math.min(process.stdout.columns || 120, 120);
  const rows = tableLines.map((line) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim())
  );

  const dataRows = rows.filter(
    (row) => !row.every((cell) => /^[-:\s]*$/.test(cell))
  );
  if (dataRows.length === 0) return tableLines;

  const colCount = dataRows[0].length;
  // overhead: "| " + " | " between cols + " |"
  const overhead = 2 + (colCount - 1) * 3 + 2;
  const availableWidth = maxTableWidth - overhead;

  // First pass: natural widths
  const naturalWidths: number[] = [];
  for (let c = 0; c < colCount; c++) {
    naturalWidths[c] = Math.max(...dataRows.map((row) => (row[c] || "").length), 3);
  }

  const totalNatural = naturalWidths.reduce((a, b) => a + b, 0);
  let colWidths: number[];
  if (totalNatural <= availableWidth) {
    colWidths = naturalWidths;
  } else {
    // Distribute proportionally, min 5 per column
    colWidths = naturalWidths.map((w) =>
      Math.max(5, Math.floor((w / totalNatural) * availableWidth))
    );
  }

  const truncate = (s: string, w: number) => {
    if (s.length <= w) return s;
    return s.substring(0, w - 1) + "…";
  };
  const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));

  const result: string[] = [];
  if (dataRows.length > 0) {
    result.push(
      chalk.bold("| " + dataRows[0].map((cell, i) => pad(truncate(cell, colWidths[i]), colWidths[i])).join(" | ") + " |")
    );
    result.push(
      chalk.gray("| " + colWidths.map((w) => "-".repeat(w)).join(" | ") + " |")
    );
    for (let r = 1; r < dataRows.length; r++) {
      result.push(
        "| " + dataRows[r].map((cell, i) => pad(truncate(cell, colWidths[i]), colWidths[i])).join(" | ") + " |"
      );
    }
  }
  return result;
}

function formatMarkdown(md: string, baseUrl: string): string {
  let result = md
    .replace(/&nbsp;/g, " ")
    .replace(/\[[^\]]*\]\(#[^)]*\)/g, "")
    .replace(/!\[([^\]]*)\]\(\/api\//g, `![$1](${baseUrl}/api/`)
    .replace(/^(\s*)\*\s+/gm, "$1• ");

  // Reformat tables
  const lines = result.split("\n");
  const output: string[] = [];
  let tableBuffer: string[] = [];

  for (const line of lines) {
    const stripped = line.replace(/^[\s•*-]*/, "").trimEnd();
    const isTableLine = stripped.startsWith("|") && stripped.endsWith("|");
    if (isTableLine) {
      tableBuffer.push(stripped);
    } else {
      if (tableBuffer.length > 0) {
        output.push(...reformatTable(tableBuffer));
        tableBuffer = [];
      }
      const trimmed = line.trimStart();
      if (trimmed.startsWith("#### ")) output.push(chalk.bold.yellow(line));
      else if (trimmed.startsWith("### ")) output.push(chalk.bold.magenta(line));
      else if (trimmed.startsWith("## ")) output.push(chalk.bold.cyan(line));
      else if (trimmed.startsWith("# ")) output.push(chalk.bold.green(line));
      else output.push(line);
    }
  }
  if (tableBuffer.length > 0) {
    output.push(...reformatTable(tableBuffer));
  }

  return output
    .join("\n")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => `${chalk.underline.blue(text)} ${chalk.gray("(" + url + ")")}`)
    .replace(/\[x\]/g, chalk.green("✔"))
    .replace(/\[ \]/g, chalk.gray("☐"))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatComment(raw: string, baseUrl: string): string {
  if (raw.includes("<") && raw.includes(">")) {
    const md = NodeHtmlMarkdown.translate(raw);
    return formatMarkdown(md, baseUrl);
  }
  return formatMarkdown(raw, baseUrl);
}

export function formatTasksTable(tasks: WorkPackage[]): string {
  const idW = Math.max(2, ...tasks.map((t) => String(t.id).length));
  const stW = Math.max(6, ...tasks.map((t) => t.status.length));
  const prW = Math.max(8, ...tasks.map((t) => t.priority.length));
  const asW = Math.max(8, ...tasks.map((t) => t.assignee.length));
  const dtW = 10;

  const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));
  const header = chalk.bold(`${pad("ID", idW)} | ${pad("Status", stW)} | ${pad("Priority", prW)} | ${pad("Assignee", asW)} | ${pad("Created", dtW)} | ${pad("Updated", dtW)} | Subject`);
  const separator = chalk.gray("-".repeat(idW + stW + prW + asW + dtW * 2 + 60));
  const rows = tasks.map(
    (t) => {
      const statusPadded = t.status + " ".repeat(Math.max(0, stW - t.status.length));
      return `${pad(String(t.id), idW)} | ${colorStatus(statusPadded)} | ${pad(t.priority, prW)} | ${pad(t.assignee, asW)} | ${pad(formatDate(t.createdAt), dtW)} | ${pad(formatDate(t.updatedAt), dtW)} | ${t.subject}`;
    }
  );
  return [header, separator, ...rows].join("\n");
}

export const tasksCommand = new Command("tasks");

tasksCommand
  .command("list [search]")
  .description("List work packages assigned to you")
  .option("-s, --status <status>", "Filter by status name")
  .option("-a, --assignee <user>", "Filter by assignee (name, ID, or 'all')")
  .action(async (search: string | undefined, options: { status?: string; assignee?: string }) => {
    const config = requireConfig();
    const client = new OpenProjectClient(config);

    try {
      let assignee = options.assignee;
      if (assignee && assignee !== "me" && assignee !== "all" && isNaN(Number(assignee))) {
        const users = await client.searchUsers(assignee);
        if (users.length === 0) {
          console.error(`No user found matching "${assignee}".`);
          process.exit(1);
        }
        if (users.length === 1) {
          assignee = String(users[0].id);
          console.log(`Found user: ${users[0].firstName} ${users[0].lastName} (${users[0].login})\n`);
        } else {
          console.log("Multiple users found:");
          users.forEach((u) => console.log(`  ${u.id} - ${u.firstName} ${u.lastName} (${u.login})`));
          console.error("\nSpecify user ID with -a <id>");
          process.exit(1);
        }
      }
      let tasks = await client.listWorkPackages({ search, assignee });
      if (options.status) {
        tasks = tasks.filter(
          (t: WorkPackage) => t.status.toLowerCase().includes(options.status!.toLowerCase())
        );
        if (tasks.length === 0) {
          console.log(`No tasks with status matching "${options.status}".`);
          return;
        }
      }
      if (tasks.length === 0) {
        console.log("No tasks found.");
        return;
      }
      console.log(formatTasksTable(tasks));
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

tasksCommand
  .command("view <id>")
  .description("View details of a work package")
  .option("--activities", "Show activities/history")
  .option("--relations", "Show relations")
  .option("--web", "Open task in browser")
  .action(async (id: string, options: { activities?: boolean; relations?: boolean; web?: boolean }) => {
    const config = requireConfig();

    if (options.web) {
      const baseUrl = config.url.replace(/\/$/, "");
      const url = `${baseUrl}/work_packages/${id}`;
      const { exec } = await import("node:child_process");
      exec(`open "${url}"`);
      console.log(chalk.green(`Opening ${url}`));
      return;
    }

    const client = new OpenProjectClient(config);

    try {
      const task = await client.getWorkPackage(Number(id));
      console.log(chalk.bold(`#${task.id} ${task.subject}\n`));
      console.log(`  ${chalk.gray("Type:")}       ${task.type}`);
      console.log(`  ${chalk.gray("Project:")}    ${task.project}`);
      console.log(`  ${chalk.gray("Status:")}     ${colorStatus(task.status)}`);
      console.log(`  ${chalk.gray("Priority:")}   ${task.priority}`);
      console.log(`  ${chalk.gray("Assignee:")}   ${task.assignee}`);
      console.log(`  ${chalk.gray("Author:")}     ${task.author}`);
      console.log(`  ${chalk.gray("Progress:")}   ${task.doneRatio}%`);
      console.log(`  ${chalk.gray("Created:")}    ${formatDate(task.createdAt)}`);
      console.log(`  ${chalk.gray("Updated:")}    ${formatDate(task.updatedAt)}`);
      if (task.startDate) console.log(`  ${chalk.gray("Start:")}      ${task.startDate}`);
      if (task.dueDate) console.log(`  ${chalk.gray("Due:")}        ${task.dueDate}`);
      const baseUrl = config.url.replace(/\/$/, "");
      if (task.descriptionHtml) {
        const md = NodeHtmlMarkdown.translate(task.descriptionHtml);
        console.log(`\n${chalk.bold.underline("Description:")}\n`);
        console.log(formatMarkdown(md, baseUrl));
      } else if (task.description) {
        console.log(`\n${chalk.bold.underline("Description:")}\n`);
        console.log(formatMarkdown(task.description, baseUrl));
      }

      if (options.relations) {
        const relations = await client.getRelations(Number(id));
        if (relations.length > 0) {
          console.log(`\n${chalk.bold.underline("Relations:")} ${chalk.gray(`(${relations.length})`)}\n`);
          const wpId = Number(id);
          relations.forEach((r) => {
            const otherTitle = r.fromId === wpId ? r.toTitle : r.fromTitle;
            const otherId = r.fromId === wpId ? r.toId : r.fromId;
            console.log(`  ${chalk.yellow(r.name)} ${chalk.gray("#" + otherId)} ${otherTitle}`);
          });
        } else {
          console.log(`\n${chalk.gray("No relations.")}`);
        }
      }

      if (options.activities) {
        const activities = await client.getActivities(Number(id));
        const meaningful = activities.filter((a) => a.comment || a.details.length > 0);
        if (meaningful.length > 0) {
          console.log(`\n${chalk.bold.underline("Activities:")} ${chalk.gray(`(${meaningful.length})`)}\n`);
          meaningful.forEach((a) => {
            const date = formatDate(a.createdAt);
            const time = a.createdAt.substring(11, 16);
            const user = chalk.cyan(a.user);
            console.log(chalk.bgGray.white(` ${date} ${time} `) + ` ${user}`);
            if (a.details.length > 0) {
              a.details.forEach((d) => console.log(`  ${chalk.yellow("→")} ${d}`));
            }
            if (a.comment) {
              const formatted = formatComment(a.comment, baseUrl);
              const lines = formatted.split("\n");
              lines.forEach((l) => console.log(`  ${chalk.white("│")} ${l}`));
            }
            console.log();
          });
        } else {
          console.log(`\n${chalk.gray("No activities.")}`);
        }
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

tasksCommand
  .command("update <id>")
  .description("Update a work package")
  .option("-s, --status <status>", "New status name")
  .option("-a, --assignee <user>", "Assignee (name or user ID)")
  .option("--start <date>", "Start date (YYYY-MM-DD)")
  .option("--due <date>", "Due date (YYYY-MM-DD)")
  .option("--description <text>", "Update description")
  .option("--log-time <hours>", "Log spent time in hours")
  .option("--log-date <date>", "Date for logged time (default: today)")
  .option("--log-comment <text>", "Comment for logged time")
  .action(async (id: string, options: {
    status?: string;
    assignee?: string;
    start?: string;
    due?: string;
    description?: string;
    logTime?: string;
    logDate?: string;
    logComment?: string;
  }) => {
    const config = requireConfig();
    const client = new OpenProjectClient(config);

    try {
      const task = await client.getWorkPackage(Number(id));
      console.log(chalk.bold(`#${task.id} ${task.subject}\n`));

      const fields: {
        status?: string;
        assignee?: string;
        startDate?: string;
        dueDate?: string;
        description?: string;
      } = {};
      const changes: string[] = [];

      // Status
      if (options.status) {
        const statuses = await client.getAvailableStatuses(task.id);
        const match = statuses.find(
          (s) => s.name.toLowerCase() === options.status!.toLowerCase()
        );
        if (!match) {
          console.error(`Status "${options.status}" not available.`);
          console.error("Available: " + statuses.map((s) => s.name).join(", "));
          process.exit(1);
        }
        fields.status = match.href;
        changes.push(`Status → ${match.name}`);
      }

      // Assignee
      if (options.assignee) {
        let assigneeHref: string;
        if (options.assignee === "me") {
          assigneeHref = "/api/v3/users/me";
        } else if (!isNaN(Number(options.assignee))) {
          assigneeHref = `/api/v3/users/${options.assignee}`;
        } else {
          const users = await client.searchUsers(options.assignee);
          if (users.length === 0) {
            console.error(`No user found matching "${options.assignee}".`);
            process.exit(1);
          }
          if (users.length > 1) {
            console.log("Multiple users found:");
            users.forEach((u) => console.log(`  ${u.id} - ${u.firstName} (${u.login})`));
            console.error("\nSpecify user ID with -a <id>");
            process.exit(1);
          }
          assigneeHref = `/api/v3/users/${users[0].id}`;
          console.log(`Assignee: ${users[0].firstName} (${users[0].login})`);
        }
        fields.assignee = assigneeHref;
        changes.push(`Assignee → ${options.assignee}`);
      }

      // Dates
      if (options.start) {
        fields.startDate = options.start;
        changes.push(`Start → ${options.start}`);
      }
      if (options.due) {
        fields.dueDate = options.due;
        changes.push(`Due → ${options.due}`);
      }

      // Description
      if (options.description) {
        fields.description = options.description;
        changes.push("Description updated");
      }

      // Update work package if there are changes
      if (changes.length > 0) {
        console.log("Changes:");
        changes.forEach((c) => console.log(`  ${chalk.yellow("→")} ${c}`));
        await client.updateWorkPackage(task.id, task.lockVersion, fields);
        console.log(chalk.green("\nWork package updated."));
      }

      // Log time
      if (options.logTime) {
        const hours = parseFloat(options.logTime);
        const spentOn = options.logDate || new Date().toISOString().substring(0, 10);
        await client.logTime(task.id, hours, spentOn, options.logComment);
        console.log(chalk.green(`Logged ${hours}h on ${spentOn}.`));
      }

      if (changes.length === 0 && !options.logTime) {
        // Interactive mode
        const selected = await checkbox({
          message: "Select fields to update:",
          choices: [
            { name: `Status (${task.status})`, value: "status" },
            { name: `Assignee (${task.assignee})`, value: "assignee" },
            { name: `Start date (${task.startDate || "none"})`, value: "start" },
            { name: `Due date (${task.dueDate || "none"})`, value: "due" },
            { name: "Description", value: "description" },
            { name: "Log time", value: "logTime" },
          ],
        });

        if (selected.length === 0) {
          console.log(chalk.gray("No fields selected."));
          return;
        }

        if (selected.includes("status")) {
          const statuses = await client.getAvailableStatuses(task.id);
          const chosen = await select({
            message: "Select new status:",
            choices: statuses.map((s) => ({ name: s.name, value: s })),
          });
          fields.status = chosen.href;
          changes.push(`Status → ${chosen.name}`);
        }

        if (selected.includes("assignee")) {
          const assigneeInput = await input({ message: "Assignee (name, user ID, or 'me'):" });
          let assigneeHref: string;
          if (assigneeInput === "me") {
            assigneeHref = "/api/v3/users/me";
          } else if (!isNaN(Number(assigneeInput))) {
            assigneeHref = `/api/v3/users/${assigneeInput}`;
          } else {
            const users = await client.searchUsers(assigneeInput);
            if (users.length === 0) {
              console.error(`No user found matching "${assigneeInput}".`);
              process.exit(1);
            }
            if (users.length === 1) {
              assigneeHref = `/api/v3/users/${users[0].id}`;
              console.log(`Found: ${users[0].firstName} (${users[0].login})`);
            } else {
              const chosen = await select({
                message: "Select user:",
                choices: users.map((u) => ({ name: `${u.firstName} (${u.login})`, value: u })),
              });
              assigneeHref = `/api/v3/users/${chosen.id}`;
            }
          }
          fields.assignee = assigneeHref;
          changes.push(`Assignee → ${assigneeInput}`);
        }

        if (selected.includes("start")) {
          const val = await input({ message: "Start date (YYYY-MM-DD):", default: task.startDate || undefined });
          fields.startDate = val;
          changes.push(`Start → ${val}`);
        }

        if (selected.includes("due")) {
          const val = await input({ message: "Due date (YYYY-MM-DD):", default: task.dueDate || undefined });
          fields.dueDate = val;
          changes.push(`Due → ${val}`);
        }

        if (selected.includes("description")) {
          const val = await input({ message: "Description:" });
          fields.description = val;
          changes.push("Description updated");
        }

        if (changes.length > 0) {
          console.log("\nChanges:");
          changes.forEach((c) => console.log(`  ${chalk.yellow("→")} ${c}`));
          await client.updateWorkPackage(task.id, task.lockVersion, fields);
          console.log(chalk.green("\nWork package updated."));
        }

        if (selected.includes("logTime")) {
          const hours = await input({ message: "Hours (1-9):" });
          const spentOn = await input({ message: "Date (YYYY-MM-DD):", default: new Date().toISOString().substring(0, 10) });
          const comment = await input({ message: "Comment (optional):" });
          await client.logTime(task.id, parseFloat(hours), spentOn, comment || undefined);
          console.log(chalk.green(`Logged ${hours}h on ${spentOn}.`));
        }
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

tasksCommand
  .command("create-branch <id> <slug>")
  .description("Create a git branch from a task")
  .option("-p, --prefix <prefix>", "Branch prefix (default: feature)")
  .action(async (id: string, slug: string, options: { prefix?: string }) => {
    const config = requireConfig();
    const client = new OpenProjectClient(config);

    try {
      const task = await client.getWorkPackage(Number(id));
      const cleanSlug = slug.toLowerCase().replace(/[^\w-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      const prefix = options.prefix || "feature";
      const branchName = `${prefix}/op-${id}-${cleanSlug}`;

      console.log(chalk.bold(`#${task.id} ${task.subject}`));
      console.log(`Branch: ${chalk.cyan(branchName)}\n`);

      process.env.OPCLI_SKIP_HOOK = "1";
      execSync(`git checkout -b ${branchName}`, { stdio: "inherit" });
      delete process.env.OPCLI_SKIP_HOOK;
      console.log(chalk.green(`\nBranch "${branchName}" created and checked out.`));

      const shouldUpdate = await confirm({ message: "Update task status to \"In progress\"?" });
      if (shouldUpdate) {
        const statuses = await client.getAvailableStatuses(task.id);
        const match = statuses.find((s: any) => s.name.toLowerCase() === "in progress");
        if (match) {
          await client.updateWorkPackage(task.id, task.lockVersion, { status: match.href });
          console.log(chalk.green("Task status updated to \"In progress\"."));
        } else {
          console.log(chalk.yellow("Status \"In progress\" not found."));
        }
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

tasksCommand
  .command("comment <id> <message>")
  .description("Add a comment to a work package")
  .action(async (id: string, message: string) => {
    const config = requireConfig();
    const client = new OpenProjectClient(config);

    try {
      const task = await client.getWorkPackage(Number(id));
      console.log(chalk.bold(`#${task.id} ${task.subject}\n`));
      await client.addComment(task.id, message);
      console.log(chalk.green("Comment added."));
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

tasksCommand
  .command("create")
  .description("Create a new work package")
  .option("-n, --name <name>", "Task name/subject")
  .option("-d, --description <text>", "Task description")
  .option("-a, --assignee <user>", "Assignee (name, user ID, or 'me')")
  .option("-p, --project <project>", "Project name or ID")
  .action(async (options: { name?: string; description?: string; assignee?: string; project?: string }) => {
    const config = requireConfig();
    const client = new OpenProjectClient(config);

    try {
      let subject = options.name;
      if (!subject) {
        subject = await input({ message: "Task name:" });
        if (!subject) {
          console.error("Task name is required.");
          process.exit(1);
        }
      }

      let description = options.description;
      if (description === undefined) {
        description = await input({ message: "Description (optional):" });
      }

      const projects = await client.listProjects();
      if (projects.length === 0) {
        console.error("No projects found.");
        process.exit(1);
      }

      let projectHref: string;
      if (options.project) {
        const match = projects.find((p) =>
          !isNaN(Number(options.project))
            ? p.id === Number(options.project)
            : p.name.toLowerCase() === options.project!.toLowerCase()
        );
        if (!match) {
          console.error(`Project "${options.project}" not found.`);
          console.error("Available: " + projects.map((p) => `${p.name} (${p.id})`).join(", "));
          process.exit(1);
        }
        projectHref = match.href;
        console.log(`Project: ${match.name}`);
      } else if (projects.length === 1) {
        projectHref = projects[0].href;
        console.log(`Project: ${projects[0].name}`);
      } else {
        const chosen = await select({
          message: "Select project:",
          choices: projects.map((p) => ({ name: p.name, value: p })),
        });
        projectHref = chosen.href;
      }

      let assigneeHref: string | undefined;
      if (options.assignee) {
        if (options.assignee === "me") {
          assigneeHref = "/api/v3/users/me";
        } else if (!isNaN(Number(options.assignee))) {
          assigneeHref = `/api/v3/users/${options.assignee}`;
        } else {
          const users = await client.searchUsers(options.assignee);
          if (users.length === 0) {
            console.error(`No user found matching "${options.assignee}".`);
            process.exit(1);
          }
          if (users.length > 1) {
            console.log("Multiple users found:");
            users.forEach((u) => console.log(`  ${u.id} - ${u.firstName} (${u.login})`));
            console.error("\nSpecify user ID with -a <id>");
            process.exit(1);
          }
          assigneeHref = `/api/v3/users/${users[0].id}`;
          console.log(`Assignee: ${users[0].firstName} (${users[0].login})`);
        }
      }

      const taskId = await client.createWorkPackage({
        subject,
        description: description || undefined,
        assignee: assigneeHref,
        project: projectHref,
      });

      console.log(chalk.green(`\nTask #${taskId} created: ${subject}`));
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

tasksCommand
  .command("search")
  .description("Interactive search for work packages")
  .option("-a, --assignee <user>", "Filter by assignee (default: me)")
  .action(async (options: { assignee?: string }) => {
    const config = requireConfig();
    const client = new OpenProjectClient(config);

    try {
      // Pre-load all tasks
      const assignee = options.assignee || "me";
      let allTasks = await client.listWorkPackages({ assignee: assignee === "all" ? "all" : assignee });

      const chosen = await search<WorkPackage>({
        message: "Search tasks (type to filter):",
        source: async (term) => {
          if (!term) {
            return allTasks.slice(0, 20).map((t) => ({
              name: `#${t.id} [${colorStatus(t.status)}] ${t.subject}`,
              value: t,
            }));
          }
          const lower = term.toLowerCase();
          const filtered = allTasks.filter(
            (t) =>
              t.subject.toLowerCase().includes(lower) ||
              String(t.id).includes(lower) ||
              t.status.toLowerCase().includes(lower) ||
              t.priority.toLowerCase().includes(lower) ||
              t.assignee.toLowerCase().includes(lower)
          );
          return filtered.map((t) => ({
            name: `#${t.id} [${colorStatus(t.status)}] ${t.subject}`,
            value: t,
          }));
        },
      });

      // Show detail + actions
      console.log();
      console.log(chalk.bold(`#${chosen.id} ${chosen.subject}\n`));
      console.log(`  ${chalk.gray("Status:")}   ${colorStatus(chosen.status)}`);
      console.log(`  ${chalk.gray("Priority:")} ${chosen.priority}`);
      console.log(`  ${chalk.gray("Assignee:")} ${chosen.assignee}`);
      if (chosen.dueDate) console.log(`  ${chalk.gray("Due:")}      ${chosen.dueDate}`);
      console.log();

      const action = await select({
        message: "Action:",
        choices: [
          { name: "View detail", value: "view" },
          { name: "Update", value: "update" },
          { name: "Comment", value: "comment" },
          { name: "Create branch", value: "branch" },
          { name: "Exit", value: "exit" },
        ],
      });

      if (action === "view") {
        execSync(`node ${process.argv[1]} tasks view ${chosen.id} --activities --relations`, { stdio: "inherit" });
      } else if (action === "update") {
        execSync(`node ${process.argv[1]} tasks update ${chosen.id}`, { stdio: "inherit" });
      } else if (action === "comment") {
        const msg = await input({ message: "Comment:" });
        if (msg) {
          await client.addComment(chosen.id, msg);
          console.log(chalk.green("Comment added."));
        }
      } else if (action === "branch") {
        const slug = await input({ message: "Branch slug:" });
        if (slug) {
          execSync(`node ${process.argv[1]} tasks create-branch ${chosen.id} ${slug}`, { stdio: "inherit" });
        }
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

tasksCommand
  .command("projects")
  .description("List available projects")
  .action(async () => {
    const config = requireConfig();
    const client = new OpenProjectClient(config);

    try {
      const projects = await client.listProjects();
      if (projects.length === 0) {
        console.log("No projects found.");
        return;
      }
      const idW = Math.max(2, ...projects.map((p) => String(p.id).length));
      const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));
      console.log(chalk.bold(`${pad("ID", idW)} | Name`));
      console.log(chalk.gray("-".repeat(idW + 30)));
      projects.forEach((p) => {
        console.log(`${pad(String(p.id), idW)} | ${p.name}`);
      });
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });
