import { Stagehand } from "@browserbasehq/stagehand";

import {
  type Attendee,
  type AttendeeResult,
  type SocialLink,
  InvalidLumaUrlError,
  NotAuthenticatedError,
} from "./types.ts";

const USER_DATA_DIR = process.env.USER_DATA_DIR || "./browser-profile";
const HEADLESS = process.env.HEADLESS !== "false";
const MODEL = process.env.STAGEHAND_MODEL || "gpt-4o";
const CHROME_PATH =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

let stagehand: Stagehand | null = null;
let initPromise: Promise<void> | null = null;

let scrapeChain: Promise<unknown> = Promise.resolve();

function isLumaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "lu.ma" || u.hostname.endsWith(".lu.ma") || u.hostname.endsWith("luma.com");
  } catch {
    return false;
  }
}

function pickModelClient(): { apiKey: string } {
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const openai = process.env.OPENAI_API_KEY;
  if (/^claude|^anthropic\//i.test(MODEL)) {
    if (!anthropic) throw new Error("ANTHROPIC_API_KEY required for Anthropic models");
    return { apiKey: anthropic };
  }
  if (!openai) throw new Error("OPENAI_API_KEY required for OpenAI models");
  return { apiKey: openai };
}

async function doInit(): Promise<void> {
  const sh = new Stagehand({
    env: "LOCAL",
    modelName: MODEL,
    modelClientOptions: pickModelClient(),
    localBrowserLaunchOptions: {
      headless: HEADLESS,
      executablePath: CHROME_PATH,
      userDataDir: USER_DATA_DIR,
      // Without this, Stagehand `rm -rf`s the profile on close — wiping the
      // Luma session every restart. See stagehand/dist/index.js around the
      // `preserveUserDataDir` check.
      preserveUserDataDir: true,
    },
    verbose: 1,
  });

  await sh.init();
  stagehand = sh;
}

export async function initAgent(): Promise<void> {
  if (stagehand) return;
  if (!initPromise) initPromise = doInit().catch((err) => {
    initPromise = null;
    throw err;
  });
  await initPromise;
}

export async function shutdownAgent(): Promise<void> {
  if (!stagehand) return;
  const sh = stagehand;
  stagehand = null;
  initPromise = null;
  await sh.close();
}

export function isBrowserReady(): boolean {
  return stagehand !== null;
}

function classifyUrl(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "twitter.com" || host === "x.com") return "twitter";
    if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin";
    if (host === "instagram.com") return "instagram";
    if (host === "github.com") return "github";
    if (host === "tiktok.com") return "tiktok";
    if (host === "youtube.com" || host === "youtu.be") return "youtube";
    if (host === "threads.net") return "threads";
    if (host === "facebook.com" || host === "fb.com") return "facebook";
    if (host === "warpcast.com" || host === "farcaster.xyz") return "farcaster";
    if (host === "bsky.app") return "bluesky";
    return "website";
  } catch {
    return "website";
  }
}

function normalizeSocials(input: Array<{ platform?: string; url?: string | null }> | undefined): SocialLink[] {
  if (!input) return [];
  const seen = new Set<string>();
  const out: SocialLink[] = [];
  for (const s of input) {
    const url = (s.url ?? "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    // Trust the model's platform tag if it looks reasonable, else classify by host.
    const platform = (s.platform || "").trim().toLowerCase() || classifyUrl(url);
    out.push({ platform, url });
  }
  return out;
}

type DomRow = {
  name: string | null;
  avatarUrl: string | null;
  socialUrls: string[];
};

async function scrapeRowsFromDom(): Promise<{
  totalGuestCount: number | null;
  rows: DomRow[];
  strategy: string;
}> {
  if (!stagehand) throw new Error("Stagehand not initialized");
  return await stagehand.page.evaluate(async () => {
    const DISCLAIMER = "Guests who have not completed their Luma profile";
    const SOCIAL_HOSTS = [
      "twitter.com",
      "x.com",
      "linkedin.com",
      "instagram.com",
      "github.com",
      "tiktok.com",
      "youtube.com",
      "youtu.be",
      "threads.net",
      "facebook.com",
      "warpcast.com",
      "farcaster.xyz",
      "bsky.app",
    ];
    const isSocial = (href: string) => {
      try {
        const h = new URL(href).hostname.toLowerCase().replace(/^www\./, "");
        if (h === location.hostname) return false;
        return SOCIAL_HOSTS.some((d) => h === d || h.endsWith("." + d)) || /^https?:/.test(href);
      } catch {
        return false;
      }
    };

    // Find the dialog: try aria first, then the disclaimer text.
    let dialog: HTMLElement | null = document.querySelector<HTMLElement>(
      '[role="dialog"], [aria-modal="true"]',
    );
    let strategy = "aria";
    if (!dialog) {
      const all = Array.from(document.querySelectorAll<HTMLElement>("div, section, aside"));
      const anchor = all.find(
        (el) => (el.innerText || "").includes(DISCLAIMER) && el.offsetParent !== null,
      );
      if (anchor) {
        let cur: HTMLElement = anchor;
        for (let i = 0; i < 8 && cur.parentElement; i++) {
          const parent = cur.parentElement;
          const pos = getComputedStyle(parent).position;
          if (pos === "fixed" || pos === "absolute") {
            dialog = parent;
            strategy = "disclaimer+positioned";
            break;
          }
          cur = parent;
        }
        if (!dialog) {
          dialog = anchor;
          strategy = "disclaimer-only";
        }
      }
    }
    if (!dialog) return { totalGuestCount: null, rows: [], strategy: "none" };

    // Scroll the dialog (and its inner scroller candidates) until the
    // per-guest user links stop appearing. Luma virtualizes long lists.
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const scrollers = [
      dialog,
      ...Array.from(dialog.querySelectorAll<HTMLElement>('[class*="scroll" i], [class*="overflow" i]')),
    ];
    let lastCount = -1;
    let stable = 0;
    for (let i = 0; i < 80 && stable < 4; i++) {
      for (const c of scrollers) c.scrollTop = c.scrollHeight;
      await sleep(250);
      const n = dialog.querySelectorAll('a[href*="/user/"]').length;
      if (n === lastCount) stable++;
      else {
        stable = 0;
        lastCount = n;
      }
    }

    // Total count from heading.
    let totalGuestCount: number | null = null;
    const headings = Array.from(
      dialog.querySelectorAll<HTMLElement>("h1, h2, h3, h4, [class*='title' i], [class*='heading' i]"),
    );
    for (const h of headings) {
      const m = (h.innerText || "").match(/(\d+(?:,\d{3})*)\s*(?:guests?|going)/i);
      if (m && m[1]) {
        totalGuestCount = parseInt(m[1].replace(/,/g, ""), 10);
        break;
      }
    }

    // Each guest has exactly one <a href="/user/usr-..."> wrapping their
    // avatar + name. The row container is that link's parent — which also
    // contains a sibling <div class="social-links"> with the per-guest
    // social anchors (twitter/x, linkedin, …).
    const userLinks = Array.from(
      dialog.querySelectorAll<HTMLAnchorElement>('a[href*="/user/"]'),
    );

    const rows: DomRow[] = [];
    const seenHandles = new Set<string>();
    for (const userLink of userLinks) {
      const handle = userLink.getAttribute("href") || "";
      if (seenHandles.has(handle)) continue;
      seenHandles.add(handle);

      const row = userLink.parentElement;
      if (!row) continue;

      const img = userLink.querySelector<HTMLImageElement>("img");
      const avatarUrl = img?.currentSrc || img?.src || null;

      const name =
        (userLink.innerText || userLink.textContent || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)[0] || null;
      if (!name) continue;

      const socialUrls = Array.from(row.querySelectorAll<HTMLAnchorElement>("a"))
        .filter((a) => a !== userLink && !userLink.contains(a))
        .map((a) => a.href)
        .filter((href) => isSocial(href));

      rows.push({ name, avatarUrl, socialUrls });
    }

    return { totalGuestCount, rows, strategy };
  });
}

async function scrapeOnce(url: string): Promise<AttendeeResult> {
  await initAgent();
  if (!stagehand) throw new Error("Stagehand failed to initialize");

  const page = stagehand.page;

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

  if (/\/signin(\b|\/|\?)/.test(page.url())) throw new NotAuthenticatedError();

  const docTitle = await page.title();
  const title = docTitle.replace(/\s*[·•|–-]\s*Luma\s*$/i, "").trim() || null;

  // Open the guests dialog. Wording varies ("N Going", "N Guests", an
  // attendees row), so let the LLM pick the right element.
  await page
    .act(
      "Click the element that opens the full guests list dialog — usually a guests count, an attendees row, or a 'Guests' button on the event page. Do NOT click 'Register', 'Subscribe', or any RSVP button.",
    )
    .catch((err) => console.warn("act(open guests) warning:", err?.message ?? err));

  await page.waitForTimeout(1200);

  // Deterministic pass: pull names + social hrefs straight out of the DOM.
  const dom = await scrapeRowsFromDom();

  const visibleAttendees: Attendee[] = dom.rows
    .filter((r): r is DomRow & { name: string } => !!r.name)
    .map((r) => ({
      name: r.name,
      avatarUrl: r.avatarUrl,
      socials: normalizeSocials(r.socialUrls.map((url) => ({ url }))),
    }));

  console.log(
    `scrape: strategy=${dom.strategy} guests=${dom.totalGuestCount ?? "?"} rows=${visibleAttendees.length} withSocials=${visibleAttendees.filter((a) => a.socials.length > 0).length}`,
  );

  return {
    eventUrl: url,
    title,
    totalGuestCount: dom.totalGuestCount,
    visibleAttendees,
    hostVisible: false,
    scrapedAt: new Date().toISOString(),
  };
}

export async function fetchAttendees(url: string): Promise<AttendeeResult> {
  if (!isLumaUrl(url)) throw new InvalidLumaUrlError();

  const next = scrapeChain.then(() => scrapeOnce(url));
  scrapeChain = next.catch(() => undefined);
  return next;
}

// Runs `fn` against the singleton Stagehand instance, serialized through the
// same scrapeChain mutex that fetchAttendees uses. Required because a
// persistent userDataDir Chromium can only be opened by one process at a time
// and shared state across tabs must not race.
export async function runWithBrowser<T>(fn: (sh: Stagehand) => Promise<T>): Promise<T> {
  const next = scrapeChain.then(async () => {
    await initAgent();
    if (!stagehand) throw new Error("Stagehand not initialized");
    return await fn(stagehand);
  });
  scrapeChain = next.catch(() => undefined);
  return next;
}
