import OpenAI from "openai";

import type {
  ResearchCitation,
  ResearchInput,
  ResearchResult,
  SocialLink,
} from "./types.ts";

const MODEL = process.env.RESEARCH_MODEL || "gpt-5";
// "minimal" is rejected by the API when web_search_preview is attached, so
// the lowest compatible setting is "low".
const EFFORT = (process.env.RESEARCH_EFFORT || "low") as
  | "low"
  | "medium"
  | "high";
const MAX_CONCURRENT = Math.max(1, Number(process.env.RESEARCH_MAX_CONCURRENT) || 10);

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (client) return client;
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for /research");
  }
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

// Simple semaphore so concurrent /research calls don't blow OpenAI rate limits
// when the caller fans out 50 people at once.
let inflight = 0;
const waiters: Array<() => void> = [];
async function acquire(): Promise<void> {
  if (inflight < MAX_CONCURRENT) {
    inflight++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  inflight++;
}
function release(): void {
  inflight--;
  const next = waiters.shift();
  if (next) next();
}

function buildPrompt(name: string, socials: SocialLink[]): string {
  const links =
    socials.length > 0
      ? socials.map((s) => `- ${s.platform}: ${s.url}`).join("\n")
      : "- (none provided)";
  return [
    "You are researching a person someone is about to meet at an event.",
    "Use web_search to gather facts about them.",
    "",
    "Step 1 — Find their personal website. Start from the known links (a bio",
    "on X/Twitter, LinkedIn, GitHub often links out to it). If none of those",
    "surface one, search the web for the person's name plus a likely role/",
    "company hint to find a personal site, blog, or portfolio. A personal",
    "site usually reveals the most about their interests, side projects, and",
    "how they describe themselves.",
    "",
    "Step 2 — You MUST issue at least one web_search call for each Known link",
    "below before composing the summary, and one for the personal site if you",
    "found one in Step 1. Read them as primary sources. Cross-check anything",
    "ambiguous against secondary sources (company pages, talk listings, GitHub).",
    "",
    "Step 3 — Return a tight ~250-word profile covering: current role and",
    "company, areas of expertise, recent projects or talks, notable",
    "accomplishments, and the interests they signal publicly (the personal",
    "site is the best source for the last one). If a personal site was found,",
    "include the URL in the profile. If you cannot confidently identify this",
    "specific person, say so plainly in one sentence and stop.",
    "",
    `Name: ${name}`,
    "Known links:",
    links,
  ].join("\n");
}

type ResponsesOutputItem = {
  type?: string;
  content?: Array<{
    annotations?: Array<{
      type?: string;
      url?: string;
      title?: string | null;
    }>;
  }>;
};

function extractCitations(output: unknown): ResearchCitation[] {
  if (!Array.isArray(output)) return [];
  const out: ResearchCitation[] = [];
  const seen = new Set<string>();
  for (const item of output as ResponsesOutputItem[]) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const c of item.content) {
      const annotations = c?.annotations;
      if (!Array.isArray(annotations)) continue;
      for (const a of annotations) {
        if (a?.type === "url_citation" && typeof a.url === "string" && !seen.has(a.url)) {
          seen.add(a.url);
          out.push({ url: a.url, title: a.title ?? null });
        }
      }
    }
  }
  return out;
}

export async function researchPerson(input: ResearchInput): Promise<ResearchResult> {
  const start = Date.now();
  const openai = getClient();

  await acquire();
  try {
    const response = await openai.responses.create({
      model: MODEL,
      input: buildPrompt(input.name, input.socials),
      tools: [{ type: "web_search_preview" }],
      reasoning: { effort: EFFORT },
    });

    const summary = (response.output_text || "").trim();
    const citations = extractCitations(response.output);

    return {
      name: input.name,
      summary,
      citations,
      model: MODEL,
      durationMs: Date.now() - start,
    };
  } finally {
    release();
  }
}
