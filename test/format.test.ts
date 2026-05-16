import assert from "node:assert/strict";
import test from "node:test";
import { formatBookmarks, jsonView } from "../src/format.js";

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
