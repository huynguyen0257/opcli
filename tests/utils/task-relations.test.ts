import { describe, expect, it } from "vitest";
import {
  normalizeRelationType,
  validateRelationInput,
  relationTypeChoices,
} from "../../src/utils/task-relations.js";

describe("normalizeRelationType", () => {
  it("maps friendly aliases to OpenProject relation keys", () => {
    expect(normalizeRelationType("related to")).toBe("relates");
    expect(normalizeRelationType("predecessor")).toBe("follows");
    expect(normalizeRelationType("successor")).toBe("precedes");
    expect(normalizeRelationType("duplicated by")).toBe("duplicated");
    expect(normalizeRelationType("part of")).toBe("partof");
    expect(normalizeRelationType("create new child")).toBe("create-child");
  });
});

describe("validateRelationInput", () => {
  it("requires --to for non-child creation relation types", () => {
    expect(() => validateRelationInput({ type: "relates" })).toThrow("--to is required");
  });

  it("requires --name for create-child", () => {
    expect(() => validateRelationInput({ type: "create-child" })).toThrow("--name is required");
  });

  it("requires --project for create-child", () => {
    expect(() => validateRelationInput({ type: "create-child", name: "Post-release QA" })).toThrow("--project is required");
  });
});

describe("relationTypeChoices", () => {
  it("includes create new child and related hierarchy labels", () => {
    expect(relationTypeChoices.map((choice) => choice.label)).toContain("Create new child");
    expect(relationTypeChoices.map((choice) => choice.label)).toContain("Parent");
  });
});
