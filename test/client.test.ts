import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { WereadClient, WereadError } from "../src/client.js";

test("client flattens params and appends skill_version", async () => {
  const received: unknown[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      received.push({
        authorization: req.headers.authorization,
        body: JSON.parse(body)
      });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ errcode: 0, books: [] }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const client = new WereadClient({
      apiKey: "wrk-test-token",
      baseUrl: `http://127.0.0.1:${address.port}`,
      timeoutMs: 5000
    });

    const result = await client.call("/store/search", { keyword: "三体", scope: 10, ignored: undefined });
    assert.equal(result.ok, true);
    assert.deepEqual(received, [
      {
        authorization: "Bearer wrk-test-token",
        body: {
          api_name: "/store/search",
          skill_version: "1.0.3",
          keyword: "三体",
          scope: 10
        }
      }
    ]);
  } finally {
    server.close();
  }
});

test("client treats upgrade_info as a hard stop", async () => {
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ upgrade_info: { message: "please upgrade" } }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const client = new WereadClient({
      apiKey: "wrk-test-token",
      baseUrl: `http://127.0.0.1:${address.port}`,
      timeoutMs: 5000
    });

    await assert.rejects(() => client.call("/_list"), (error) => {
      assert(error instanceof WereadError);
      assert.equal(error.exitCode, 3);
      assert.equal(error.failure.error.type, "upgrade_required");
      return true;
    });
  } finally {
    server.close();
  }
});

test("client retries transient HTTP 499 responses", async () => {
  let requests = 0;
  const server = createServer((_req, res) => {
    requests += 1;
    res.setHeader("content-type", "application/json");
    if (requests === 1) {
      res.statusCode = 499;
      res.end(JSON.stringify({ message: "timeout" }));
      return;
    }
    res.end(JSON.stringify({ errcode: 0, books: [] }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const client = new WereadClient({
      apiKey: "wrk-test-token",
      baseUrl: `http://127.0.0.1:${address.port}`,
      timeoutMs: 5000
    });

    const result = await client.call("/review/list", { bookId: "1" });
    assert.equal(result.ok, true);
    assert.equal(requests, 2);
  } finally {
    server.close();
  }
});
