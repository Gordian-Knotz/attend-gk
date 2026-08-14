import { test } from "node:test";
import assert from "node:assert/strict";

import {
  VISIBILITY_SCOPES,
  ASSIGNABLE_TIERS,
  scopeReachesBeyondTier,
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
