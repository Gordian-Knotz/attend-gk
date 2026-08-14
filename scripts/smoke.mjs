/**
 * Public-route browser pass.
 *
 *   node scripts/smoke.mjs [baseUrl]
 *
 * Defaults to the Railway deployment. Covers only what is reachable without a
 * session — the landing page and /login. Everything behind auth needs a real
 * Supabase session and is out of scope here; doc 09 used a temporary fixture
 * route for that and deleted it afterwards.
 *
 * Two measurement traps are baked in, both learned the hard way:
 *
 *  - **Compare scrollWidth against documentElement.clientWidth, not
 *    window.innerWidth.** innerWidth includes the scrollbar, so the equality
 *    doc 07 originally used reports a false failure on any page tall enough to
 *    scroll. (doc 09)
 *  - **Scroll before measuring opacity.** Scroll-triggered reveals have not
 *    fired at networkidle, so every below-the-fold heading reads as
 *    `opacity: 0` and looks like a bug that isn't one. (docs 07 and 12)
 */
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "https://web-production-c7d3e.up.railway.app";
const WIDTHS = [
  { w: 1366, h: 1000, label: "desktop" },
  { w: 390, h: 844, label: "mobile" },
  { w: 320, h: 844, label: "small" },
];

let failures = 0;
let checks = 0;

function report(ok, label, detail = "") {
  checks++;
  if (!ok) failures++;
  const mark = ok ? "  ok  " : " FAIL ";
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function openPage(browser, { theme, reducedMotion = "no-preference" }) {
  const context = await browser.newContext({
    colorScheme: theme,
    reducedMotion,
  });
  // colorScheme above is cosmetic as far as this app is concerned:
  // layout.tsx configures next-themes with enableSystem={false}, so the OS/
  // emulated preference is never consulted. next-themes reads its choice
  // from localStorage["theme"] instead, and it does that read on first
  // mount — before React has committed a single node — so the value has to
  // be there before the app's own scripts run. addInitScript executes on
  // every subsequent navigation before any page script, which is exactly
  // that window; setting it after goto() would just race a paint that has
  // already happened.
  await context.addInitScript((t) => {
    window.localStorage.setItem("theme", t);
  }, theme);
  const page = await context.newPage();

  const console_ = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      console_.push(`${msg.type()}: ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => console_.push(`pageerror: ${err.message}`));

  return { context, page, messages: console_ };
}

/**
 * Scroll a selector into view, then park the pointer at its centre.
 *
 * Deliberately not `locator.hover()`: that waits for the element to stop
 * moving, which a marquee never does.
 */
async function hoverCentre(page, selector) {
  const locator = page.locator(selector).first();
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  const box = await locator.boundingBox();
  if (!box) return false;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  return true;
}

/**
 * Confirm the app actually rendered in the requested theme, rather than
 * trusting that setting localStorage["theme"] before load was enough. This
 * is the one check standing between us and a repeat of the bug where every
 * "dark" and "light" run silently rendered the same theme and nothing
 * caught it for 99 checks running.
 */
async function assertTheme(page, theme) {
  const state = await page.evaluate(() => ({
    classList: [...document.documentElement.classList],
    dataTheme: document.documentElement.getAttribute("data-theme"),
  }));
  report(
    state.classList.includes(theme),
    `document reflects ${theme} theme`,
    `class="${state.classList.join(" ")}"${
      state.dataTheme ? ` data-theme="${state.dataTheme}"` : ""
    }`
  );
}

/** Scroll the whole page in steps so every reveal fires, then return to top. */
async function settleReveals(page) {
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 400));
  });
}

/**
 * The health endpoints, checked without a browser.
 *
 * These are the one part of the app whose whole job is being reachable
 * WITHOUT a session, so the interesting assertion is the status code rather
 * than anything rendered. `/api` is a protected prefix in
 * src/lib/supabase/middleware.ts; a regression in PUBLIC_API_PATHS turns
 * both of these into a 307 to /login, which is invisible in a browser where
 * you already have a session and wrong for the monitor that is the only real
 * caller. `redirect: "manual"` is what makes that visible here — following
 * the redirect would land on /login and return a cheerful 200.
 */
async function checkHealthEndpoints() {
  console.log(`\n── health endpoints`);

  const live = await fetch(`${BASE}/api/health`, { redirect: "manual" });
  report(live.status === 200, "/api/health returns 200", `got ${live.status}`);
  report(
    (live.headers.get("cache-control") ?? "").includes("no-store"),
    "/api/health is not cacheable",
    live.headers.get("cache-control") ?? "(absent)"
  );

  const body = await live.json().catch(() => null);
  report(body?.status === "ok", "/api/health reports ok");
  // A liveness probe that leaks build details is reconnaissance for anyone
  // scraping it, and no help to an operator who can read the deploy log.
  report(
    body !== null && Object.keys(body).length === 1,
    "/api/health discloses nothing else",
    body ? Object.keys(body).join(",") : "(unparseable)"
  );

  const ready = await fetch(`${BASE}/api/health/ready`, { redirect: "manual" });
  report(
    ready.status === 200 || ready.status === 503,
    "/api/health/ready answers 200 or 503",
    `got ${ready.status}`
  );
}

async function run() {
  const browser = await chromium.launch();
  console.log(`\nsmoke: ${BASE}\n${"=".repeat(60)}`);

  await checkHealthEndpoints();

  for (const theme of ["light", "dark"]) {
    for (const { w, h, label } of WIDTHS) {
      const { context, page, messages } = await openPage(browser, { theme });
      await page.setViewportSize({ width: w, height: h });

      console.log(`\n── ${theme} / ${label} ${w}×${h}`);

      await page.goto(BASE, { waitUntil: "networkidle" });
      await settleReveals(page);

      // ── theme actually applied (not just requested)
      await assertTheme(page, theme);

      // ── layout
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      report(
        overflow.scrollWidth <= overflow.clientWidth,
        "no horizontal overflow",
        `${overflow.scrollWidth} <= ${overflow.clientWidth}`
      );

      // ── brand
      const bodyText = await page.evaluate(() => document.body.innerText);
      report(!/AttendPAC/i.test(bodyText), "no 'AttendPAC' in rendered text");
      report(!/pac\.africa/i.test(bodyText), "no 'pac.africa' in rendered text");
      report(
        /Activ/.test(bodyText) && /-HR/.test(bodyText),
        "Activ-HR wordmark renders"
      );

      // ── the removed section
      report(
        !/Who sees/i.test(bodyText),
        "'Who sees what' section is gone"
      );

      // ── client band position: must sit below the contact form
      const order = await page.evaluate(() => {
        const contact = document.querySelector("#contact");
        const track = document.querySelector(".marquee-track");
        if (!contact || !track) return null;
        return {
          contactBottom: contact.getBoundingClientRect().bottom + window.scrollY,
          trackTop: track.getBoundingClientRect().top + window.scrollY,
        };
      });
      report(
        order !== null && order.trackTop > order.contactBottom,
        "client band sits below the contact section",
        order ? `track ${Math.round(order.trackTop)} > contact ${Math.round(order.contactBottom)}` : "elements missing"
      );

      // ── marquee mechanics
      const marquee = await page.evaluate(() => {
        const track = document.querySelector(".marquee-track");
        if (!track) return null;
        const styles = getComputedStyle(track);
        const clone = track.querySelector("[data-marquee-clone]");
        return {
          animationName: styles.animationName,
          playState: styles.animationPlayState,
          trackWidth: track.scrollWidth,
          containerWidth: track.parentElement.clientWidth,
          cloneAriaHidden: clone?.getAttribute("aria-hidden"),
          cloneDisplay: clone ? getComputedStyle(clone).display : null,
        };
      });
      report(
        marquee?.animationName === "pac-marquee",
        "marquee animation applied",
        marquee?.animationName
      );
      report(
        marquee !== null && marquee.trackWidth > marquee.containerWidth,
        "track is wider than its container (so it can travel)",
        marquee ? `${marquee.trackWidth} > ${marquee.containerWidth}` : ""
      );
      report(
        marquee?.cloneAriaHidden === "true" && marquee?.cloneDisplay !== "none",
        "duplicate name set present and hidden from assistive tech"
      );

      // Pause on hover. Two traps here, both of which produce a convincing
      // false failure:
      //
      //  1. page.mouse.move() takes VIEWPORT coordinates, and the client band
      //     sits thousands of pixels below the fold, so a boundingBox from an
      //     unscrolled page puts the pointer nowhere at all.
      //  2. locator.hover() would scroll for us, but it first waits for the
      //     element to be "stable" — and a marquee never stops moving, so it
      //     times out. Hover the static mask instead; the pointer still lands
      //     over the track, which is what `.marquee-track:hover` needs.
      await hoverCentre(page, ".marquee-mask");
      await page.waitForTimeout(150);
      const hoveredState = await page.evaluate(
        () => getComputedStyle(document.querySelector(".marquee-track")).animationPlayState
      );
      report(hoveredState === "paused", "marquee pauses under the pointer", hoveredState);

      // ── PixelCard
      const cards = page.locator("#how-it-works canvas");
      const cardCount = await cards.count();
      report(cardCount === 3, "three pixel canvases in the capture section", `${cardCount}`);

      if (cardCount === 3) {
        const first = cards.first();
        const box = await first.boundingBox();
        report(
          box !== null && box.width > 0 && box.height > 0,
          "canvas has non-zero size",
          box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "none"
        );

        // Hover, let the fill radiate, then sample how much of the canvas is
        // actually painted. This is the "too strong on paper" risk doc 09 hit
        // twice with inherited opacities, measured instead of eyeballed.
        if (box) {
          await hoverCentre(page, "#how-it-works .bg-card");
          await page.waitForTimeout(1400);
          const coverage = await first.evaluate((canvas) => {
            const ctx = canvas.getContext("2d");
            const { width, height } = canvas;
            if (!width || !height) return null;
            const data = ctx.getImageData(0, 0, width, height).data;
            let painted = 0;
            for (let i = 3; i < data.length; i += 4) {
              if (data[i] > 8) painted++;
            }
            return {
              pct: +((painted / (data.length / 4)) * 100).toFixed(1),
              opacity: +getComputedStyle(canvas).opacity,
            };
          });
          report(
            coverage !== null && coverage.pct > 0,
            "pixels paint on hover",
            coverage ? `${coverage.pct}% of canvas painted, element opacity ${coverage.opacity}` : "no data"
          );
          await page.mouse.move(0, 0);
        }
      }

      // ── reveals actually revealed (after scrolling, per the trap above)
      const hiddenHeadings = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll("h1, h2, h3")];
        return nodes
          .filter((n) => {
            const o = getComputedStyle(n).opacity;
            return o !== "" && parseFloat(o) < 0.9;
          })
          .map((n) => n.textContent.trim().slice(0, 40));
      });
      report(
        hiddenHeadings.length === 0,
        "no headings stuck below full opacity",
        hiddenHeadings.length ? hiddenHeadings.join(" | ") : ""
      );

      // ── console
      report(
        messages.filter((m) => !/ReadPixels|WebGL|GPU stall/i.test(m)).length === 0,
        "console clean (headless GPU warnings excluded)",
        messages.join(" ~ ").slice(0, 200)
      );

      await context.close();
    }
  }

  // ── reduced motion, once
  console.log(`\n── reduced motion / desktop`);
  {
    const { context, page, messages } = await openPage(browser, {
      theme: "light",
      reducedMotion: "reduce",
    });
    await page.setViewportSize({ width: 1366, height: 1000 });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await settleReveals(page);
    await assertTheme(page, "light");

    const rm = await page.evaluate(() => {
      const track = document.querySelector(".marquee-track");
      const clone = track?.querySelector("[data-marquee-clone]");
      return {
        animationName: track ? getComputedStyle(track).animationName : null,
        cloneDisplay: clone ? getComputedStyle(clone).display : null,
        canvases: document.querySelectorAll("#how-it-works canvas").length,
      };
    });

    report(rm.animationName === "none", "marquee animation off", String(rm.animationName));
    report(rm.cloneDisplay === "none", "duplicate name set removed", String(rm.cloneDisplay));
    report(rm.canvases === 0, "PixelCard renders no canvas", `${rm.canvases} canvases`);

    const overflow = await page.evaluate(() => ({
      s: document.documentElement.scrollWidth,
      c: document.documentElement.clientWidth,
    }));
    report(overflow.s <= overflow.c, "no horizontal overflow", `${overflow.s} <= ${overflow.c}`);
    report(messages.length === 0, "console clean", messages.join(" ~ ").slice(0, 200));

    await context.close();
  }

  // ── /login still renders
  console.log(`\n── /login`);
  {
    const { context, page, messages } = await openPage(browser, { theme: "dark" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await assertTheme(page, "dark");
    const text = await page.evaluate(() => document.body.innerText);
    report(/Activ/.test(text), "wordmark on the login card");
    report(!/AttendPAC/i.test(text), "no old brand on /login");
    const overflow = await page.evaluate(() => ({
      s: document.documentElement.scrollWidth,
      c: document.documentElement.clientWidth,
    }));
    report(overflow.s <= overflow.c, "no horizontal overflow at 390", `${overflow.s} <= ${overflow.c}`);
    report(messages.length === 0, "console clean", messages.join(" ~ ").slice(0, 160));
    await context.close();
  }

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
