import assert from "node:assert/strict";
import test from "node:test";
import { formatBookmarks, formatNotesTop, formatPopularBookmarks, formatShelfRecent, jsonView } from "../src/format.js";

test("human highlight output reports truncation", () => {
  const data = {
    updated: Array.from({ length: 81 }, (_, index) => ({
      chapterUid: 1,
      markText: `highlight ${index + 1}`
    }))
  };

  const formatted = formatBookmarks(data, { limit: 80 });
  assert.match(formatted, /Showing first 80 of 81 highlights/);
  assert.match(formatted, /Use --json, --limit, or --all/);
});

test("json view adds explicit empty popular highlight semantics", () => {
  const view = jsonView("/book/bestbookmarks", { synckey: 123 }, false);

  assert.deepEqual(view.items, []);
  assert.equal(view.totalCount, 0);
  assert.equal(view.empty_reason, "no_popular_highlights");
  assert.deepEqual(view.data, {
    synckey: 123,
    items: [],
    totalCount: 0,
    empty_reason: "no_popular_highlights"
  });
});

test("human popular highlight output uses explicit empty reason", () => {
  const formatted = formatPopularBookmarks({ synckey: 123 });
  const parsed = JSON.parse(formatted) as { items: unknown[]; totalCount: number; empty_reason: string };

  assert.deepEqual(parsed.items, []);
  assert.equal(parsed.totalCount, 0);
  assert.equal(parsed.empty_reason, "no_popular_highlights");
});

test("recent shelf and notes top use total counts in truncation hints", () => {
  const recent = formatShelfRecent({ totalBookCount: 3, books: [{ title: "A", updateTime: 3 }] });
  assert.match(recent, /Showing first 1 of 3 recent books/);

  const top = formatNotesTop({ totalBookCount: 3, books: [{ bookId: "a", book: { title: "A" }, bookmarkCount: 1 }] });
  assert.match(top, /Showing first 1 of 3 notebook books/);
});
