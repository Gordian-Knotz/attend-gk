/**
 * Authenticated browser pass over the routes `scripts/smoke.mjs` cannot reach.
 *
 *   DEMO_EMAIL=... DEMO_PASSWORD=... node scripts/smoke-authed.mjs [baseUrl]
 *
 * Everything behind a Supabase session was unverifiable for three sessions
 * because there was no login to use. This signs in through the real form, so
 * the whole cookie and middleware path is exercised, not just the API.
 *
 * Four traps are baked in, each of which produced a false result first:
 *
 *  1. **Wait for the navigation generously.** The server action round trip plus
 *     the redirect regularly takes >3s. `waitForURL` with a short timeout
 *     silently leaves you on /login, and every later assertion then reports a
 *     defect that does not exist — including "the sidebar is missing", because
 *     /login has no sidebar.
 *  2. **Badges render UPPERCASE via CSS.** `innerText` reflects
 *     `text-transform`, so match case-insensitively. A `/In|Out/` regex reports
 *     the attendance card as empty while it is plainly full of rows.
 *  3. **Compare scrollWidth to documentElement.clientWidth**, never
 *     `window.innerWidth` — the latter includes the scrollbar.
 *  4. **Theme comes from localStorage, not the OS.** `next-themes` runs with
 *     `enableSystem={false}`, so Playwright's `colorScheme` does nothing. Set
 *     `localStorage.theme` in an init script, before first paint.
 *
 * Rate limiting is real and will bite you: `auth:id` allows 6 sign-ins per 15
 * minutes per email. A loop over several widths and themes signs in once per
 * combination, so a full matrix can throttle itself. Keep the matrix small, or
 * point it at a locally built server whose limiter starts empty.
 */
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3000";
const EMAIL = process.env.DEMO_EMAIL;
const PASSWORD = process.env.DEMO_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Set DEMO_EMAIL and DEMO_PASSWORD.");
  process.exit(1);
}

/** Deliberately small: one sign-in per entry, and the limiter allows six. */
const MATRIX = [
  { theme: "dark", w: 1366, h: 1000, label: "desktop" },
  { theme: "light", w: 390, h: 844, label: "mobile" },
  { theme: "dark", w: 320, h: 844, label: "small" },
];

let failures = 0;
let checks = 0;

function report(ok, label, detail = "") {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function signIn(browser, { theme, w, h }) {
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  await context.addInitScript((t) => localStorage.setItem("theme", t), theme);
  const page = await context.newPage();

  const messages = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") messages.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => messages.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE}/login?next=%2Fdashboard`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');

  // Trap 1: be patient, and check where we actually ended up.
  await page.waitForURL(/\/dashboard/, { timeout: 45000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);

  return { context, page, messages };
}

const browser = await chromium.launch();
console.log(`\nauthed smoke: ${BASE}\n${"=".repeat(60)}`);

for (const entry of MATRIX) {
  const { theme, w, h, label } = entry;
  console.log(`\n── ${theme} / ${label} ${w}×${h}`);

  const { context, page, messages } = await signIn(browser, entry);

  const onDashboard = page.url().includes("/dashboard");
  report(onDashboard, "signed in and reached /dashboard", page.url());

  if (!onDashboard) {
    // Everything below would report phantom defects. Say so and move on —
    // a throttled sign-in is not a broken dashboard.
    const text = await page.evaluate(() => document.body.innerText);
    report(false, "aborting this run", /too many/i.test(text) ? "rate limited" : text.slice(0, 120));
    await context.close();
    continue;
  }

  const text = await page.evaluate(() => document.body.innerText);

  report(/Hi,\s*\w/.test(text), "greets the employee");

  const themeOk = await page.evaluate(
    (t) => document.documentElement.classList.contains(t),
    theme
  );
  report(themeOk, `document reflects ${theme} theme`);

  for (const section of ["Clock in", "Shifts", "History", "Leave"]) {
    report(text.includes(section), `nav shows "${section}"`);
  }

  // Trap 2: case-insensitive — the badges are uppercased by CSS.
  report(/\bin\b|\bout\b/i.test(text), "attendance rows render");
  report(/annual|sick|no leave/i.test(text), "leave section renders");
  report(/clocked (in|out)/i.test(text), "clock-in widget states current status");

  // Trap 3
  const of = await page.evaluate(() => ({
    s: document.documentElement.scrollWidth,
    c: document.documentElement.clientWidth,
  }));
  report(of.s <= of.c, "no horizontal page overflow", `${of.s} <= ${of.c}`);

  // The rail and the sidebar are mutually exclusive by design. Getting this
  // wrong is what put the mobile rail *beside* the content for a whole session.
  const layout = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    const nav = document.querySelector("nav");
    return {
      aside: aside ? getComputedStyle(aside).display : "absent",
      navLeft: nav ? Math.round(nav.getBoundingClientRect().left) : null,
      navTop: nav ? Math.round(nav.getBoundingClientRect().top) : null,
    };
  });

  if (w >= 768) {
    report(layout.aside === "flex", "desktop: sidebar rail present", layout.aside);
  } else {
    report(layout.aside === "none", "mobile: sidebar hidden", layout.aside);
    report(
      layout.navLeft === 0 && layout.navTop === 0,
      "mobile: rail sits at the top-left, not beside the content",
      `left=${layout.navLeft} top=${layout.navTop}`
    );
  }

  report(
    messages.filter((m) => !/ReadPixels|WebGL|GPU stall/i.test(m)).length === 0,
    "console clean",
    messages.join(" ~ ").slice(0, 200)
  );

  await context.close();
}

await browser.close();

console.log(`\n${"=".repeat(60)}`);
console.log(`${checks - failures}/${checks} checks passed`);
process.exit(failures > 0 ? 1 : 0);
