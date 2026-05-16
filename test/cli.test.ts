import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("CLI version follows package version", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["--import", "tsx", "src/cli.ts", "--version"]);
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  assert.equal(stdout.trim(), packageJson.version);
});

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

test("shelf recent compact JSON respects --limit and sorts by recency", async () => {
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        errcode: 0,
        books: [
          { bookId: "old", title: "Old", updateTime: 10 },
          { bookId: "new", title: "New", updateTime: 30 },
          { bookId: "mid", title: "Mid", updateTime: 20 }
        ]
      })
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const env = {
      ...process.env,
      WEREAD_API_KEY: "wrk-test-token",
      WEREAD_API_BASE_URL: `http://127.0.0.1:${address.port}`
    };
    const { stdout } = await execFileAsync(process.execPath, ["--import", "tsx", "src/cli.ts", "--json", "--compact", "shelf", "recent", "--limit", "2"], { env });
    const parsed = JSON.parse(stdout) as { items: Array<{ bookId: string }>; totalCount: number };

    assert.deepEqual(parsed.items.map((item) => item.bookId), ["new", "mid"]);
    assert.equal(parsed.totalCount, 3);
  } finally {
    server.close();
  }
});

test("notes top uses --all for fetching while --limit controls output", async () => {
  const pages = [
    {
      hasMore: 1,
      books: [
        { bookId: "a", book: { title: "A" }, bookmarkCount: 1, noteCount: 1, reviewCount: 0, sort: 20 },
        { bookId: "b", book: { title: "B" }, bookmarkCount: 5, noteCount: 0, reviewCount: 0, sort: 10 }
      ]
    },
    {
      hasMore: 0,
      books: [{ bookId: "c", book: { title: "C" }, bookmarkCount: 10, noteCount: 0, reviewCount: 0, sort: 5 }]
    }
  ];
  let requests = 0;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const parsed = JSON.parse(body) as { lastSort?: number };
      const page = parsed.lastSort === 10 ? pages[1] : pages[0];
      requests += 1;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ errcode: 0, totalBookCount: 3, ...page }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const env = {
      ...process.env,
      WEREAD_API_KEY: "wrk-test-token",
      WEREAD_API_BASE_URL: `http://127.0.0.1:${address.port}`
    };
    const { stdout } = await execFileAsync(process.execPath, ["--import", "tsx", "src/cli.ts", "--json", "--compact", "notes", "top", "--all", "--limit", "2"], { env });
    const parsed = JSON.parse(stdout) as { items: Array<{ bookId: string }>; totalCount: number };

    assert.equal(requests, 2);
    assert.deepEqual(parsed.items.map((item) => item.bookId), ["c", "b"]);
    assert.equal(parsed.totalCount, 3);
  } finally {
    server.close();
  }
});
