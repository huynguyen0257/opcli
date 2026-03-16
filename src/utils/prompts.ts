import { select, confirm, input, password } from "@inquirer/prompts";
import type { WorkPackage, Status } from "../api/openproject.js";

export async function promptCredentials(): Promise<{
  username: string;
  password: string;
}> {
  const username = await input({ message: "Username:" });
  const pwd = await password({ message: "Password:" });
  return { username, password: pwd };
}

export async function promptSelectTask(
  tasks: WorkPackage[]
): Promise<WorkPackage> {
  const chosen = await select({
    message: "Select a task:",
    choices: tasks.map((t) => ({
      name: `#${t.id} [${t.status}] ${t.subject}`,
      value: t,
    })),
  });
  return chosen;
}

export async function promptSelectStatus(
  statuses: Status[]
): Promise<Status> {
  const chosen = await select({
    message: "Select new status:",
    choices: statuses.map((s) => ({
      name: s.name,
      value: s,
    })),
  });
  return chosen;
}

export async function promptConfirmUpdate(
  task: WorkPackage,
  status: Status
): Promise<boolean> {
  return confirm({
    message: `Update #${task.id} "${task.subject}" → ${status.name}?`,
  });
}
