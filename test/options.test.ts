import assert from "node:assert/strict";
import test from "node:test";
import { compactParams, parseBodyJson, parseParams, scopeValue } from "../src/options.js";

test("scopeValue accepts aliases and numeric scopes", () => {
  assert.equal(scopeValue("book"), 10);
  assert.equal(scopeValue("all"), 0);
  assert.equal(scopeValue("14"), 14);
});

test("parseParams coerces scalar values and JSON arrays", () => {
  assert.deepEqual(parseParams(["count=10", "draft=false", "reviews=[{\"range\":\"1-2\"}]"]), {
    count: 10,
    draft: false,
    reviews: [{ range: "1-2" }]
  });
});

test("parseBodyJson requires an object", () => {
  assert.deepEqual(parseBodyJson("{\"keyword\":\"三体\"}"), { keyword: "三体" });
  assert.throws(() => parseBodyJson("[1,2,3]"), /must be a JSON object/);
});

test("compactParams drops undefined but keeps falsy API values", () => {
  assert.deepEqual(compactParams({ count: undefined, maxIdx: 0, keyword: "", enabled: false }), {
    maxIdx: 0,
    keyword: "",
    enabled: false
  });
});
