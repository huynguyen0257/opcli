import { Command } from "commander";
import { configCommand } from "./commands/config.js";
import { tasksCommand } from "./commands/tasks.js";
import { logCommand } from "./commands/log.js";
import { hookCommand } from "./commands/hook.js";
import { notificationsCommand } from "./commands/notifications.js";
import { reminderCommand } from "./commands/reminder.js";
import { statsCommand } from "./commands/stats.js";
import { alertCommand } from "./commands/alert.js";
import { focusCommand } from "./commands/focus.js";

const program = new Command();

program
  .name("opcli")
  .description("CLI tool for OpenProject task management")
  .version("0.1.0");

program.addCommand(configCommand);
program.addCommand(tasksCommand);
program.addCommand(logCommand);
program.addCommand(hookCommand);
program.addCommand(notificationsCommand);
program.addCommand(reminderCommand);
program.addCommand(statsCommand);
program.addCommand(alertCommand);
program.addCommand(focusCommand);

program.parse();
