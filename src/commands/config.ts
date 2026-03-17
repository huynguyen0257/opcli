import { Command } from "commander";
import { loadConfig, saveConfig } from "../config/store.js";
import { OpenProjectClient } from "../api/openproject.js";
import { promptCredentials } from "../utils/prompts.js";
import { input, confirm } from "@inquirer/prompts";
import chalk from "chalk";

export const configCommand = new Command("config");

configCommand
  .command("setup")
  .description("Configure OpenProject credentials")
  .action(async () => {
    const url = "https://devtak.cbidigital.com";
    console.log(`Configuring connection to ${url}\n`);

    const { username, password } = await promptCredentials();

    console.log("\nLogging in...");

    try {
      const session = await OpenProjectClient.login(url, username, password);
      const client = new OpenProjectClient({ url, username, password, session });
      const user = await client.getMe();
      console.log(`Authenticated as ${user.firstName} ${user.lastName} (${user.login})`);

      const autoLogin = await confirm({
        message: "Enable auto-login (refresh session every 2h)?",
        default: true,
      });

      saveConfig({ url, username, password, session, autoLogin });
      console.log("Configuration saved.");
      if (autoLogin) {
        console.log(chalk.gray("Auto-login enabled."));
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

configCommand
  .command("schedule")
  .description("Configure work schedule (start/end hours, lunch break)")
  .action(async () => {
    const config = loadConfig();
    if (!config) {
      console.error("No configuration found. Run 'opcli config setup' first.");
      process.exit(1);
    }

    const current = config.schedule || { startHour: 8, endHour: 17, lunchStart: "12:00", lunchEnd: "13:30" };

    const startStr = await input({
      message: `Start hour (0-23):`,
      default: String(current.startHour),
    });
    const endStr = await input({
      message: `End hour (0-23):`,
      default: String(current.endHour),
    });
    const lunchStartStr = await input({
      message: `Lunch start (HH:MM):`,
      default: current.lunchStart,
    });
    const lunchEndStr = await input({
      message: `Lunch end (HH:MM):`,
      default: current.lunchEnd,
    });

    const startHour = parseInt(startStr, 10);
    const endHour = parseInt(endStr, 10);

    if (startHour >= endHour) {
      console.error("Start hour must be before end hour.");
      process.exit(1);
    }

    config.schedule = { startHour, endHour, lunchStart: lunchStartStr, lunchEnd: lunchEndStr };
    saveConfig(config);

    const { getExpectedHours } = await import("../config/store.js");
    const workHours = getExpectedHours(config.schedule);

    console.log(chalk.green("\nWork schedule saved:"));
    console.log(`  Start: ${startHour}:00`);
    console.log(`  End:   ${endHour}:00`);
    console.log(`  Lunch: ${lunchStartStr} - ${lunchEndStr}`);
    console.log(chalk.bold(`  Expected: ${workHours.toFixed(1)}h / day`));
  });
