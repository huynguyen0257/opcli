import { Command } from "commander";
import chalk from "chalk";
import { loadConfig } from "../config/store.js";
import { OpenProjectClient } from "../api/openproject.js";

function requireConfig() {
  const config = loadConfig();
  if (!config) {
    console.error("No configuration found. Run 'opcli config setup' first.");
    process.exit(1);
  }
  return config;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  return iso.substring(0, 10);
}

function formatTime(iso: string): string {
  if (!iso) return "";
  return iso.substring(11, 16);
}

function colorReason(reason: string): string {
  switch (reason) {
    case "assigned": return chalk.blue(reason);
    case "mentioned": return chalk.magenta(reason);
    case "watched": return chalk.cyan(reason);
    case "commented": return chalk.yellow(reason);
    case "created": return chalk.green(reason);
    case "status_updated": return chalk.white(reason);
    default: return chalk.gray(reason);
  }
}

export const notificationsCommand = new Command("notifications");

notificationsCommand
  .command("list")
  .description("List notifications")
  .option("-u, --unread", "Show unread only (default)")
  .option("-a, --all", "Show all notifications")
  .option("-n, --count <count>", "Number of notifications to show", "20")
  .action(async (options: { unread?: boolean; all?: boolean; count?: string }) => {
    const config = requireConfig();
    const client = new OpenProjectClient(config);

    try {
      const showAll = options.all || false;
      const count = parseInt(options.count || "20", 10);
      const notifications = await client.getNotifications({ unreadOnly: !showAll, pageSize: count });

      if (notifications.length === 0) {
        console.log(chalk.gray(showAll ? "No notifications." : "No unread notifications."));
        return;
      }

      console.log(chalk.bold(`Notifications (${notifications.length}):\n`));

      notifications.forEach((n) => {
        const date = `${formatDate(n.createdAt)} ${formatTime(n.createdAt)}`;
        const reason = colorReason(n.reason);
        const read = n.read ? chalk.gray("✓") : chalk.yellow("●");
        const taskId = n.resourceId ? chalk.gray(`#${n.resourceId}`) : "";
        console.log(`  ${read} ${chalk.gray(date)} ${reason} ${taskId} ${n.resourceTitle}`);
        if (n.actor) console.log(`    ${chalk.cyan(n.actor)}`);
      });
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

notificationsCommand
  .command("read [id]")
  .description("Mark notification(s) as read")
  .option("-a, --all", "Mark all as read")
  .action(async (id: string | undefined, options: { all?: boolean }) => {
    const config = requireConfig();
    const client = new OpenProjectClient(config);

    try {
      if (options.all) {
        await client.markAllNotificationsRead();
        console.log(chalk.green("All notifications marked as read."));
      } else if (id) {
        await client.markNotificationRead(Number(id));
        console.log(chalk.green(`Notification #${id} marked as read.`));
      } else {
        console.error("Specify notification ID or use --all.");
        process.exit(1);
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });
