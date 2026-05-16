#!/usr/bin/env node
import { Command } from "commander";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { WereadClient, WereadError, type GatewayParams } from "./client.js";
import { configPath, maskSecret, readConfig, updateConfig } from "./config.js";
import {
  collectParam,
  compactMode,
  compactParams,
  intOption,
  jsonMode,
  optionalString,
  outputLimit,
  parseBodyJson,
  parseJsonValue,
  parseParams,
  positiveIntOption,
  scopeValue
} from "./options.js";
import {
  buildNotesExport,
  formatBookInfo,
  formatBookResolve,
  formatBookmarks,
  formatChapters,
  formatNotebooks,
  formatNotesTop,
  formatPopularBookmarks,
  formatProgress,
  formatReadData,
  formatRecommendations,
  formatReviews,
  formatSearch,
  formatShelfRecent,
  formatShelf,
  jsonView,
  markdownExport,
  printJson,
  printResult
} from "./format.js";

const program = new Command();
const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };

program
  .name("weread")
  .description("基于微信读书官方支持 API 的命令行工具")
  .version(packageJson.version)
  .option("--json", "emit JSON to stdout only")
  .option("--compact", "with --json, emit compact agent-friendly items where supported");

program
  .command("doctor")
  .description("Check local CLI configuration without making an authenticated API call")
  .action(async function () {
    const client = new WereadClient();
    const authConfigured = client.authConfigured();
    const payload = {
      ok: authConfigured,
      ...client.config(),
      hint: authConfigured ? "Ready." : "Set WEREAD_API_KEY=wrk-...",
      ...(!authConfigured
        ? {
            error: {
              type: "missing_auth",
              message: "WeRead API key is not configured. Run: weread config set-key <wrk-...>"
            }
          }
        : {})
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

function withOutputOptions(command: Command): Command {
  return command
    .option("--limit <n>", "maximum human-readable items to print")
    .option("--all", "print all returned items in human-readable output")
    .option("--compact", "with --json, emit compact agent-friendly items where supported");
}

program
  .command("search <keyword>")
  .description("Search store content. Scope defaults to book when omitted by this CLI.")
  .option("--scope <scope>", "all|book|fiction|audio|author|fulltext|list|mp|article or numeric scope", "book")
  .option("--count <n>", "page size")
  .option("--max-idx <n>", "pagination offset from previous searchIdx")
  .option("--limit <n>", "maximum human-readable results to print")
  .option("--all", "print all returned results in human-readable output")
  .option("--compact", "with --json, emit compact agent-friendly items")
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
      formatSearch,
      30
    );
  }));

const book = program.command("book").description("Book information and reading progress");

book.command("info <bookId>").description("Get /book/info").action(withClient(async function (client, bookId: string) {
  await runCall(this, client, "/book/info", { bookId }, formatBookInfo);
}));

withOutputOptions(book.command("chapters <bookId>").description("Get /book/chapterinfo")).action(withClient(async function (client, bookId: string) {
  await runCall(this, client, "/book/chapterinfo", { bookId }, formatChapters, 80);
}));

withOutputOptions(book.command("resolve <title>").description("Resolve a book title to likely bookId matches")).action(withClient(async function (client, title: string) {
  await runCall(this, client, "/store/search", { keyword: title, scope: scopeValue("book"), count: outputLimit(this.opts<{ limit?: string; all?: boolean }>(), 5) }, formatBookResolve, 5);
}));

book.command("progress <bookId>").description("Get /book/getprogress").action(withClient(async function (client, bookId: string) {
  await runCall(this, client, "/book/getprogress", { bookId }, formatProgress);
}));

const shelf = program.command("shelf").description("Shelf management");
withOutputOptions(shelf.command("list").description("Get /shelf/sync")).action(withClient(async function (client) {
  await runCall(this, client, "/shelf/sync", {}, formatShelf, 30);
}));

withOutputOptions(shelf.command("recent").description("Show recently read or updated shelf books")).action(withClient(async function (client) {
  const result = await client.call("/shelf/sync", {});
  const limit = outputLimit(this.optsWithGlobals<{ limit?: string; all?: boolean }>(), 10);
  const data = sortShelfRecentData(result.data, limit);
  await printSynthetic(this, "/shelf/recent", data, formatShelfRecent);
}));

const readdata = program.command("readdata").description("Reading statistics");
readdata
  .command("detail")
  .description("Get /readdata/detail")
  .option("--mode <mode>", "weekly|monthly|annually|overall")
  .option("--base-time <timestamp>", "Unix timestamp inside the target period")
  .option("--limit <n>", "maximum top reading records to print")
  .option("--all", "print all returned top reading records")
  .action(withClient(async function (client, opts: { mode?: string; baseTime?: string }) {
    await runCall(
      this,
      client,
      "/readdata/detail",
      compactParams({
        mode: optionalString(opts.mode),
        baseTime: intOption(opts.baseTime, "--base-time")
      }),
      formatReadData,
      10
    );
  }));

readdata
  .command("summary")
  .description("Summarize reading statistics; defaults to monthly")
  .option("--mode <mode>", "weekly|monthly|annually|overall", "monthly")
  .option("--base-time <timestamp>", "Unix timestamp inside the target period")
  .option("--limit <n>", "maximum top reading records to print")
  .option("--all", "print all returned top reading records")
  .action(withClient(async function (client, opts: { mode?: string; baseTime?: string }) {
    await runCall(
      this,
      client,
      "/readdata/detail",
      compactParams({
        mode: optionalString(opts.mode),
        baseTime: intOption(opts.baseTime, "--base-time")
      }),
      formatReadData,
      10
    );
  }));

const notes = program.command("notes").description("Personal notes, highlights, and public highlight context");

notes
  .command("notebooks")
  .description("Get /user/notebooks")
  .option("--count <n>", "page size")
  .option("--last-sort <n>", "pagination cursor from previous books[].sort")
  .option("--limit <n>", "maximum human-readable notebook books to print")
  .option("--all", "print all returned notebook books in human-readable output")
  .option("--compact", "with --json, emit compact agent-friendly items")
  .action(withClient(async function (client, opts: { count?: string; lastSort?: string }) {
    await runCall(
      this,
      client,
      "/user/notebooks",
      compactParams({
        count: intOption(opts.count, "--count"),
        lastSort: intOption(opts.lastSort, "--last-sort")
      }),
      formatNotebooks,
      50
    );
  }));

withOutputOptions(notes.command("bookmarks <bookId>").description("Get /book/bookmarklist")).action(withClient(async function (client, bookId: string) {
  await runCall(this, client, "/book/bookmarklist", { bookId }, formatBookmarks, 80);
}));

notes
  .command("top")
  .description("Rank notebook books by personal highlight/note count")
  .option("--limit <n>", "maximum books to print", "20")
  .option("--all", "fetch and rank all notebook pages")
  .option("--compact", "with --json, emit compact agent-friendly items")
  .action(withClient(async function (client, opts: { limit?: string; all?: boolean }) {
    const limit = positiveIntOption(opts.limit, "--limit") ?? 20;
    const data = opts.all ? await fetchAllNotebooks(client) : (await client.call("/user/notebooks", { count: Math.max(limit, 100) })).data;
    const sorted = sortNotebookData(data);
    await printSynthetic(this, "/user/notebooks", limitNotebookData(sorted, limit), formatNotesTop);
  }));

notes
  .command("export <bookId>")
  .description("Export one book's personal highlights and ideas")
  .option("--format <format>", "markdown|json", "markdown")
  .option("--output <path>", "write export to a file")
  .option("--all", "fetch all personal idea pages when pagination is available")
  .option("--compact", "omit lower-value fields from the export")
  .action(withClient(async function (client, bookId: string, opts: { format?: string; output?: string; all?: boolean; compact?: boolean }) {
    const format = opts.format ?? "markdown";
    if (format !== "markdown" && format !== "json") throw new Error("--format must be markdown or json");
    const [bookInfo, chapters, bookmarks, mine] = await Promise.all([
      client.call("/book/info", { bookId }),
      client.call("/book/chapterinfo", { bookId }),
      client.call("/book/bookmarklist", { bookId }),
      opts.all ? fetchAllMineReviews(client, bookId) : client.call("/review/list/mine", { bookid: bookId, count: 100 }).then((result) => result.data)
    ]);
    const exported = buildNotesExport(bookId, bookInfo.data, chapters.data, bookmarks.data, mine, Boolean(opts.compact || compactMode(this)));
    const content = format === "json" || jsonMode(this) ? `${JSON.stringify({ ok: true, data: exported }, null, 2)}\n` : markdownExport(exported);
    if (opts.output) {
      writeFileSync(opts.output, content, "utf8");
      const payload = { ok: true, path: opts.output, format, highlights: exported.highlights.length, ideas: exported.ideas.length };
      if (jsonMode(this)) printJson(payload);
      else process.stdout.write(`Wrote ${format} export to ${opts.output}\n`);
      return;
    }
    process.stdout.write(content);
  }));

notes
  .command("mine <bookId>")
  .description("Get /review/list/mine")
  .option("--count <n>", "page size")
  .option("--synckey <n>", "pagination cursor")
  .option("--limit <n>", "maximum human-readable reviews to print")
  .option("--all", "print all returned reviews in human-readable output")
  .option("--compact", "with --json, emit compact agent-friendly items")
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
      formatReviews,
      30
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
  .option("--limit <n>", "maximum human-readable highlights to print")
  .option("--all", "print all returned highlights in human-readable output")
  .option("--compact", "with --json, emit compact agent-friendly items")
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
      formatPopularBookmarks,
      80
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
  .option("--limit <n>", "maximum human-readable reviews to print")
  .option("--all", "print all returned reviews in human-readable output")
  .option("--compact", "with --json, emit compact agent-friendly items")
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
      formatReviews,
      30
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
  .option("--limit <n>", "maximum human-readable recommendations to print")
  .option("--all", "print all returned recommendations in human-readable output")
  .option("--compact", "with --json, emit compact agent-friendly items")
  .action(withClient(async function (client, opts: { count?: string; maxIdx?: string }) {
    await runCall(
      this,
      client,
      "/book/recommend",
      compactParams({
        count: intOption(opts.count, "--count"),
        maxIdx: intOption(opts.maxIdx, "--max-idx")
      }),
      formatRecommendations,
      30
    );
  }));

discover
  .command("similar <bookId>")
  .description("Get /book/similar")
  .option("--count <n>", "page size")
  .option("--max-idx <n>", "pagination offset")
  .option("--session-id <id>", "pagination sessionId")
  .option("--limit <n>", "maximum human-readable recommendations to print")
  .option("--all", "print all returned recommendations in human-readable output")
  .option("--compact", "with --json, emit compact agent-friendly items")
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
      formatRecommendations,
      30
    );
  }));

const profile = program.command("profile").description("Convenience profile commands");
profile.command("summary").description("Currently aliases shelf list; use progress per book for detail").action(withClient(async function (client) {
  await runCall(this, client, "/shelf/sync", {}, formatShelf, 30);
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
  formatter?: (data: unknown, options: { limit?: number }) => string,
  defaultLimit?: number
): Promise<void> {
  try {
    const result = await client.call(apiName, params);
    if (jsonMode(command)) {
      const view = jsonView(apiName, result.data, compactMode(command));
      printJson({
        ...result,
        data: view.data,
        ...(view.items !== undefined ? { items: view.items, totalCount: view.totalCount } : {}),
        ...(view.empty_reason ? { empty_reason: view.empty_reason } : {})
      });
    } else printResult(result, formatter, displayOptions(command, defaultLimit));
  } catch (error) {
    if (error instanceof WereadError) {
      printFailure(error.failure, jsonMode(command));
      process.exitCode = error.exitCode;
      return;
    }
    throw error;
  }
}

async function printSynthetic(
  command: Command,
  apiName: string,
  data: unknown,
  formatter: (data: unknown, options: { limit?: number }) => string,
  defaultLimit?: number
): Promise<void> {
  if (jsonMode(command)) {
    const view = jsonView(apiName, data, compactMode(command));
    printJson({
      ok: true,
      api_name: apiName,
      skill_version: "1.0.3",
      data: view.data,
      ...(view.items !== undefined ? { items: view.items, totalCount: view.totalCount } : {}),
      ...(view.empty_reason ? { empty_reason: view.empty_reason } : {})
    });
    return;
  }
  printResult({ ok: true, api_name: apiName, skill_version: "1.0.3", data }, formatter, displayOptions(command, defaultLimit));
}

function displayOptions(command: Command, defaultLimit?: number): { limit?: number } {
  return { limit: defaultLimit === undefined ? undefined : outputLimit(command.optsWithGlobals<{ limit?: string; all?: boolean }>(), defaultLimit) };
}

async function fetchAllNotebooks(client: WereadClient): Promise<unknown> {
  const books: unknown[] = [];
  let lastSort: number | undefined;
  let lastPage: unknown = {};
  for (let page = 0; page < 50; page += 1) {
    const result = await client.call("/user/notebooks", compactParams({ count: 100, lastSort }));
    lastPage = result.data;
    const pageBooks = arrayField(result.data, "books");
    books.push(...pageBooks);
    const hasMore = objectField(result.data, "hasMore") === 1;
    const nextSort = numberField(pageBooks.at(-1), "sort");
    if (!hasMore || nextSort === undefined || nextSort === lastSort) break;
    lastSort = nextSort;
  }
  return { ...(isRecord(lastPage) ? lastPage : {}), books, totalBookCount: Math.max(numberField(lastPage, "totalBookCount") ?? 0, books.length) };
}

async function fetchAllMineReviews(client: WereadClient, bookId: string): Promise<unknown> {
  const reviews: unknown[] = [];
  let synckey: number | undefined;
  let lastPage: unknown = {};
  for (let page = 0; page < 50; page += 1) {
    const result = await client.call("/review/list/mine", compactParams({ bookid: bookId, count: 100, synckey }));
    lastPage = result.data;
    const pageReviews = arrayField(result.data, "reviews");
    reviews.push(...pageReviews);
    const nextSynckey = numberField(result.data, "synckey");
    const hasMore = objectField(result.data, "hasMore") === 1 || (pageReviews.length > 0 && nextSynckey !== undefined && nextSynckey !== synckey);
    if (!hasMore) break;
    synckey = nextSynckey;
  }
  return { ...(isRecord(lastPage) ? lastPage : {}), reviews };
}

function sortNotebookData(data: unknown): unknown {
  const books = arrayField(data, "books").slice().sort((a, b) => noteTotal(b) - noteTotal(a));
  return { ...(isRecord(data) ? data : {}), books };
}

function limitNotebookData(data: unknown, limit: number): unknown {
  const books = arrayField(data, "books");
  return {
    ...(isRecord(data) ? data : {}),
    books: books.slice(0, limit),
    totalBookCount: Math.max(numberField(data, "totalBookCount") ?? 0, books.length)
  };
}

function sortShelfRecentData(data: unknown, limit: number | undefined): unknown {
  const books = arrayField(data, "books").slice().sort((a, b) => recentTimestamp(b) - recentTimestamp(a));
  return {
    ...(isRecord(data) ? data : {}),
    books: limit === undefined ? books : books.slice(0, limit),
    totalBookCount: Math.max(numberField(data, "totalBookCount") ?? 0, books.length)
  };
}

function noteTotal(item: unknown): number {
  return Number(objectField(item, "reviewCount") ?? 0) + Number(objectField(item, "noteCount") ?? 0) + Number(objectField(item, "bookmarkCount") ?? 0);
}

function recentTimestamp(book: unknown): number {
  for (const key of ["lastReadTime", "readUpdateTime", "updateTime", "finishReadingTime", "sort"]) {
    const value = objectField(book, key);
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function arrayField(value: unknown, key: string): unknown[] {
  const raw = objectField(value, key);
  return Array.isArray(raw) ? raw : [];
}

function numberField(value: unknown, key: string): number | undefined {
  const raw = objectField(value, key);
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function objectField(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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
