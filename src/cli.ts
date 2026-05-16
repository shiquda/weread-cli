#!/usr/bin/env node
import { Command } from "commander";
import { WereadClient, WereadError, type GatewayParams } from "./client.js";
import { configPath, maskSecret, readConfig, updateConfig } from "./config.js";
import {
  collectParam,
  compactParams,
  intOption,
  jsonMode,
  optionalString,
  parseBodyJson,
  parseJsonValue,
  parseParams,
  scopeValue
} from "./options.js";
import {
  formatBookInfo,
  formatBookmarks,
  formatChapters,
  formatNotebooks,
  formatProgress,
  formatReadData,
  formatRecommendations,
  formatReviews,
  formatSearch,
  formatShelf,
  printJson,
  printResult
} from "./format.js";

const program = new Command();

program
  .name("weread")
  .description("基于微信读书官方支持 API 的命令行工具")
  .version("0.1.0")
  .option("--json", "emit JSON to stdout only");

program
  .command("doctor")
  .description("Check local CLI configuration without making an authenticated API call")
  .action(async function () {
    const client = new WereadClient();
    const payload = {
      ok: client.authConfigured(),
      ...client.config(),
      hint: client.authConfigured() ? "Ready." : "Set WEREAD_API_KEY=wrk-..."
    };
    if (jsonMode(this)) printJson(payload);
    else {
      process.stdout.write(
        [
          `Auth: ${payload.auth_configured ? "configured" : "missing"}`,
          `Base URL: ${payload.base_url}`,
          `Skill version: ${payload.skill_version}`,
          payload.hint
        ].join("\n") + "\n"
      );
    }
    if (!payload.ok) process.exitCode = 2;
  });

const config = program.command("config").description("Manage local credentials and defaults in ~/.weread-cli");

config
  .command("path")
  .description("Show the local config file path")
  .action(function () {
    const payload = { ok: true, path: configPath() };
    if (jsonMode(this)) printJson(payload);
    else process.stdout.write(`${payload.path}\n`);
  });

config
  .command("list")
  .description("Show local config with secrets redacted")
  .action(function () {
    const stored = readConfig();
    const payload = {
      ok: true,
      path: configPath(),
      api_key_configured: Boolean(stored.apiKey),
      api_key_preview: maskSecret(stored.apiKey),
      base_url: stored.baseUrl ?? null,
      timeout_ms: stored.timeoutMs ?? null
    };
    if (jsonMode(this)) printJson(payload);
    else {
      process.stdout.write(
        [
          `Path: ${payload.path}`,
          `API key: ${payload.api_key_configured ? payload.api_key_preview : "not configured"}`,
          `Base URL: ${payload.base_url ?? "default"}`,
          `Timeout: ${payload.timeout_ms ?? "default"}`
        ].join("\n") + "\n"
      );
    }
  });

config
  .command("set-key <apiKey>")
  .description("Store the WeRead API key in ~/.weread-cli/config.json")
  .action(function (apiKey: string) {
    if (!apiKey.startsWith("wrk-")) {
      throw new Error("API key should look like wrk-...");
    }
    const stored = updateConfig({ apiKey });
    const payload = {
      ok: true,
      path: configPath(),
      api_key_preview: maskSecret(stored.apiKey)
    };
    if (jsonMode(this)) printJson(payload);
    else process.stdout.write(`Saved API key to ${payload.path}\n`);
  });

config
  .command("set-base-url <url>")
  .description("Store a custom API base URL")
  .action(function (url: string) {
    const stored = updateConfig({ baseUrl: url });
    const payload = { ok: true, path: configPath(), base_url: stored.baseUrl };
    if (jsonMode(this)) printJson(payload);
    else process.stdout.write(`Saved base URL to ${payload.path}\n`);
  });

config
  .command("set-timeout <ms>")
  .description("Store request timeout in milliseconds")
  .action(function (ms: string) {
    const timeoutMs = intOption(ms, "ms");
    if (timeoutMs === undefined || timeoutMs <= 0) throw new Error("ms must be a positive integer");
    const stored = updateConfig({ timeoutMs });
    const payload = { ok: true, path: configPath(), timeout_ms: stored.timeoutMs };
    if (jsonMode(this)) printJson(payload);
    else process.stdout.write(`Saved timeout to ${payload.path}\n`);
  });

const api = program.command("api").description("Low-level official API commands");

api
  .command("list")
  .description("List supported APIs via /_list")
  .action(withClient(async function (client) {
    await runCall(this, client, "/_list", {});
  }));

api
  .command("call <apiName>")
  .description("Call any supported API with flattened parameters")
  .option("--body-json <json>", "JSON object merged into the request body")
  .option("--param <key=value>", "flattened parameter; may be repeated", collectParam, [])
  .action(withClient(async function (client, apiName: string, opts: { bodyJson?: string; param?: string[] }) {
    const params = { ...parseBodyJson(opts.bodyJson), ...parseParams(opts.param) };
    await runCall(this, client, apiName, params);
  }));

program
  .command("search <keyword>")
  .description("Search store content. Scope defaults to book when omitted by this CLI.")
  .option("--scope <scope>", "all|book|fiction|audio|author|fulltext|list|mp|article or numeric scope", "book")
  .option("--count <n>", "page size")
  .option("--max-idx <n>", "pagination offset from previous searchIdx")
  .action(withClient(async function (client, keyword: string, opts: { scope?: string; count?: string; maxIdx?: string }) {
    await runCall(
      this,
      client,
      "/store/search",
      compactParams({
        keyword,
        scope: scopeValue(opts.scope),
        count: intOption(opts.count, "--count"),
        maxIdx: intOption(opts.maxIdx, "--max-idx")
      }),
      formatSearch
    );
  }));

const book = program.command("book").description("Book information and reading progress");

book.command("info <bookId>").description("Get /book/info").action(withClient(async function (client, bookId: string) {
  await runCall(this, client, "/book/info", { bookId }, formatBookInfo);
}));

book.command("chapters <bookId>").description("Get /book/chapterinfo").action(withClient(async function (client, bookId: string) {
  await runCall(this, client, "/book/chapterinfo", { bookId }, formatChapters);
}));

book.command("progress <bookId>").description("Get /book/getprogress").action(withClient(async function (client, bookId: string) {
  await runCall(this, client, "/book/getprogress", { bookId }, formatProgress);
}));

program.command("shelf").description("Shelf management").command("list").description("Get /shelf/sync").action(withClient(async function (client) {
  await runCall(this, client, "/shelf/sync", {}, formatShelf);
}));

const readdata = program.command("readdata").description("Reading statistics");
readdata
  .command("detail")
  .description("Get /readdata/detail")
  .option("--mode <mode>", "weekly|monthly|annually|overall")
  .option("--base-time <timestamp>", "Unix timestamp inside the target period")
  .action(withClient(async function (client, opts: { mode?: string; baseTime?: string }) {
    await runCall(
      this,
      client,
      "/readdata/detail",
      compactParams({
        mode: optionalString(opts.mode),
        baseTime: intOption(opts.baseTime, "--base-time")
      }),
      formatReadData
    );
  }));

const notes = program.command("notes").description("Personal notes, highlights, and public highlight context");

notes
  .command("notebooks")
  .description("Get /user/notebooks")
  .option("--count <n>", "page size")
  .option("--last-sort <n>", "pagination cursor from previous books[].sort")
  .action(withClient(async function (client, opts: { count?: string; lastSort?: string }) {
    await runCall(
      this,
      client,
      "/user/notebooks",
      compactParams({
        count: intOption(opts.count, "--count"),
        lastSort: intOption(opts.lastSort, "--last-sort")
      }),
      formatNotebooks
    );
  }));

notes.command("bookmarks <bookId>").description("Get /book/bookmarklist").action(withClient(async function (client, bookId: string) {
  await runCall(this, client, "/book/bookmarklist", { bookId }, formatBookmarks);
}));

notes
  .command("mine <bookId>")
  .description("Get /review/list/mine")
  .option("--count <n>", "page size")
  .option("--synckey <n>", "pagination cursor")
  .action(withClient(async function (client, bookId: string, opts: { count?: string; synckey?: string }) {
    await runCall(
      this,
      client,
      "/review/list/mine",
      compactParams({
        bookid: bookId,
        count: intOption(opts.count, "--count"),
        synckey: intOption(opts.synckey, "--synckey")
      }),
      formatReviews
    );
  }));

notes
  .command("underlines <bookId> <chapterUid>")
  .description("Get /book/underlines")
  .option("--synckey <n>", "sync key")
  .action(withClient(async function (client, bookId: string, chapterUid: string, opts: { synckey?: string }) {
    await runCall(this, client, "/book/underlines", {
      bookId,
      chapterUid: intOption(chapterUid, "chapterUid"),
      synckey: intOption(opts.synckey, "--synckey")
    });
  }));

notes
  .command("best <bookId>")
  .description("Get /book/bestbookmarks")
  .option("--chapter-uid <n>", "chapter UID; default all chapters")
  .option("--synckey <n>", "sync key")
  .action(withClient(async function (client, bookId: string, opts: { chapterUid?: string; synckey?: string }) {
    await runCall(
      this,
      client,
      "/book/bestbookmarks",
      compactParams({
        bookId,
        chapterUid: intOption(opts.chapterUid, "--chapter-uid"),
        synckey: intOption(opts.synckey, "--synckey")
      }),
      formatBookmarks
    );
  }));

notes
  .command("readreviews <bookId> <chapterUid>")
  .description("Get /book/readreviews for one or more highlight ranges")
  .requiredOption("--reviews-json <json>", "array of {range,maxIdx,count,synckey}")
  .action(withClient(async function (client, bookId: string, chapterUid: string, opts: { reviewsJson: string }) {
    const reviews = parseJsonValue(opts.reviewsJson, "--reviews-json");
    if (!Array.isArray(reviews)) throw new Error("--reviews-json must be a JSON array");
    await runCall(this, client, "/book/readreviews", {
      bookId,
      chapterUid: intOption(chapterUid, "chapterUid"),
      reviews
    });
  }));

const reviews = program.command("reviews").description("Public and single review APIs");

reviews
  .command("list <bookId>")
  .description("Get /review/list")
  .option("--type <n>", "0 all, 1 recommended, 2 negative, 3 recent, 4 normal")
  .option("--count <n>", "page size")
  .option("--max-idx <n>", "pagination idx")
  .option("--synckey <n>", "pagination cursor")
  .action(withClient(async function (client, bookId: string, opts: { type?: string; count?: string; maxIdx?: string; synckey?: string }) {
    await runCall(
      this,
      client,
      "/review/list",
      compactParams({
        bookId,
        reviewListType: intOption(opts.type, "--type"),
        count: intOption(opts.count, "--count"),
        maxIdx: intOption(opts.maxIdx, "--max-idx"),
        synckey: intOption(opts.synckey, "--synckey")
      }),
      formatReviews
    );
  }));

reviews
  .command("single <reviewId>")
  .description("Get /review/single")
  .option("--comments-count <n>", "comment count")
  .option("--comments-direction <n>", "0 desc, 1 asc")
  .option("--likes-count <n>", "like count")
  .option("--likes-direction <n>", "like direction")
  .option("--synckey <n>", "sync key")
  .action(withClient(async function (client, reviewId: string, opts: Record<string, string | undefined>) {
    await runCall(
      this,
      client,
      "/review/single",
      compactParams({
        reviewId,
        commentsCount: intOption(opts.commentsCount, "--comments-count"),
        commentsDirection: intOption(opts.commentsDirection, "--comments-direction"),
        likesCount: intOption(opts.likesCount, "--likes-count"),
        likesDirection: intOption(opts.likesDirection, "--likes-direction"),
        synckey: intOption(opts.synckey, "--synckey")
      })
    );
  }));

const discover = program.command("discover").description("Book recommendations");

discover
  .command("recommend")
  .description("Get /book/recommend")
  .option("--count <n>", "page size")
  .option("--max-idx <n>", "pagination offset")
  .action(withClient(async function (client, opts: { count?: string; maxIdx?: string }) {
    await runCall(
      this,
      client,
      "/book/recommend",
      compactParams({
        count: intOption(opts.count, "--count"),
        maxIdx: intOption(opts.maxIdx, "--max-idx")
      }),
      formatRecommendations
    );
  }));

discover
  .command("similar <bookId>")
  .description("Get /book/similar")
  .option("--count <n>", "page size")
  .option("--max-idx <n>", "pagination offset")
  .option("--session-id <id>", "pagination sessionId")
  .action(withClient(async function (client, bookId: string, opts: { count?: string; maxIdx?: string; sessionId?: string }) {
    await runCall(
      this,
      client,
      "/book/similar",
      compactParams({
        bookId,
        count: intOption(opts.count, "--count"),
        maxIdx: intOption(opts.maxIdx, "--max-idx"),
        sessionId: optionalString(opts.sessionId)
      }),
      formatRecommendations
    );
  }));

const profile = program.command("profile").description("Convenience profile commands");
profile.command("summary").description("Currently aliases shelf list; use progress per book for detail").action(withClient(async function (client) {
  await runCall(this, client, "/shelf/sync", {}, formatShelf);
}));

if (process.argv.length <= 2) {
  program.outputHelp();
} else {
  program.exitOverride();
  program.parseAsync(process.argv).catch((error: unknown) => {
    const commanderError = error as { code?: string; message?: string };
    if (
      commanderError.code === "commander.helpDisplayed" ||
      commanderError.code === "commander.version" ||
      commanderError.code === "commander.outputHelp" ||
      commanderError.message === "(outputHelp)"
    ) {
      return;
    }
  if (error instanceof WereadError) {
    printFailure(error.failure);
    process.exitCode = error.exitCode;
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  printFailure({
    ok: false,
    skill_version: "1.0.3",
    error: {
      type: "invalid_input",
      message
    }
  });
  process.exitCode = 1;
  });
}

function withClient<T extends unknown[]>(
  handler: (this: Command, client: WereadClient, ...args: T) => Promise<void>
): (this: Command, ...args: T) => Promise<void> {
  return async function (...args: T) {
    const client = new WereadClient();
    await handler.apply(this, [client, ...args]);
  };
}

async function runCall(
  command: Command,
  client: WereadClient,
  apiName: string,
  params: GatewayParams,
  formatter?: (data: unknown) => string
): Promise<void> {
  try {
    const result = await client.call(apiName, params);
    if (jsonMode(command)) printJson(result);
    else printResult(result, formatter);
  } catch (error) {
    if (error instanceof WereadError) {
      printFailure(error.failure, jsonMode(command));
      process.exitCode = error.exitCode;
      return;
    }
    throw error;
  }
}

function printFailure(failure: unknown, asJson = true): void {
  if (asJson) {
    printJson(failure);
    return;
  }
  const message =
    failure && typeof failure === "object" && "error" in failure
      ? ((failure as { error?: { message?: string } }).error?.message ?? "Command failed")
      : "Command failed";
  process.stderr.write(`${message}\n`);
}
