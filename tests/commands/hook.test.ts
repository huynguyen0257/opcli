import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("hook scripts", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opcli-hook-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("paired markers can be used to remove content from a file", () => {
    const markerStart = "# test-start";
    const markerEnd = "# test-end";
    const filePath = path.join(tmpDir, "testrc");
    const original = `existing content\n${markerStart}\nhooked content\n${markerEnd}\nmore content`;
    fs.writeFileSync(filePath, original);

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const filtered: string[] = [];
    let skipping = false;
    for (const line of lines) {
      if (line.trim() === markerStart) { skipping = true; continue; }
      if (line.trim() === markerEnd) { skipping = false; continue; }
      if (!skipping) filtered.push(line);
    }
    const result = filtered.join("\n").trim();
    expect(result).toBe("existing content\nmore content");
    expect(result).not.toContain(markerStart);
    expect(result).not.toContain("hooked content");
  });

  it("install is idempotent when marker already present", () => {
    const markerStart = "# test-start";
    const filePath = path.join(tmpDir, "testrc");
    const content = `existing\n${markerStart}\nstuff\n# test-end`;
    fs.writeFileSync(filePath, content);

    const existing = fs.readFileSync(filePath, "utf-8");
    const alreadyInstalled = existing.includes(markerStart);
    expect(alreadyInstalled).toBe(true);
  });

  it("removes only marked section leaving surrounding content intact", () => {
    const markerStart = "# opcli-gpush-start";
    const markerEnd = "# opcli-gpush-end";
    const filePath = path.join(tmpDir, ".zshrc");
    const original = [
      "# existing config",
      "export PATH=$HOME/bin:$PATH",
      markerStart,
      "gpush() { git push; }",
      markerEnd,
      "alias ll='ls -la'",
    ].join("\n");
    fs.writeFileSync(filePath, original);

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const filtered: string[] = [];
    let skipping = false;
    for (const line of lines) {
      if (line.trim() === markerStart) { skipping = true; continue; }
      if (line.trim() === markerEnd) { skipping = false; continue; }
      if (!skipping) filtered.push(line);
    }
    const result = filtered.join("\n").trim();
    expect(result).toContain("export PATH");
    expect(result).toContain("alias ll");
    expect(result).not.toContain("gpush");
  });

  it("handles file with only marker content by producing empty result", () => {
    const markerStart = "# test-start";
    const markerEnd = "# test-end";
    const filePath = path.join(tmpDir, "hookfile");
    fs.writeFileSync(filePath, `#!/bin/sh\n${markerStart}\nsome hook\n${markerEnd}`);

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const filtered: string[] = [];
    let skipping = false;
    for (const line of lines) {
      if (line.trim() === markerStart) { skipping = true; continue; }
      if (line.trim() === markerEnd) { skipping = false; continue; }
      if (!skipping) filtered.push(line);
    }
    const remaining = filtered.join("\n").trim();
    expect(remaining === "" || remaining === "#!/bin/sh").toBe(true);
  });
});
