import { test } from "node:test";
import assert from "node:assert/strict";

import { describeAudience } from "./notice-audience.ts";

test("no site and no role is everyone", () => {
  assert.equal(describeAudience({ siteName: null, targetRole: null }), "Everyone");
});

test("a site alone names the site", () => {
  assert.equal(
    describeAudience({ siteName: "Two Rivers Mall", targetRole: null }),
    "Two Rivers Mall"
  );
});

test("a role alone pluralises the role", () => {
  assert.equal(describeAudience({ siteName: null, targetRole: "staff" }), "All staff");
  assert.equal(describeAudience({ siteName: null, targetRole: "manager" }), "All managers");
});

test("org_admin reads as admins, not org_admins", () => {
  assert.equal(describeAudience({ siteName: null, targetRole: "org_admin" }), "All admins");
});

test("site and role combine", () => {
  assert.equal(
    describeAudience({ siteName: "Garden City", targetRole: "staff" }),
    "Staff at Garden City"
  );
});

test("an unknown role degrades to the raw value rather than throwing", () => {
  assert.equal(describeAudience({ siteName: null, targetRole: "wizard" }), "All wizard");
});
