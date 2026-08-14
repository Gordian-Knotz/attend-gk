import { test } from "node:test";
import assert from "node:assert/strict";

import {
  VISIBILITY_SCOPES,
  ASSIGNABLE_TIERS,
  scopeReachesBeyondTier,
  PRESETS,
  presetByKey,
  SCOPE_LABELS,
  TIER_LABELS,
} from "./org-levels.ts";

test("scopes are ordered narrowest to widest", () => {
  assert.deepEqual([...VISIBILITY_SCOPES], ["self", "team", "site", "org"]);
});

test("super_admin is not assignable to a level", () => {
  assert.ok(!(ASSIGNABLE_TIERS as readonly string[]).includes("super_admin"));
});

test("a staff-tier level cannot be given org-wide scope", () => {
  assert.equal(scopeReachesBeyondTier("org", "staff"), true);
  assert.equal(scopeReachesBeyondTier("self", "staff"), false);
});

test("a manager-tier level may see its site but not the org", () => {
  assert.equal(scopeReachesBeyondTier("site", "manager"), false);
  assert.equal(scopeReachesBeyondTier("org", "manager"), true);
});

test("an org_admin-tier level may be narrowed to a team", () => {
  // The case the whole feature exists for: a Head of Department who runs HR
  // functions but must only see their own people. Narrowing is always
  // allowed, because a level can only ever subtract from its tier.
  assert.equal(scopeReachesBeyondTier("team", "org_admin"), false);
  assert.equal(scopeReachesBeyondTier("org", "org_admin"), false);
});

test("preset keys are unique and resolvable", () => {
  const keys = PRESETS.map((p) => p.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) assert.ok(presetByKey(key), `${key} should resolve`);
});

test("an unknown preset key resolves to null, not a default", () => {
  // Falling back to a default would silently give a tenant a structure they
  // did not choose.
  assert.equal(presetByKey("does-not-exist"), null);
  assert.equal(presetByKey(""), null);
});

test("no preset configures a level beyond its tier", () => {
  // A level whose scope exceeds its tier is a no-op, because narrowing is
  // restrictive-only. Shipping one in a preset would look like a bug.
  for (const preset of PRESETS) {
    for (const level of preset.levels) {
      assert.equal(
        scopeReachesBeyondTier(level.visibilityScope, level.suggestedTier),
        false,
        `${preset.key}/${level.name} exceeds its tier`
      );
    }
  }
});

test("every preset has ranks starting at 1 with no gaps or duplicates", () => {
  for (const preset of PRESETS) {
    const ranks = preset.levels.map((l) => l.rank).sort((a, b) => a - b);
    assert.deepEqual(
      ranks,
      ranks.map((_, i) => i + 1),
      `${preset.key} ranks should be 1..n`
    );
  }
});

test("every preset has exactly one most-senior level", () => {
  for (const preset of PRESETS) {
    const top = preset.levels.filter((l) => l.rank === 1);
    assert.equal(top.length, 1, `${preset.key} should have one rank-1 level`);
    // The top of a ladder runs the organization; a preset topping out at
    // staff tier would leave a tenant unable to administer anything.
    assert.equal(top[0].suggestedTier, "org_admin", `${preset.key} top must administer`);
  }
});

test("preset level names are unique within a preset", () => {
  // org_levels has unique (org_id, name), so a duplicate would fail to seed
  // halfway through and leave a partial ladder.
  for (const preset of PRESETS) {
    const names = preset.levels.map((l) => l.name);
    assert.equal(new Set(names).size, names.length, `${preset.key} has a duplicate name`);
  }
});

test("every scope and tier has a display label", () => {
  for (const scope of VISIBILITY_SCOPES) assert.ok(SCOPE_LABELS[scope]);
  for (const tier of ASSIGNABLE_TIERS) assert.ok(TIER_LABELS[tier]);
});
