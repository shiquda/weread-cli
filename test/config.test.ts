import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("local config round-trips secrets outside the repo", async () => {
  const dir = mkdtempSync(join(tmpdir(), "weread-cli-config-"));
  const oldDir = process.env.WEREAD_CLI_CONFIG_DIR;
  process.env.WEREAD_CLI_CONFIG_DIR = dir;

  try {
    const config = await import(`../src/config.ts?case=${Date.now()}`);
    config.updateConfig({ apiKey: "wrk-test-token", baseUrl: "http://127.0.0.1:1", timeoutMs: 1234 });

    assert.equal(config.configPath(), join(dir, "config.json"));
    assert.deepEqual(config.readConfig(), {
      apiKey: "wrk-test-token",
      baseUrl: "http://127.0.0.1:1",
      timeoutMs: 1234
    });
    assert.equal(config.maskSecret("wrk-test-token"), "wrk-******oken");
  } finally {
    if (oldDir === undefined) delete process.env.WEREAD_CLI_CONFIG_DIR;
    else process.env.WEREAD_CLI_CONFIG_DIR = oldDir;
    rmSync(dir, { recursive: true, force: true });
  }
});
