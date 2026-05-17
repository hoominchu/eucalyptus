import OpenAI from 'openai';

const MODEL = process.env.RESEARCH_MODEL || 'gpt-5';
const EFFORT = process.env.RESEARCH_EFFORT || 'low';
const MAX_CONCURRENT = Math.max(1, Number(process.env.RESEARCH_MAX_CONCURRENT) || 10);

let client = null;
let inflight = 0;
const waiters = [];

function getClient() {
  if (client) return client;
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('OPENAI_API_KEY is required for Luma research.');
    error.statusCode = 500;
    throw error;
  }
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

async function acquire() {
  if (inflight < MAX_CONCURRENT) {
    inflight++;
    return;
  }
  await new Promise((resolve) => waiters.push(resolve));
  inflight++;
}

function release() {
  inflight--;
  const next = waiters.shift();
  if (next) next();
}

export function normalizeResearchInput(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    const error = new Error('name is required');
    error.statusCode = 400;
    throw error;
  }

  const socials = Array.isArray(body?.socials)
    ? body.socials
        .map((social) => ({
          platform: typeof social?.platform === 'string' ? social.platform.trim() : 'website',
          url: typeof social?.url === 'string' ? social.url.trim() : '',
        }))
        .filter((social) => social.url)
    : [];

  return { name, socials };
}

export async function researchPerson(input) {
  const start = Date.now();
  const openai = getClient();

  await acquire();
  try {
    const response = await openai.responses.create({
      model: MODEL,
      input: buildPrompt(input.name, input.socials),
      tools: [{ type: 'web_search_preview' }],
      reasoning: { effort: normalizeEffort(EFFORT) },
    });

    return {
      name: input.name,
      summary: (response.output_text || '').trim(),
      citations: extractCitations(response.output),
      model: MODEL,
      durationMs: Date.now() - start,
    };
  } finally {
    release();
  }
}

function normalizeEffort(effort) {
  return effort === 'medium' || effort === 'high' ? effort : 'low';
}

function buildPrompt(name, socials) {
  const links =
    socials.length > 0
      ? socials.map((social) => `- ${social.platform}: ${social.url}`).join('\n')
      : '- (none provided)';

  return [
    'You are researching a person someone is about to meet at an event.',
    'Use web_search to gather facts about them.',
    '',
    'Step 1 - Find their personal website. Start from the known links (a bio',
    'on X/Twitter, LinkedIn, GitHub often links out to it). If none of those',
    "surface one, search the web for the person's name plus a likely role/",
    'company hint to find a personal site, blog, or portfolio. A personal',
    'site usually reveals the most about their interests, side projects, and',
    'how they describe themselves.',
    '',
    'Step 2 - Read the personal site (if found) AND the known links. Use them',
    'as primary sources. Cross-check anything ambiguous against secondary',
    'sources (company pages, talk listings, GitHub).',
    '',
    'Step 3 - Return a tight ~250-word profile covering: current role and',
    'company, areas of expertise, recent projects or talks, notable',
    'accomplishments, and the interests they signal publicly (the personal',
    'site is the best source for the last one). If a personal site was found,',
    'include the URL in the profile. If you cannot confidently identify this',
    'specific person, say so plainly in one sentence and stop.',
    '',
    `Name: ${name}`,
    'Known links:',
    links,
  ].join('\n');
}

function extractCitations(output) {
  if (!Array.isArray(output)) return [];
  const citations = [];
  const seen = new Set();

  for (const item of output) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!Array.isArray(content?.annotations)) continue;
      for (const annotation of content.annotations) {
        if (
          annotation?.type === 'url_citation' &&
          typeof annotation.url === 'string' &&
          !seen.has(annotation.url)
        ) {
          seen.add(annotation.url);
          citations.push({
            url: annotation.url,
            title: annotation.title ?? null,
          });
        }
      }
    }
  }

  return citations;
}
