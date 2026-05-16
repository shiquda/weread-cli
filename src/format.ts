import type { GatewaySuccess } from "./client.js";

export interface FormatOptions {
  limit?: number;
}

export interface JsonView {
  data: unknown;
  items?: unknown[];
  totalCount?: number;
  empty_reason?: string;
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printResult(result: GatewaySuccess, formatter?: (data: unknown, options: FormatOptions) => string, options: FormatOptions = {}): void {
  if (formatter) {
    const formatted = formatter(result.data, options);
    if (formatted.trim()) {
      process.stdout.write(`${formatted.trimEnd()}\n`);
      return;
    }
  }
  printJson(result.data);
}

export function jsonView(apiName: string, data: unknown, compact: boolean): JsonView {
  const normalized = normalizedItems(apiName, data);
  if (!normalized) return { data };

  if (compact) {
    return {
      data: normalized.items,
      items: normalized.items,
      totalCount: normalized.totalCount,
      empty_reason: normalized.emptyReason
    };
  }

  return {
    data: addNormalizedFields(data, normalized),
    items: normalized.items,
    totalCount: normalized.totalCount,
    empty_reason: normalized.emptyReason
  };
}

export function formatSearch(data: unknown, options: FormatOptions = {}): string {
  const groups = asArray(field(data, "results"));
  if (!groups.length) return "No results.";
  const lines: string[] = [];
  let index = 1;
  for (const group of groups) {
    const title = stringField(group, "title") ?? `scope ${field(group, "scope") ?? ""}`.trim();
    lines.push(`## ${title}`);
    const books = asArray(field(group, "books"));
    const visible = takeLimit(books, options.limit);
    for (const item of visible) {
      const book = bookInfoFromSearchItem(item);
      const title = stringField(book, "title") ?? stringField(book, "name") ?? "(untitled)";
      const author = stringField(book, "author") ?? stringField(book, "authorName") ?? "";
      const bookId = stringField(book, "bookId") ?? stringField(book, "albumId") ?? "";
      const rating = ratingText(field(item, "newRating") ?? field(book, "newRating"));
      const readingCount = field(item, "readingCount");
      const parts = [author, bookId && `id ${bookId}`, rating, readingCount !== undefined && `${readingCount}人在读`].filter(Boolean);
      lines.push(`${index}. ${title}${parts.length ? ` - ${parts.join(" | ")}` : ""}`);
      index += 1;
    }
    lines.push(...truncateHint("results", visible.length, books.length));
  }
  if (field(data, "hasMore") === 1) lines.push("More results are available; use the last searchIdx as --max-idx.");
  return lines.join("\n");
}

export function formatShelf(data: unknown, options: FormatOptions = {}): string {
  const books = asArray(field(data, "books"));
  const albums = asArray(field(data, "albums"));
  const mp = field(data, "mp");
  const total = books.length + albums.length + (mp ? 1 : 0);
  const lines = [`Shelf has ${total} visible item(s): ${books.length} books + ${albums.length} albums${mp ? " + 1 article collection" : ""}.`];
  const listable = [
    ...books.map((item) => ({ type: "book", item })),
    ...albums.map((item) => ({ type: "album", item }))
  ];
  const visible = takeLimit(listable, options.limit);
  visible.forEach(({ type, item }, idx) => {
    if (type === "album") {
      const info = field(item, "albumInfo") ?? item;
      const title = stringField(info, "name") ?? "(untitled album)";
      const author = stringField(info, "authorName") ?? "";
      const albumId = stringField(info, "albumId") ?? "";
      lines.push(`${idx + 1}. [album] ${title}${author ? ` - ${author}` : ""}${albumId ? ` | id ${albumId}` : ""}`);
      return;
    }
    const title = stringField(item, "title") ?? "(untitled)";
    const author = stringField(item, "author") ?? "";
    const bookId = stringField(item, "bookId") ?? "";
    lines.push(`${idx + 1}. ${title}${author ? ` - ${author}` : ""}${bookId ? ` | id ${bookId}` : ""}`);
  });
  lines.push(...truncateHint("listable items", visible.length, listable.length));
  return lines.join("\n");
}

export function formatShelfRecent(data: unknown, options: FormatOptions = {}): string {
  const books = asArray(field(data, "books"))
    .slice()
    .sort((a, b) => recentTimestamp(b) - recentTimestamp(a));
  if (!books.length) return "No books returned.";
  const visible = takeLimit(books, options.limit);
  const lines = visible.map((book, idx) => {
    const title = stringField(book, "title") ?? "(untitled)";
    const author = stringField(book, "author") ?? "";
    const bookId = stringField(book, "bookId") ?? "";
    const updated = dateText(recentTimestamp(book));
    return `${idx + 1}. ${title}${author ? ` - ${author}` : ""}${bookId ? ` | id ${bookId}` : ""}${updated ? ` | ${updated}` : ""}`;
  });
  lines.push(...truncateHint("recent books", visible.length, books.length));
  return lines.join("\n");
}

export function formatBookInfo(data: unknown): string {
  const title = stringField(data, "title") ?? stringField(field(data, "book"), "title") ?? "(untitled)";
  const author = stringField(data, "author") ?? stringField(field(data, "book"), "author") ?? "";
  const bookId = stringField(data, "bookId") ?? stringField(field(data, "book"), "bookId") ?? "";
  const rating = ratingText(field(data, "newRating") ?? field(field(data, "book"), "newRating"));
  const intro = stringField(data, "intro") ?? stringField(field(data, "book"), "intro") ?? "";
  return [`${title}${author ? ` - ${author}` : ""}`, bookId && `id: ${bookId}`, rating && `rating: ${rating}`, intro && `\n${intro}`].filter(Boolean).join("\n");
}

export function formatBookResolve(data: unknown, options: FormatOptions = {}): string {
  const items = searchItems(data);
  if (!items.length) return "No matching books.";
  const visible = takeLimit(items, options.limit);
  const lines = visible.map((item, idx) => {
    const author = stringField(item, "author") ?? "";
    const bookId = stringField(item, "bookId") ?? "";
    return `${idx + 1}. ${stringField(item, "title") ?? "(untitled)"}${author ? ` - ${author}` : ""}${bookId ? ` | id ${bookId}` : ""}`;
  });
  lines.push(...truncateHint("matches", visible.length, items.length));
  return lines.join("\n");
}

export function formatChapters(data: unknown, options: FormatOptions = {}): string {
  const chapters = asArray(field(data, "chapters"));
  if (!chapters.length) return "No chapters returned.";
  const visible = takeLimit(chapters, options.limit);
  const lines = visible.map((chapter) => {
    const level = Number(field(chapter, "level") ?? 1);
    const indent = "  ".repeat(Math.max(0, level - 1));
    const title = stringField(chapter, "title") ?? "(untitled)";
    const uid = field(chapter, "chapterUid");
    return `${indent}- ${title}${uid !== undefined ? ` | chapterUid ${uid}` : ""}`;
  });
  lines.push(...truncateHint("chapters", visible.length, chapters.length));
  return lines.join("\n");
}

export function formatProgress(data: unknown): string {
  const book = field(data, "book") ?? data;
  const progress = field(book, "progress");
  const readTime = secondsText(field(book, "recordReadingTime"));
  const updated = dateText(field(book, "updateTime"));
  return [`Progress: ${progress ?? 0}%`, readTime && `Reading time: ${readTime}`, updated && `Last read: ${updated}`].filter(Boolean).join("\n");
}

export function formatReadData(data: unknown, options: FormatOptions = {}): string {
  const total = secondsText(field(data, "totalReadTime"));
  const avg = secondsText(field(data, "dayAverageReadTime"));
  const readDays = field(data, "readDays");
  const lines = [
    total && `Total read/listen time: ${total}`,
    readDays !== undefined && `Read days: ${readDays}`,
    avg && `Natural-day average: ${avg}`
  ].filter(Boolean) as string[];
  const longest = asArray(field(data, "readLongest"));
  if (longest.length) {
    lines.push("Top reading:");
    const visible = takeLimit(longest, options.limit);
    for (const item of visible) {
      const book = field(item, "book") ?? field(item, "albumInfo") ?? {};
      const title = stringField(book, "title") ?? stringField(book, "name") ?? "(untitled)";
      lines.push(`- ${title}: ${secondsText(field(item, "readTime")) ?? "0 minutes"}`);
    }
    lines.push(...truncateHint("reading records", visible.length, longest.length));
  }
  return lines.length ? lines.join("\n") : JSON.stringify(data, null, 2);
}

export function formatNotebooks(data: unknown, options: FormatOptions = {}): string {
  const books = asArray(field(data, "books"));
  const totalBookCount = numberField(data, "totalBookCount") ?? books.length;
  const lines = [`Notebook books: ${totalBookCount}; total notes: ${field(data, "totalNoteCount") ?? "unknown"}.`];
  const visible = takeLimit(books, options.limit);
  visible.forEach((item, idx) => {
    const book = field(item, "book") ?? item;
    const title = stringField(book, "title") ?? "(untitled)";
    const author = stringField(book, "author") ?? "";
    const total = noteTotal(item);
    const bookId = stringField(item, "bookId") ?? stringField(book, "bookId") ?? "";
    lines.push(`${idx + 1}. ${title}${author ? ` - ${author}` : ""} | notes ${total} | id ${bookId}`);
  });
  lines.push(...truncateHint("notebook books", visible.length, Math.max(totalBookCount, books.length)));
  if (field(data, "hasMore") === 1) lines.push("More notebooks are available; use the last sort value as --last-sort.");
  return lines.join("\n");
}

export function formatNotesTop(data: unknown, options: FormatOptions = {}): string {
  const books = asArray(field(data, "books"))
    .slice()
    .sort((a, b) => noteTotal(b) - noteTotal(a));
  if (!books.length) return "No notebook books returned.";
  const visible = takeLimit(books, options.limit);
  const lines = visible.map((item, idx) => {
    const book = field(item, "book") ?? item;
    const title = stringField(book, "title") ?? "(untitled)";
    const author = stringField(book, "author") ?? "";
    const bookId = stringField(item, "bookId") ?? stringField(book, "bookId") ?? "";
    return `${idx + 1}. ${title}${author ? ` - ${author}` : ""} | notes ${noteTotal(item)} | id ${bookId}`;
  });
  lines.push(...truncateHint("notebook books", visible.length, books.length));
  return lines.join("\n");
}

export function formatReviews(data: unknown, options: FormatOptions = {}): string {
  const reviews = asArray(field(data, "reviews"));
  if (!reviews.length) return JSON.stringify(emptyJson(data, "no_reviews"), null, 2);
  const visible = takeLimit(reviews, options.limit);
  const lines = visible.map((item, idx) => {
    const review = reviewPayload(item);
    const author = stringField(field(review, "author"), "name") ?? "";
    const content = (stringField(review, "content") ?? stringField(review, "abstract") ?? "").replace(/\s+/g, " ").slice(0, 220);
    const star = starText(field(review, "star"));
    return `${idx + 1}. ${author}${star ? ` ${star}` : ""}\n${content}`;
  });
  lines.push(...truncateHint("reviews", visible.length, reviews.length));
  return lines.join("\n\n");
}

export function formatBookmarks(data: unknown, options: FormatOptions = {}): string {
  const marks = asArray(field(data, "updated"));
  if (!marks.length) return JSON.stringify(emptyJson(data, "no_highlights"), null, 2);
  const visible = takeLimit(marks, options.limit);
  const lines = visible.map((mark, idx) => {
    const chapterUid = field(mark, "chapterUid");
    const text = stringField(mark, "markText") ?? "";
    return `${idx + 1}. chapterUid ${chapterUid ?? "?"}\n> ${text}`;
  });
  lines.push(...truncateHint("highlights", visible.length, marks.length));
  return lines.join("\n\n");
}

export function formatRecommendations(data: unknown, options: FormatOptions = {}): string {
  const books = recommendationItems(data);
  if (!books.length) return JSON.stringify(emptyJson(data, "no_recommendations"), null, 2);
  const visible = takeLimit(books, options.limit);
  const lines = visible.map((book, idx) => {
    const title = stringField(book, "title") ?? "(untitled)";
    const author = stringField(book, "author") ?? "";
    const bookId = stringField(book, "bookId") ?? "";
    const reason = stringField(book, "reason") ?? "";
    return `${idx + 1}. ${title}${author ? ` - ${author}` : ""}${bookId ? ` | id ${bookId}` : ""}${reason ? `\n   ${reason}` : ""}`;
  });
  lines.push(...truncateHint("recommendations", visible.length, books.length));
  return lines.join("\n");
}

export function markdownExport(exportData: BookNotesExport): string {
  const lines = [`# ${exportData.book.title ?? exportData.book.bookId}`, ""];
  if (exportData.book.author) lines.push(`Author: ${exportData.book.author}`, "");
  if (exportData.highlights.length) {
    lines.push("## Highlights", "");
    for (const item of exportData.highlights) {
      lines.push(`### ${item.chapterTitle ?? `chapterUid ${item.chapterUid ?? "?"}`}`, "");
      lines.push(`> ${item.text}`, "");
    }
  }
  if (exportData.ideas.length) {
    lines.push("## Ideas", "");
    for (const item of exportData.ideas) {
      if (item.chapterTitle) lines.push(`### ${item.chapterTitle}`, "");
      lines.push(item.content, "");
    }
  }
  return lines.join("\n").trimEnd() + "\n";
}

export interface BookNotesExport {
  book: {
    bookId: string;
    title?: string;
    author?: string;
  };
  highlights: Array<{
    chapterUid?: number | string;
    chapterTitle?: string;
    text: string;
    createTime?: number | string;
  }>;
  ideas: Array<{
    reviewId?: string;
    chapterUid?: number | string;
    chapterTitle?: string;
    content: string;
    createTime?: number | string;
  }>;
  byChapter: Array<{
    chapterUid?: number | string;
    chapterTitle?: string;
    highlights: unknown[];
    ideas: unknown[];
  }>;
}

export function buildNotesExport(bookId: string, bookInfo: unknown, chaptersData: unknown, bookmarksData: unknown, mineData: unknown, compact: boolean): BookNotesExport {
  const chapterMap = new Map<string, string>();
  for (const chapter of asArray(field(chaptersData, "chapters"))) {
    const uid = field(chapter, "chapterUid");
    const title = stringField(chapter, "title");
    if (uid !== undefined && title) chapterMap.set(String(uid), title);
  }

  const book = field(bookInfo, "book") ?? bookInfo;
  const highlights = asArray(field(bookmarksData, "updated")).map((mark) => {
    const chapterUid = field(mark, "chapterUid") as number | string | undefined;
    return compact
      ? {
          chapterTitle: chapterUid !== undefined ? chapterMap.get(String(chapterUid)) : undefined,
          text: stringField(mark, "markText") ?? "",
          createTime: field(mark, "createTime") as number | string | undefined
        }
      : {
          chapterUid,
          chapterTitle: chapterUid !== undefined ? chapterMap.get(String(chapterUid)) : undefined,
          text: stringField(mark, "markText") ?? "",
          createTime: field(mark, "createTime") as number | string | undefined
        };
  });

  const ideas = asArray(field(mineData, "reviews")).map((item) => {
    const review = reviewPayload(item);
    const chapterUid = field(review, "chapterUid") as number | string | undefined;
    return compact
      ? {
          chapterTitle: chapterUid !== undefined ? chapterMap.get(String(chapterUid)) : undefined,
          content: stringField(review, "content") ?? stringField(review, "abstract") ?? "",
          createTime: field(review, "createTime") as number | string | undefined
        }
      : {
          reviewId: stringField(review, "reviewId") ?? stringField(review, "reviewid"),
          chapterUid,
          chapterTitle: chapterUid !== undefined ? chapterMap.get(String(chapterUid)) : undefined,
          content: stringField(review, "content") ?? stringField(review, "abstract") ?? "",
          createTime: field(review, "createTime") as number | string | undefined
        };
  });

  const chapterKeys = new Set<string>();
  for (const item of highlights) if (item.chapterUid !== undefined) chapterKeys.add(String(item.chapterUid));
  for (const item of ideas) if (item.chapterUid !== undefined) chapterKeys.add(String(item.chapterUid));

  const byChapter = Array.from(chapterKeys).map((chapterUid) => ({
    chapterUid,
    chapterTitle: chapterMap.get(chapterUid),
    highlights: highlights.filter((item) => String(item.chapterUid) === chapterUid),
    ideas: ideas.filter((item) => String(item.chapterUid) === chapterUid)
  }));

  return {
    book: {
      bookId,
      title: stringField(book, "title"),
      author: stringField(book, "author")
    },
    highlights,
    ideas,
    byChapter
  };
}

function normalizedItems(apiName: string, data: unknown): { items: unknown[]; totalCount: number; emptyReason?: string } | null {
  if (apiName === "/store/search") {
    const items = searchItems(data);
    return { items, totalCount: items.length, emptyReason: items.length ? undefined : "no_search_results" };
  }
  if (apiName === "/book/bookmarklist" || apiName === "/book/bestbookmarks") {
    const items = bookmarkItems(data);
    return {
      items,
      totalCount: items.length,
      emptyReason: items.length ? undefined : apiName === "/book/bestbookmarks" ? "no_popular_highlights" : "no_highlights"
    };
  }
  if (apiName === "/review/list" || apiName === "/review/list/mine") {
    const items = reviewItems(data);
    return { items, totalCount: items.length, emptyReason: items.length ? undefined : "no_reviews" };
  }
  if (apiName === "/user/notebooks") {
    const items = notebookItems(data);
    return { items, totalCount: numberField(data, "totalBookCount") ?? items.length, emptyReason: items.length ? undefined : "no_notebooks" };
  }
  if (apiName === "/book/recommend" || apiName === "/book/similar") {
    const items = recommendationItems(data).map(bookItem);
    return { items, totalCount: items.length, emptyReason: items.length ? undefined : "no_recommendations" };
  }
  return null;
}

function addNormalizedFields(data: unknown, normalized: { items: unknown[]; totalCount: number; emptyReason?: string }): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      raw: data,
      items: normalized.items,
      totalCount: normalized.totalCount,
      ...(normalized.emptyReason ? { empty_reason: normalized.emptyReason } : {})
    };
  }
  return {
    ...(data as Record<string, unknown>),
    items: normalized.items,
    totalCount: normalized.totalCount,
    ...(normalized.emptyReason ? { empty_reason: normalized.emptyReason } : {})
  };
}

function emptyJson(data: unknown, reason: string): unknown {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return { ...(data as Record<string, unknown>), items: [], totalCount: 0, empty_reason: reason };
  }
  return { raw: data, items: [], totalCount: 0, empty_reason: reason };
}

function searchItems(data: unknown): unknown[] {
  const items: unknown[] = [];
  for (const group of asArray(field(data, "results"))) {
    for (const raw of asArray(field(group, "books"))) {
      const book = bookInfoFromSearchItem(raw);
      items.push({
        type: "book",
        bookId: stringField(book, "bookId") ?? stringField(book, "albumId"),
        title: stringField(book, "title") ?? stringField(book, "name"),
        author: stringField(book, "author") ?? stringField(book, "authorName"),
        searchIdx: field(raw, "searchIdx"),
        rating: field(raw, "newRating") ?? field(book, "newRating")
      });
    }
  }
  return items;
}

function bookmarkItems(data: unknown): unknown[] {
  return asArray(field(data, "updated")).map((mark) => ({
    chapterUid: field(mark, "chapterUid"),
    text: stringField(mark, "markText") ?? "",
    createTime: field(mark, "createTime")
  }));
}

function reviewItems(data: unknown): unknown[] {
  return asArray(field(data, "reviews")).map((item) => {
    const review = reviewPayload(item);
    return {
      reviewId: stringField(review, "reviewId") ?? stringField(review, "reviewid"),
      chapterUid: field(review, "chapterUid"),
      content: stringField(review, "content") ?? stringField(review, "abstract") ?? "",
      star: field(review, "star"),
      createTime: field(review, "createTime")
    };
  });
}

function notebookItems(data: unknown): unknown[] {
  return asArray(field(data, "books")).map((item) => {
    const book = field(item, "book") ?? item;
    return {
      bookId: stringField(item, "bookId") ?? stringField(book, "bookId"),
      title: stringField(book, "title"),
      author: stringField(book, "author"),
      bookmarkCount: numberField(item, "bookmarkCount") ?? 0,
      noteCount: numberField(item, "noteCount") ?? 0,
      reviewCount: numberField(item, "reviewCount") ?? 0,
      totalNotes: noteTotal(item),
      sort: field(item, "sort")
    };
  });
}

function recommendationItems(data: unknown): unknown[] {
  const direct = asArray(field(data, "books"));
  const similar = asArray(field(field(data, "booksimilar"), "books"));
  return direct.length ? direct : similar.map((item) => field(field(item, "book"), "bookInfo") ?? field(item, "book") ?? item);
}

function bookItem(book: unknown): unknown {
  return {
    type: "book",
    bookId: stringField(book, "bookId"),
    title: stringField(book, "title"),
    author: stringField(book, "author"),
    reason: stringField(book, "reason")
  };
}

function bookInfoFromSearchItem(item: unknown): unknown {
  return field(item, "bookInfo") ?? field(item, "book") ?? item;
}

function reviewPayload(item: unknown): unknown {
  return field(field(item, "review"), "review") ?? field(item, "review") ?? item;
}

function takeLimit<T>(items: T[], limit: number | undefined): T[] {
  return limit === undefined ? items : items.slice(0, limit);
}

function truncateHint(label: string, shown: number, total: number): string[] {
  if (shown >= total) return [];
  return [`Showing first ${shown} of ${total} ${label}. Use --json, --limit, or --all to get full data.`];
}

function noteTotal(item: unknown): number {
  return Number(field(item, "reviewCount") ?? 0) + Number(field(item, "noteCount") ?? 0) + Number(field(item, "bookmarkCount") ?? 0);
}

function recentTimestamp(book: unknown): number {
  for (const key of ["lastReadTime", "readUpdateTime", "updateTime", "finishReadingTime", "sort"]) {
    const value = field(book, key);
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function field(value: unknown, key: string): unknown {
  return value && typeof value === "object" && key in value ? (value as Record<string, unknown>)[key] : undefined;
}

function stringField(value: unknown, key: string): string | undefined {
  const raw = field(value, key);
  if (typeof raw === "string") return raw;
  if (typeof raw === "number") return String(raw);
  return undefined;
}

function numberField(value: unknown, key: string): number | undefined {
  const raw = field(value, key);
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function ratingText(value: unknown): string | undefined {
  if (typeof value !== "number") return undefined;
  return `${(value / 10).toFixed(1)}/10`;
}

function starText(value: unknown): string | undefined {
  if (typeof value !== "number" || value <= 0) return undefined;
  return `${Math.round(value / 20)}/5`;
}

function secondsText(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const totalMinutes = Math.floor(value / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function dateText(value: unknown): string | undefined {
  if (typeof value !== "number" || value <= 0) return undefined;
  return new Date(value * 1000).toISOString().slice(0, 10);
}
