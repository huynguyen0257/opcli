import { describe, it, expect, vi } from "vitest";
import {
  buildRelationSuccessMessage,
  buildSearchActionChoices,
  formatTasksTable,
  runRelateFlow,
} from "../../src/commands/tasks.js";

async function runTasksUpdateCommand(args: string[]) {
  vi.resetModules();

  const mockClient = {
    getWorkPackage: vi.fn().mockResolvedValue({
      id: 56140,
      subject: "Old title",
      lockVersion: 1,
      status: "New",
      priority: "Normal",
      assignee: "Unassigned",
      createdAt: "",
      updatedAt: "",
      description: "",
      descriptionHtml: "",
      author: "Author",
      project: "Project",
      type: "Task",
      startDate: "",
      dueDate: "",
      doneRatio: 0,
    }),
    updateWorkPackage: vi.fn().mockResolvedValue(undefined),
    getAvailableStatuses: vi.fn().mockResolvedValue([]),
    searchUsers: vi.fn().mockResolvedValue([]),
    logTime: vi.fn().mockResolvedValue(undefined),
  };

  vi.doMock("../../src/config/store.js", () => ({
    loadConfig: () => ({
      url: "https://devtak.cbidigital.com",
      username: "admin",
      password: "secret",
      session: "test-session-id",
    }),
  }));
  vi.doMock("../../src/api/openproject.js", () => ({
    OpenProjectClient: vi.fn(() => mockClient),
  }));

  const output = {
    logs: [] as string[],
    errors: [] as string[],
  };

  const logSpy = vi.spyOn(console, "log").mockImplementation((...parts: any[]) => {
    output.logs.push(parts.join(" "));
  });
  const errorSpy = vi.spyOn(console, "error").mockImplementation((...parts: any[]) => {
    output.errors.push(parts.join(" "));
  });
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    const lastError = output.errors[output.errors.length - 1];
    throw new Error(lastError || `process.exit(${code ?? 0})`);
  }) as any);

  try {
    const { tasksCommand } = await import("../../src/commands/tasks.js");
    await tasksCommand.parseAsync(["update", ...args], { from: "user" });
    return { mockClient, ...output };
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    vi.doUnmock("../../src/config/store.js");
    vi.doUnmock("../../src/api/openproject.js");
  }
}

describe("formatTasksTable", () => {
  it("formats work packages as a table string", () => {
    const tasks = [
      { id: 1234, subject: "Fix login bug", status: "In Progress", priority: "High", assignee: "thuchuynh", lockVersion: 1, createdAt: "2026-03-10T10:00:00Z", updatedAt: "2026-03-12T10:00:00Z", startDate: "2026-03-10", dueDate: "2026-03-15" },
      { id: 1235, subject: "Add dashboard", status: "New", priority: "Normal", assignee: "Unassigned", lockVersion: 2, createdAt: "2026-03-09T10:00:00Z", updatedAt: "2026-03-11T10:00:00Z", startDate: "", dueDate: "" },
    ];
    const output = formatTasksTable(tasks);
    expect(output).toContain("1234");
    expect(output).toContain("Fix login bug");
    expect(output).toContain("In Progress");
    expect(output).toContain("High");
  });
});

describe("buildRelationSuccessMessage", () => {
  it("formats success output for a relation to an existing work package", () => {
    expect(
      buildRelationSuccessMessage({
        sourceId: 54907,
        typeLabel: "Related to",
        targetId: 54559,
        targetTitle: "Review & Deploy Bug UFO Sale Item Rithum",
      })
    ).toContain("#54559");
  });
});

describe("runRelateFlow", () => {
  it("creates a normal relation when all required flags are provided", async () => {
    const createRelation = vi.fn();
    const getWorkPackage = vi
      .fn()
      .mockResolvedValueOnce({ id: 54907, subject: "Release Production Rithum Bug" })
      .mockResolvedValueOnce({ id: 54559, subject: "Review & Deploy Bug UFO Sale Item Rithum" });

    await runRelateFlow(
      { getWorkPackage, createRelation } as any,
      54907,
      { type: "relates", to: 54559, description: "release follow-up", confirmSource: true }
    );

    expect(createRelation).toHaveBeenCalledWith(54907, {
      type: "relates",
      toWorkPackageId: 54559,
      description: "release follow-up",
    });
  });

  it("maps child to a real parent hierarchy update on the current ticket", async () => {
    const updateWorkPackage = vi.fn();
    const getWorkPackage = vi
      .fn()
      .mockResolvedValueOnce({ id: 55751, subject: "Child ticket", lockVersion: 7 })
      .mockResolvedValueOnce({ id: 55750, subject: "Parent ticket" });

    await runRelateFlow(
      { getWorkPackage, updateWorkPackage } as any,
      55751,
      { type: "child", to: 55750, confirmSource: true }
    );

    expect(updateWorkPackage).toHaveBeenCalledWith(55751, 7, {
      parent: "/api/v3/work_packages/55750",
    });
  });

  it("maps parent to the same real parent hierarchy update on the current ticket", async () => {
    const updateWorkPackage = vi.fn();
    const getWorkPackage = vi
      .fn()
      .mockResolvedValueOnce({ id: 55751, subject: "Child ticket", lockVersion: 7 })
      .mockResolvedValueOnce({ id: 55750, subject: "Parent ticket" });

    await runRelateFlow(
      { getWorkPackage, updateWorkPackage } as any,
      55751,
      { type: "parent", to: 55750, confirmSource: true }
    );

    expect(updateWorkPackage).toHaveBeenCalledWith(55751, 7, {
      parent: "/api/v3/work_packages/55750",
    });
  });

  it("resolves me to a concrete assignee href when creating a child", async () => {
    const createWorkPackage = vi.fn().mockResolvedValue(55751);
    const getWorkPackage = vi.fn().mockResolvedValue({ id: 55750, subject: "Parent ticket" });
    const listProjects = vi.fn().mockResolvedValue([{ id: 82, name: "Conative PaaS", href: "/api/v3/projects/82" }]);
    const getMe = vi.fn().mockResolvedValue({ id: 99, login: "tommy" });

    await runRelateFlow(
      { getWorkPackage, createWorkPackage, listProjects, getMe } as any,
      55750,
      {
        type: "create-child",
        name: "Child ticket",
        project: "Conative PaaS",
        assignee: "me",
        confirmSource: true,
      }
    );

    expect(createWorkPackage).toHaveBeenCalledWith({
      subject: "Child ticket",
      project: "/api/v3/projects/82",
      assignee: "/api/v3/users/99",
      description: undefined,
      parent: "/api/v3/work_packages/55750",
    });
  });
});

describe("buildSearchActionChoices", () => {
  it("includes Relate in the interactive task action menu", () => {
    expect(buildSearchActionChoices().map((choice) => choice.value)).toContain("relate");
  });
});

describe("tasks update title option", () => {
  it("tasks update forwards --title to updateWorkPackage", async () => {
    const { mockClient } = await runTasksUpdateCommand(["56140", "--title", "[ITG-18-003] New title"]);

    expect(mockClient.updateWorkPackage).toHaveBeenCalledWith(56140, 1, {
      subject: "[ITG-18-003] New title",
    });
  });

  it("tasks update rejects whitespace-only --title values", async () => {
    await expect(
      runTasksUpdateCommand(["56140", "--title", "   "]),
    ).rejects.toThrow("--title cannot be empty");
  });

  it("tasks update prints title change in change summary", async () => {
    const { logs } = await runTasksUpdateCommand(["56140", "--title", "[ITG-18-003] New title"]);

    expect(logs.some((line) => line.includes("Title → [ITG-18-003] New title"))).toBe(true);
  });
});
