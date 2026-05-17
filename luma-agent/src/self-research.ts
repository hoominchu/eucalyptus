import OpenAI from "openai";

import { runWithBrowser } from "./agent.ts";
import {
  detectUsername,
  scrapeXBookmarks,
  scrapeXPosts,
} from "./x-scrape.ts";
import {
  type SelfResearchResult,
  type XTweet,
  XNotAuthenticatedError,
} from "./types.ts";

const MODEL = process.env.SELF_RESEARCH_MODEL || process.env.RESEARCH_MODEL || "gpt-5";
const EFFORT = (process.env.SELF_RESEARCH_EFFORT || "low") as
  | "minimal"
  | "low"
  | "medium"
  | "high";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (client) return client;
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for /self-research");
  }
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

function fmt(t: XTweet): string {
  const clean = t.text.replace(/\s+/g, " ").trim();
  return `- ${t.createdAt} @${t.author}: ${clean}`;
}

function buildPrompt(
  username: string,
  windowDays: number,
  posts: XTweet[],
  bookmarks: XTweet[],
): string {
  return [
    `You are analyzing the X (Twitter) activity of @${username} over the last ${windowDays} days.`,
    "Produce a ~300-word profile describing this user's interests, voice, and what they engage with.",
    "Cover:",
    "1. Topics they post about themselves.",
    "2. Topics they bookmark — often a stronger signal of curiosity than what they post.",
    "3. Writing voice / persona.",
    "4. Projects, opinions, or people they keep coming back to.",
    "Do not fabricate. If the data is sparse or contradictory, say so plainly.",
    "",
    `=== POSTS (${posts.length}) ===`,
    posts.length === 0 ? "(none in window)" : posts.map(fmt).join("\n"),
    "",
    `=== BOOKMARKS (${bookmarks.length}) ===`,
    bookmarks.length === 0 ? "(none in window)" : bookmarks.map(fmt).join("\n"),
  ].join("\n");
}

export async function selfResearch(opts: {
  username?: string;
  windowDays?: number;
}): Promise<SelfResearchResult> {
  const start = Date.now();
  const windowDays = opts.windowDays && opts.windowDays > 0 ? opts.windowDays : 30;
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  const { username, posts, bookmarks } = await runWithBrowser(async (sh) => {
    const explicit = opts.username || process.env.X_USERNAME || "";
    const resolved = explicit.trim().replace(/^@/, "") || (await detectUsername(sh.page));
    if (!resolved) throw new XNotAuthenticatedError();

    const p = await scrapeXPosts(sh.page, resolved, windowMs);
    const b = await scrapeXBookmarks(sh.page, windowMs);
    return { username: resolved, posts: p, bookmarks: b };
  });

  console.log(
    `self-research: @${username} window=${windowDays}d posts=${posts.length} bookmarks=${bookmarks.length}`,
  );

  const openai = getClient();
  const response = await openai.responses.create({
    model: MODEL,
    input: buildPrompt(username, windowDays, posts, bookmarks),
    reasoning: { effort: EFFORT },
  });

  return {
    username,
    windowDays,
    postCount: posts.length,
    bookmarkCount: bookmarks.length,
    summary: (response.output_text || "").trim(),
    model: MODEL,
    durationMs: Date.now() - start,
  };
}
