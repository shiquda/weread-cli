import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("CLI config set-key initializes doctor from local config", async () => {
  const dir = mkdtempSync(join(tmpdir(), "weread-cli-e2e-"));
  const env = { ...process.env, WEREAD_CLI_CONFIG_DIR: dir, WEREAD_API_KEY: "" };

  try {
    await execFileAsync(process.execPath, ["--import", "tsx", "src/cli.ts", "--json", "config", "set-key", "wrk-local-test"], { env });
    const { stdout } = await execFileAsync(process.execPath, ["--import", "tsx", "src/cli.ts", "--json", "doctor"], { env });
    const parsed = JSON.parse(stdout) as { auth_configured: boolean; api_key_source: string; api_key_preview: string };

    assert.equal(parsed.auth_configured, true);
    assert.equal(parsed.api_key_source, "config");
    assert.equal(parsed.api_key_preview.includes("local-test"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
