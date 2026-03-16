import { execSync } from "child_process";
import crypto from "node:crypto";

export function getCurrentBranch(): string {
  return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
}

export function extractTaskId(branch: string): number | null {
  const match = branch.match(/\/op-(\d+)/);
  return match ? Number(match[1]) : null;
}

export function getRepoRoot(): string {
  return execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
}

export function getRepoHash(): string {
  const root = getRepoRoot();
  return crypto.createHash("md5").update(root).digest("hex");
}

export interface CommitInfo {
  hash: string;
  date: string;
  message: string;
  timestamp: number;
}

export function getCommitsOnBranch(): CommitInfo[] {
  const branch = getCurrentBranch();
  let range = branch;
  try {
    const base = execSync(`git merge-base main ${branch}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    range = `${base}..${branch}`;
  } catch {
    try {
      const base = execSync(`git merge-base master ${branch}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
      range = `${base}..${branch}`;
    } catch {
      // fallback: all commits on branch
    }
  }
  const log = execSync(`git log ${range} --format="%H|%at|%s" --reverse`, { encoding: "utf-8" }).trim();
  if (!log) return [];
  return log.split("\n").map((line) => {
    const [hash, ts, ...rest] = line.split("|");
    const timestamp = Number(ts);
    return {
      hash,
      date: new Date(timestamp * 1000).toISOString().substring(0, 10),
      message: rest.join("|"),
      timestamp,
    };
  });
}
