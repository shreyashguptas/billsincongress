/**
 * Lists every tap target smaller than a finger, on a phone.
 *
 * brand.md promises that every control is 44px on a touch screen. A real
 * control (a button, a pill, a toggle, a page number) is 44px itself, through
 * `touchable:h-11`. A text link keeps its line height and gets an invisible
 * 44px target from `.touch-hit`. Both are easy to forget on a new link, so this
 * opens the site at 390px with touch on and measures what a finger can hit.
 *
 * It measures the HIT AREA, not the box: from the centre of each control it
 * walks outwards with `elementFromPoint` until the point stops landing on the
 * control. That counts a `.touch-hit` ::after or a padded row the same way a
 * tap does, and it does NOT count area a sticky header or a neighbour's target
 * covers, because a tap there would not reach the control either. So two 44px
 * targets that overlap both fail, which is the point.
 *
 * It also fails a target whose centre lands on a DIFFERENT control, whatever
 * its size and even when it is inline or exempt, and names the one on top:
 * that is a tap that opens the wrong thing. Two dotted Terms on neighbouring
 * lines did exactly this ("Representative" opened "district") while each
 * still measured as a fine target.
 *
 * Two kinds of target are listed but do not fail:
 * - links and dotted Terms inside a running sentence (WCAG 2.2, 2.5.8 exempts
 *   them, and a 44px box on a 24px line would cover the lines above and below);
 * - anything inside `data-touch-exempt="<reason>"`, for a chart whose geometry
 *   is the data (the state map's tiles, the month chart's scrub columns). The
 *   reason is printed with `--all`; keep it honest.
 *
 * Not run in CI: it needs a running site and a browser. Run it by hand before
 * merging anything a reader taps:
 *
 *   pnpm dev
 *   pnpm check:touch                                  # localhost:3000, the usual pages, 390px
 *   pnpm check:touch http://localhost:3124 /bills /about --width=820
 *   pnpm check:touch --all                            # also the exempt ones, with reasons
 *   pnpm check:touch --shots=/tmp/hits                # a full-page picture of every target
 *
 * Playwright is not a dependency of the site, so install it where Node can find
 * it first: `npm i -g playwright@1.56.1 && npx playwright install chromium`
 * (global installs are found through NODE_PATH).
 *
 * Exits 1 when any control's hit area is under 44px either way, or another
 * control covers its centre.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const MIN = 44;
/** WCAG 2.2 AA (2.5.8). Below this the report flags it. */
const WCAG_MIN = 24;

export const DEFAULT_PAGES = [
  "/",
  "/bills",
  "/bills/enacted",
  "/bills/topic/health",
  "/bills/1276hr119",
  "/bills/6079hr119",
  "/members/B001309",
  "/learn",
  "/about",
  "/pro",
  "/sign-in",
  "/privacy",
];

export type Target = {
  label: string;
  path: string;
  /** The control's own box, px. */
  box: [number, number];
  /** What a finger can hit, px (0×0 when something covers its centre). */
  hit: [number, number];
  /** The hit area: left, top, width, height, in page coordinates (viewport ones when `pinned`). */
  rect: [number, number, number, number];
  /** Inside a fixed or sticky bar, so it stays put when the page scrolls. */
  pinned: boolean;
  small: boolean;
  inline: boolean;
  /** From `data-touch-exempt` on the control or an ancestor. */
  exempt: string | null;
  /** The control a tap on this one's centre actually reaches, when it is another one. */
  stolenBy: string | null;
};

/**
 * Runs in the page: every visible control and its hit area. Self-contained,
 * because Playwright serialises it.
 */
export function measure(args: { min: number }): Target[] {
  const SELECTOR = [
    "a[href]",
    "button",
    "summary",
    "select",
    "input:not([type=hidden])",
    "textarea",
    "[role=button]",
    "[role=tab]",
    "[role=radio]",
    "[role=checkbox]",
    "[role=switch]",
    "[role=link]",
    "[role=menuitem]",
    "[role=option]",
  ].join(",");

  const all = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR));
  // A control nested in another (a button inside a link) is one target.
  const els = all.filter((el) => !all.some((o) => o !== el && o.contains(el)));

  const visible = (el: HTMLElement) => {
    if (el.closest("[aria-hidden=true], [inert], nextjs-portal")) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0" || cs.pointerEvents === "none") return false;
    // sr-only skip links, which only appear on focus.
    if (cs.clip === "rect(0px, 0px, 0px, 0px)" || cs.clipPath === "inset(50%)") return false;
    return true;
  };

  /** A link or a Term (an inline `role=button` span) with running text beside it in the same block. */
  const isInline = (el: HTMLElement) => {
    const kind = el.tagName === "A" || (el.tagName === "SPAN" && el.getAttribute("role") === "button");
    if (!kind || getComputedStyle(el).display !== "inline") return false;
    let block: HTMLElement | null = el.parentElement;
    while (block && getComputedStyle(block).display === "inline") block = block.parentElement;
    if (!block) return false;
    const rest = (block.textContent ?? "").replace(el.textContent ?? "", "").replace(/[\s.,;:()–—·-]/g, "");
    return rest.length > 12;
  };

  const hits = (el: HTMLElement, x: number, y: number) => {
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
    const at = document.elementFromPoint(x, y);
    return !!at && (at === el || el.contains(at));
  };

  /** How far the hit run reaches each way from (cx, cy) along one axis, px. */
  const reach = (el: HTMLElement, cx: number, cy: number, dx: number, dy: number, half: number): [number, number] => {
    // Far enough to find the edge of the box plus any hit area around it.
    const limit = Math.ceil(half) + 60;
    let a = 0;
    let b = 0;
    while (a < limit && hits(el, cx - dx * (a + 1), cy - dy * (a + 1))) a++;
    while (b < limit && hits(el, cx + dx * (b + 1), cy + dy * (b + 1))) b++;
    return [a, b];
  };

  const describe = (el: HTMLElement) => {
    const parts: string[] = [];
    let n: HTMLElement | null = el;
    for (let i = 0; n && i < 3; i++, n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) s += `#${n.id}`;
      const label = i === 0 && n.getAttribute("aria-label");
      if (label) s += `[${label.slice(0, 30)}]`;
      parts.unshift(s);
    }
    return parts.join(" > ");
  };

  const isPinned = (el: HTMLElement) => {
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === "fixed" || p === "sticky") return true;
    }
    return false;
  };

  const out: Target[] = [];
  for (const el of els) {
    if (!visible(el)) continue;
    // Scrolling a control into view also scrolls any box it sits in (a chip
    // rail, even an overflow-hidden wrapper); put those back afterwards, so the
    // page is left as a reader would see it.
    const rails: [HTMLElement, number, number][] = [];
    for (let n = el.parentElement; n && n !== document.scrollingElement; n = n.parentElement) {
      if (n.scrollWidth > n.clientWidth || n.scrollHeight > n.clientHeight) rails.push([n, n.scrollLeft, n.scrollTop]);
    }
    el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" as ScrollBehavior });
    const r = el.getBoundingClientRect();
    // A link that wraps: a finger aims at its first line.
    const rects = el.getClientRects();
    const first = rects.length > 1 ? rects[0] : r;
    const cx = Math.round(first.left + first.width / 2);
    const cy = Math.round(first.top + first.height / 2);
    const covered = !hits(el, cx, cy);
    const onTop = covered ? document.elementFromPoint(cx, cy)?.closest<HTMLElement>(SELECTOR) : null;
    const stolenBy = onTop && onTop !== el && !el.contains(onTop) && !onTop.contains(el) ? describe(onTop) : null;
    const [l, rr] = covered ? [0, 0] : reach(el, cx, cy, 1, 0, first.width / 2);
    const [t, b] = covered ? [0, 0] : reach(el, cx, cy, 0, 1, first.height / 2);
    const w = covered ? 0 : l + rr + 1;
    const h = covered ? 0 : t + b + 1;
    const pinned = isPinned(el);
    // The hit area relative to the control's box, then placed on the box where
    // it ends up once the rails are back.
    const [ox, oy] = covered ? [0, 0] : [cx - l - r.left, cy - t - r.top];
    for (const [n, left, top] of rails) {
      n.scrollLeft = left;
      n.scrollTop = top;
    }
    const r2 = el.getBoundingClientRect();
    const sx = (pinned ? 0 : scrollX) + r2.left;
    const sy = (pinned ? 0 : scrollY) + r2.top;
    out.push({
      label: (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || el.tagName)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 48),
      path: describe(el),
      box: [Math.round(r.width), Math.round(r.height)],
      hit: [w, h],
      rect: covered ? [sx, sy, r.width, r.height] : [sx + ox, sy + oy, w, h],
      pinned,
      // Sampled on whole pixels from a centre that may sit on a half pixel, so
      // a box of exactly 44px can read as 43.
      small: w < args.min - 1 || h < args.min - 1,
      inline: isInline(el),
      exempt: el.closest("[data-touch-exempt]")?.getAttribute("data-touch-exempt") ?? null,
      stolenBy: stolenBy
        ? `"${(onTop!.innerText || onTop!.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 40)}" (${stolenBy})`
        : null,
    });
  }
  return out;
}

/**
 * Runs in the page: draws each target's hit area over it. A target under 44px
 * gets a heavy outline and its size; one that passes, a hairline. For review
 * pictures only, never shipped.
 */
export function paint(targets: Target[]) {
  document.getElementById("touch-target-overlay")?.remove();
  const layer = document.createElement("div");
  layer.id = "touch-target-overlay";
  const fixed = document.createElement("div");
  // Clipped to the page, so a box or label past its edge cannot widen it (a
  // phone would zoom out to fit, and move everything under the picture).
  const page = document.documentElement;
  layer.style.cssText =
    `position:absolute;left:0;top:0;width:${page.clientWidth}px;height:${page.scrollHeight}px;` +
    "overflow:hidden;z-index:2147483647;pointer-events:none";
  fixed.style.cssText = "position:fixed;inset:0;overflow:hidden;pointer-events:none";
  layer.appendChild(fixed);
  for (const t of targets) {
    const fail = Boolean(t.stolenBy) || (t.small && !t.inline && !t.exempt);
    const box = document.createElement("div");
    const [x, y, w, h] = t.rect;
    box.style.cssText =
      `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;box-sizing:border-box;` +
      (fail
        ? "border:2px solid #d4351c;background:rgba(212,53,28,.16)"
        : t.small
          ? "border:1px dashed rgba(120,120,120,.8)"
          : "border:1.5px solid #0f8a5f;background:rgba(15,138,95,.10)");
    if (fail) {
      const tag = document.createElement("span");
      tag.textContent = `${t.hit[0]}×${t.hit[1]}`;
      tag.style.cssText =
        "position:absolute;left:-2px;top:-17px;font:600 11px/15px ui-monospace,monospace;" +
        "color:#fff;background:#d4351c;padding:0 4px;border-radius:2px;white-space:nowrap";
      box.appendChild(tag);
    }
    (t.pinned ? fixed : layer).appendChild(box);
  }
  document.body.appendChild(layer);
}

type Page = {
  addInitScript(script: string): Promise<void>;
  goto(u: string, o: object): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<T, A>(fn: (a: A) => T, arg: A): Promise<T>;
  screenshot(o: object): Promise<unknown>;
};
type Browser = {
  newContext(o: object): Promise<{ newPage(): Promise<Page>; close(): Promise<void> }>;
  close(): Promise<void>;
};

/** Playwright, found at runtime so the site's type check does not need it installed. */
export function loadChromium(): { launch(): Promise<Browser> } {
  try {
    return createRequire(import.meta.url)("playwright").chromium;
  } catch {
    console.error("Playwright is not installed. See the header of scripts/check-touch-targets.ts.");
    process.exit(2);
  }
}

/** A phone-shaped, touch-enabled page with `path` loaded and settled. */
export async function openTouchPage(browser: Browser, url: string, width: number, colorScheme = "light") {
  const ctx = await browser.newContext({
    viewport: { width, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
    colorScheme,
  });
  const page = await ctx.newPage();
  // tsx names functions with an `__name` helper the page does not have.
  await page.addInitScript("globalThis.__name = (f) => f;");
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}

async function main() {
  const argv = process.argv.slice(2);
  const base = (argv.find((a) => /^https?:/.test(a)) ?? "http://localhost:3000").replace(/\/$/, "");
  const pages = argv.filter((a) => a.startsWith("/"));
  const width = Number(argv.find((a) => a.startsWith("--width="))?.slice(8) ?? 390);
  const shots = argv.find((a) => a.startsWith("--shots="))?.slice(8);
  const verbose = argv.includes("--all");
  if (shots) mkdirSync(shots, { recursive: true });

  const browser = await loadChromium().launch();
  let failing = 0;
  let wcag = 0;
  for (const path of pages.length ? pages : DEFAULT_PAGES) {
    const { ctx, page } = await openTouchPage(browser, base + path, width);
    const found = await page.evaluate(measure, { min: MIN });
    if (shots) {
      await page.evaluate(paint, found);
      const name = path === "/" ? "home" : path.slice(1).replace(/\//g, "-");
      await page.screenshot({ path: `${shots}/${name}-${width}.png`, fullPage: true });
    }
    await ctx.close();

    const stolen = found.filter((t) => t.stolenBy);
    const small = found.filter((t) => !t.stolenBy && t.small && !t.inline && !t.exempt);
    const inline = found.filter((t) => !t.stolenBy && t.small && t.inline && !t.exempt);
    const exempt = found.filter((t) => !t.stolenBy && t.small && t.exempt);
    failing += small.length + stolen.length;
    wcag += small.filter((t) => Math.min(...t.hit) < WCAG_MIN).length;

    const problems = [small.length && `${small.length} under ${MIN}px`, stolen.length && `${stolen.length} covered by another target`];
    console.log(`\n${path}  ${problems.filter(Boolean).join(", ") || "ok"}`);
    for (const t of stolen) console.log(`  covered  "${t.label}"  ${t.path}: a tap on its centre reaches ${t.stolenBy}`);
    for (const t of small) {
      console.log(
        `  ${`${t.hit[0]}×${t.hit[1]}`.padEnd(8)} hit  ${`${t.box[0]}×${t.box[1]}`.padEnd(8)} box  ` +
          `"${t.label}"  ${t.path}${Math.min(...t.hit) < WCAG_MIN ? "  < 24 (WCAG)" : ""}`,
      );
    }
    if (verbose) {
      for (const t of inline) console.log(`  inline   ${t.hit[0]}×${t.hit[1]}  "${t.label}"  ${t.path}`);
      for (const t of exempt) console.log(`  exempt   ${t.hit[0]}×${t.hit[1]}  "${t.label}"  (${t.exempt})`);
    } else if (inline.length || exempt.length) {
      console.log(`  (${inline.length} inline in running text, ${exempt.length} data-touch-exempt; --all lists them)`);
    }
  }
  await browser.close();

  console.log(
    `\n${failing} tap target(s) under ${MIN}px or covered by another at ${width}px` +
      (wcag ? `, ${wcag} under the WCAG ${WCAG_MIN}px floor` : ""),
  );
  process.exit(failing ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
