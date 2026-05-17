import type { Page } from "playwright";

import { type XTweet, XNotAuthenticatedError } from "./types.ts";

const MAX_SCROLL_ITERATIONS = 120;
const SCROLL_PAUSE_MS = 700;
const MAX_TWEETS_PER_SOURCE = 500;

function looksLikeLoginRedirect(url: string): boolean {
  return /\/(i\/flow\/login|login|account\/access)(\b|\/|\?)/.test(url);
}

async function extractVisibleTweets(page: Page): Promise<XTweet[]> {
  return await page.evaluate(() => {
    const articles = Array.from(
      document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'),
    );
    const out: Array<{ tweetId: string; author: string; createdAt: string; text: string }> = [];
    for (const article of articles) {
      const timeEl = article.querySelector("time");
      if (!timeEl) continue;
      const createdAt = timeEl.getAttribute("datetime");
      if (!createdAt) continue;

      const linkEl = timeEl.closest("a");
      if (!linkEl) continue;
      const href = linkEl.getAttribute("href") || "";
      const m = href.match(/^\/([^\/]+)\/status\/(\d+)/);
      if (!m || !m[1] || !m[2]) continue;

      const textEl = article.querySelector('[data-testid="tweetText"]');
      const text = (textEl as HTMLElement | null)?.innerText || "";

      out.push({ author: m[1], tweetId: m[2], createdAt, text });
    }
    return out;
  });
}

async function scrollAndCollect(page: Page, windowMs: number): Promise<XTweet[]> {
  const cutoff = Date.now() - windowMs;
  const tweets = new Map<string, XTweet>();
  let stableTicks = 0;
  let lastSize = 0;

  for (let i = 0; i < MAX_SCROLL_ITERATIONS && stableTicks < 4; i++) {
    const batch = await extractVisibleTweets(page);
    let oldestInBatch = Infinity;
    for (const t of batch) {
      tweets.set(t.tweetId, t);
      const ts = Date.parse(t.createdAt);
      if (Number.isFinite(ts) && ts < oldestInBatch) oldestInBatch = ts;
    }

    // We've scrolled past the window — no need to keep going.
    if (oldestInBatch !== Infinity && oldestInBatch < cutoff) break;

    if (tweets.size === lastSize) stableTicks++;
    else {
      stableTicks = 0;
      lastSize = tweets.size;
    }

    if (tweets.size >= MAX_TWEETS_PER_SOURCE) break;

    await page.keyboard.press("End").catch(() => {});
    await page.mouse.wheel(0, 2500).catch(() => {});
    await page.waitForTimeout(SCROLL_PAUSE_MS);
  }

  return Array.from(tweets.values())
    .filter((t) => Date.parse(t.createdAt) >= cutoff)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

async function navigateAndCheckAuth(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  if (looksLikeLoginRedirect(page.url())) throw new XNotAuthenticatedError();
}

export async function detectUsername(page: Page): Promise<string | null> {
  await navigateAndCheckAuth(page, "https://x.com/home");
  return await page.evaluate(() => {
    const link = document.querySelector<HTMLAnchorElement>(
      'a[data-testid="AppTabBar_Profile_Link"]',
    );
    const href = link?.getAttribute("href") || "";
    const handle = href.replace(/^\//, "").trim();
    return handle || null;
  });
}

export async function scrapeXPosts(
  page: Page,
  username: string,
  windowMs: number,
): Promise<XTweet[]> {
  await navigateAndCheckAuth(page, `https://x.com/${username}`);
  const all = await scrollAndCollect(page, windowMs);
  // Reposts from other authors show up on the profile timeline; drop them so
  // the corpus only reflects what the user themselves wrote.
  return all.filter((t) => t.author.toLowerCase() === username.toLowerCase());
}

export async function scrapeXBookmarks(page: Page, windowMs: number): Promise<XTweet[]> {
  await navigateAndCheckAuth(page, "https://x.com/i/bookmarks");
  return await scrollAndCollect(page, windowMs);
}
