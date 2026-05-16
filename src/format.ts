import type { GatewaySuccess } from "./client.js";

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printResult(result: GatewaySuccess, formatter?: (data: unknown) => string): void {
  if (formatter) {
    const formatted = formatter(result.data);
    if (formatted.trim()) {
      process.stdout.write(`${formatted.trimEnd()}\n`);
      return;
    }
  }
  printJson(result.data);
}

export function formatSearch(data: unknown): string {
  const groups = asArray(field(data, "results"));
  if (!groups.length) return "No results.";
  const lines: string[] = [];
  let index = 1;
  for (const group of groups) {
    const title = stringField(group, "title") ?? `scope ${field(group, "scope") ?? ""}`.trim();
    lines.push(`## ${title}`);
    for (const item of asArray(field(group, "books"))) {
      const book = field(item, "bookInfo") ?? field(item, "book") ?? item;
      const title = stringField(book, "title") ?? stringField(book, "name") ?? "(untitled)";
      const author = stringField(book, "author") ?? stringField(book, "authorName") ?? "";
      const bookId = stringField(book, "bookId") ?? stringField(book, "albumId") ?? "";
      const rating = ratingText(field(item, "newRating") ?? field(book, "newRating"));
      const readingCount = field(item, "readingCount");
      const parts = [author, bookId && `id ${bookId}`, rating, readingCount !== undefined && `${readingCount}人在读`].filter(Boolean);
      lines.push(`${index}. ${title}${parts.length ? ` - ${parts.join(" | ")}` : ""}`);
      index += 1;
    }
  }
  if (field(data, "hasMore") === 1) lines.push("More results are available; use the last searchIdx as --max-idx.");
  return lines.join("\n");
}

export function formatShelf(data: unknown): string {
  const books = asArray(field(data, "books"));
  const albums = asArray(field(data, "albums"));
  const mp = field(data, "mp");
  const total = books.length + albums.length + (mp ? 1 : 0);
  const lines = [`Shelf has ${total} visible item(s): ${books.length} books + ${albums.length} albums${mp ? " + 1 article collection" : ""}.`];
  let index = 1;
  for (const book of books.slice(0, 30)) {
    const title = stringField(book, "title") ?? "(untitled)";
    const author = stringField(book, "author") ?? "";
    const bookId = stringField(book, "bookId") ?? "";
    lines.push(`${index}. ${title}${author ? ` - ${author}` : ""}${bookId ? ` | id ${bookId}` : ""}`);
    index += 1;
  }
  for (const album of albums.slice(0, Math.max(0, 30 - books.length))) {
    const info = field(album, "albumInfo") ?? album;
    const title = stringField(info, "name") ?? "(untitled album)";
    const author = stringField(info, "authorName") ?? "";
    const albumId = stringField(info, "albumId") ?? "";
    lines.push(`${index}. [album] ${title}${author ? ` - ${author}` : ""}${albumId ? ` | id ${albumId}` : ""}`);
    index += 1;
  }
  if (books.length + albums.length > 30) lines.push(`Showing first 30 of ${books.length + albums.length} listable items. Use --json for full data.`);
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

export function formatChapters(data: unknown): string {
  const chapters = asArray(field(data, "chapters"));
  if (!chapters.length) return "No chapters returned.";
  return chapters
    .slice(0, 80)
    .map((chapter) => {
      const level = Number(field(chapter, "level") ?? 1);
      const indent = "  ".repeat(Math.max(0, level - 1));
      const title = stringField(chapter, "title") ?? "(untitled)";
      const uid = field(chapter, "chapterUid");
      return `${indent}- ${title}${uid !== undefined ? ` | chapterUid ${uid}` : ""}`;
    })
    .join("\n");
}

export function formatProgress(data: unknown): string {
  const book = field(data, "book") ?? data;
  const progress = field(book, "progress");
  const readTime = secondsText(field(book, "recordReadingTime"));
  const updated = dateText(field(book, "updateTime"));
  return [`Progress: ${progress ?? 0}%`, readTime && `Reading time: ${readTime}`, updated && `Last read: ${updated}`].filter(Boolean).join("\n");
}

export function formatReadData(data: unknown): string {
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
    for (const item of longest.slice(0, 10)) {
      const book = field(item, "book") ?? field(item, "albumInfo") ?? {};
      const title = stringField(book, "title") ?? stringField(book, "name") ?? "(untitled)";
      lines.push(`- ${title}: ${secondsText(field(item, "readTime")) ?? "0 minutes"}`);
    }
  }
  return lines.length ? lines.join("\n") : JSON.stringify(data, null, 2);
}

export function formatNotebooks(data: unknown): string {
  const books = asArray(field(data, "books"));
  const lines = [`Notebook books: ${field(data, "totalBookCount") ?? books.length}; total notes: ${field(data, "totalNoteCount") ?? "unknown"}.`];
  books.slice(0, 50).forEach((item, idx) => {
    const book = field(item, "book") ?? item;
    const title = stringField(book, "title") ?? "(untitled)";
    const author = stringField(book, "author") ?? "";
    const total = Number(field(item, "reviewCount") ?? 0) + Number(field(item, "noteCount") ?? 0) + Number(field(item, "bookmarkCount") ?? 0);
    const bookId = stringField(item, "bookId") ?? stringField(book, "bookId") ?? "";
    lines.push(`${idx + 1}. ${title}${author ? ` - ${author}` : ""} | notes ${total} | id ${bookId}`);
  });
  if (field(data, "hasMore") === 1) lines.push("More notebooks are available; use the last sort value as --last-sort.");
  return lines.join("\n");
}

export function formatReviews(data: unknown): string {
  const reviews = asArray(field(data, "reviews"));
  if (!reviews.length) return JSON.stringify(data, null, 2);
  return reviews
    .slice(0, 30)
    .map((item, idx) => {
      const review = field(field(item, "review"), "review") ?? field(item, "review") ?? item;
      const author = stringField(field(review, "author"), "name") ?? "";
      const content = (stringField(review, "content") ?? stringField(review, "abstract") ?? "").replace(/\s+/g, " ").slice(0, 220);
      const star = starText(field(review, "star"));
      return `${idx + 1}. ${author}${star ? ` ${star}` : ""}\n${content}`;
    })
    .join("\n\n");
}

export function formatBookmarks(data: unknown): string {
  const marks = asArray(field(data, "updated"));
  if (!marks.length) return JSON.stringify(data, null, 2);
  return marks
    .slice(0, 80)
    .map((mark, idx) => {
      const chapterUid = field(mark, "chapterUid");
      const text = stringField(mark, "markText") ?? "";
      return `${idx + 1}. chapterUid ${chapterUid ?? "?"}\n> ${text}`;
    })
    .join("\n\n");
}

export function formatRecommendations(data: unknown): string {
  const direct = asArray(field(data, "books"));
  const similar = asArray(field(field(data, "booksimilar"), "books"));
  const books = direct.length ? direct : similar.map((item) => field(field(item, "book"), "bookInfo") ?? field(item, "book") ?? item);
  if (!books.length) return JSON.stringify(data, null, 2);
  return books
    .slice(0, 30)
    .map((book, idx) => {
      const title = stringField(book, "title") ?? "(untitled)";
      const author = stringField(book, "author") ?? "";
      const bookId = stringField(book, "bookId") ?? "";
      const reason = stringField(book, "reason") ?? "";
      return `${idx + 1}. ${title}${author ? ` - ${author}` : ""}${bookId ? ` | id ${bookId}` : ""}${reason ? `\n   ${reason}` : ""}`;
    })
    .join("\n");
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
