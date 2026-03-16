import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig, saveConfig, getConfigPath } from "../../src/config/store.js";

describe("config store", () => {
  const tmpDir = path.join(os.tmpdir(), "opcli-test-" + Date.now());
  const originalHome = process.env.HOME;

  beforeEach(() => {
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when no config file exists", () => {
    const config = loadConfig();
    expect(config).toBeNull();
  });

  it("saves and loads config with base64 encoded password", () => {
    saveConfig({
      url: "https://devtak.cbidigital.com",
      username: "admin",
      password: "secret123",
    });
    const config = loadConfig();
    expect(config).not.toBeNull();
    expect(config!.url).toBe("https://devtak.cbidigital.com");
    expect(config!.username).toBe("admin");
    expect(config!.password).toBe("secret123");
  });

  it("stores password as base64 in the file", () => {
    saveConfig({
      url: "https://devtak.cbidigital.com",
      username: "admin",
      password: "secret123",
    });
    const raw = JSON.parse(
      fs.readFileSync(getConfigPath(), "utf-8")
    );
    expect(raw.password).toBe(Buffer.from("secret123").toString("base64"));
  });
});
