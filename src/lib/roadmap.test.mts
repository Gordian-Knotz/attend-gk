import { test } from "node:test";
import assert from "node:assert/strict";

import { ROADMAP, roadmapFor } from "./roadmap.ts";

test("admin sees admin-only and shared items", () => {
  const titles = roadmapFor("admin").map((i) => i.title);
  assert.ok(titles.includes("Overtime rules"), "admin-only item missing");
  assert.ok(titles.includes("Shift swaps"), "shared item missing");
});

test("staff do not see admin-only items", () => {
  const titles = roadmapFor("staff").map((i) => i.title);
  assert.ok(!titles.includes("Overtime rules"));
  assert.ok(!titles.includes("Biometric terminals"));
});

test("staff still see shared items", () => {
  const titles = roadmapFor("staff").map((i) => i.title);
  assert.ok(titles.includes("Shift swaps"));
  assert.ok(titles.includes("Photo at clock-in"));
});

test("every item reaches at least one surface", () => {
  const reachable = new Set([
    ...roadmapFor("admin").map((i) => i.title),
    ...roadmapFor("staff").map((i) => i.title),
  ]);
  // An item with a mistyped audience would silently show to nobody, which
  // looks identical to it having been removed on purpose.
  assert.equal(reachable.size, ROADMAP.length);
});

test("copy stays short enough to render on one card", () => {
  for (const item of ROADMAP) {
    assert.ok(item.title.length <= 40, `title too long: ${item.title}`);
    assert.ok(item.detail.length <= 140, `detail too long: ${item.title}`);
  }
});
