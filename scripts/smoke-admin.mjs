/**
 * Admin-surface browser pass.
 *
 *   DEMO_EMAIL=... DEMO_PASSWORD=... node scripts/smoke-admin.mjs [baseUrl]
 *
 * Needs a MANAGER-or-above session. `smoke-authed.mjs` covers the staff routes
 * with a staff account; this covers everything behind /admin, which had never
 * been in a browser at all.
 *
 * Written for one specific reason: the 14 Aug typography change repointed
 * --font-serif to --font-display and swapped Source Serif 4 for Archivo across
 * 22 files, including card.tsx, dialog.tsx, page-header.tsx and the wordmark —
 * all of which live in the admin app, which no automated check reached. So this
 * asserts the resolved font-family, not just that the page renders.
 *
 * Also checks the two surfaces added the same day: the Structure card in
 * Settings (org_levels) and the Coming soon card on the overview.
 */
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3000";
const EMAIL = process.env.DEMO_EMAIL;
const PASSWORD = process.env.DEMO_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Set DEMO_EMAIL and DEMO_PASSWORD.");
  process.exit(1);
}

const ROUTES = [
  ["/admin", "Overview"],
  ["/admin/attendance", "Attendance"],
  ["/admin/schedule", "Schedule"],
  ["/admin/leave", "Leave"],
  ["/admin/staff", "Staff"],
  ["/admin/sites", "Sites"],
  ["/admin/devices", "Devices"],
  ["/admin/reports", "Reports"],
  ["/admin/billing", "Billing"],
  ["/admin/settings", "Settings"],
];

let checks = 0;
let failures = 0;

function report(ok, label, detail = "") {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1366, height: 1000 },
    colorScheme: "light",
  });
  const page = await context.newPage();
  const messages = [];
  page.on("console", (m) => {
    if (m.type() === "error") messages.push(m.text());
  });
  page.on("pageerror", (e) => messages.push(String(e)));

  console.log(`\nsmoke-admin: ${BASE}\n${"=".repeat(60)}`);

  // ── sign in ──────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
  report(!page.url().includes("/login"), "signed in", page.url().replace(BASE, ""));

  for (const [route, label] of ROUTES) {
    console.log(`\n── ${route}`);
    messages.length = 0;

    const res = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    report(res.status() < 400, `${route} responds`, `HTTP ${res.status()}`);
    report(
      !page.url().includes("/login") && !page.url().includes("/onboarding"),
      `${route} is not bounced to login or onboarding`,
      page.url().replace(BASE, "")
    );

    // A heading proves the page rendered rather than fell into an error state.
    const heading = await page.locator("h1, h2").first().textContent().catch(() => null);
    report(Boolean(heading && heading.trim()), `${route} renders a heading`, (heading ?? "").trim().slice(0, 48));

    // THE POINT OF THIS SCRIPT: the display face must actually be Archivo.
    // A missing @fontsource import would silently fall back to a system
    // sans-serif and every heading would look almost right.
    const font = await page
      .locator("h1, h2")
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily)
      .catch(() => "");
    report(/archivo/i.test(font), `${route} heading uses Archivo`, font.slice(0, 60));

    // The retired mono eyebrow: .font-label must no longer be uppercased.
    const labelTransform = await page
      .locator(".font-label")
      .first()
      .evaluate((el) => getComputedStyle(el).textTransform)
      .catch(() => "none");
    report(labelTransform !== "uppercase", `${route} .font-label is no longer an uppercase eyebrow`, labelTransform);

    const overflow = await page.evaluate(() => ({
      s: document.documentElement.scrollWidth,
      c: document.documentElement.clientWidth,
    }));
    report(overflow.s <= overflow.c, `${route} no horizontal overflow`, `${overflow.s} <= ${overflow.c}`);

    report(messages.length === 0, `${route} console clean`, messages.join(" ~ ").slice(0, 140));
  }

  // ── the two surfaces added on 14 Aug ─────────────────────────────────────
  console.log(`\n── new surfaces`);

  await page.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
  const settingsText = await page.locator("body").innerText();
  report(/Structure/.test(settingsText), "Settings shows the Structure card");
  report(
    /Flat|Owner|CEO|no levels yet/i.test(settingsText),
    "Structure card offers presets or lists the ladder"
  );

  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const overviewText = await page.locator("body").innerText();
  report(/Coming soon/i.test(overviewText), "Overview shows the Coming soon card");
  report(
    /Overtime rules|Biometric terminals|Shift swaps/i.test(overviewText),
    "Coming soon lists roadmap items from lib/roadmap.ts"
  );

  // ── mobile pass on the two densest pages ────────────────────────────────
  console.log(`\n── mobile 390`);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/admin", "/admin/settings"]) {
    messages.length = 0;
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    const o = await page.evaluate(() => ({
      s: document.documentElement.scrollWidth,
      c: document.documentElement.clientWidth,
    }));
    report(o.s <= o.c, `${route} no overflow at 390`, `${o.s} <= ${o.c}`);
    report(messages.length === 0, `${route} console clean at 390`, messages.join(" ~ ").slice(0, 120));
  }

  await context.close();
  await browser.close();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.log(`${failures} FAILED`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
