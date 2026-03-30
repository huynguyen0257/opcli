export const relationTypeChoices = [
  { label: "Related to", value: "relates" },
  { label: "Predecessor", value: "follows" },
  { label: "Successor", value: "precedes" },
  { label: "Create new child", value: "create-child" },
  { label: "Child", value: "child" },
  { label: "Parent", value: "parent" },
  { label: "Duplicates", value: "duplicates" },
  { label: "Duplicated by", value: "duplicated" },
  { label: "Blocks", value: "blocks" },
  { label: "Blocked by", value: "blocked" },
  { label: "Includes", value: "includes" },
  { label: "Part of", value: "partof" },
  { label: "Requires", value: "requires" },
] as const;

const RELATION_TYPE_ALIASES: Record<string, string> = {
  relates: "relates",
  "related to": "relates",
  related: "relates",
  follows: "follows",
  predecessor: "follows",
  precedes: "precedes",
  successor: "precedes",
  "create-child": "create-child",
  "create new child": "create-child",
  child: "child",
  parent: "parent",
  duplicates: "duplicates",
  "duplicated by": "duplicated",
  duplicated: "duplicated",
  blocks: "blocks",
  "blocked by": "blocked",
  blocked: "blocked",
  includes: "includes",
  "part of": "partof",
  partof: "partof",
  requires: "requires",
};

export function normalizeRelationType(input: string): string | null {
  return RELATION_TYPE_ALIASES[input.trim().toLowerCase()] ?? null;
}

export function isCreateChildType(type: string): boolean {
  return type === "create-child";
}

export function relationTypeLabel(type: string): string {
  return relationTypeChoices.find((choice) => choice.value === type)?.label ?? type;
}

export function validateRelationInput(input: {
  type: string;
  to?: number;
  name?: string;
  project?: string;
}) {
  if (isCreateChildType(input.type)) {
    if (!input.name) {
      throw new Error("--name is required for create-child");
    }
    if (!input.project) {
      throw new Error("--project is required for create-child");
    }
    return;
  }

  if (!input.to) {
    throw new Error("--to is required for relation types that target an existing work package");
  }
}
