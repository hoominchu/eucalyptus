import OpenAI from 'openai';
import {
  assertAuthorized,
  getIngestConfig,
  notionRequest,
} from '../src/ingest/healthUpload.js';

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 30,
};

const DEFAULT_LIMIT = 3;
const TITLE_MODEL = 'gpt-4o-mini';

let openaiClient = null;

function getOpenAI() {
  if (openaiClient) return openaiClient;
  if (!process.env.OPENAI_API_KEY) return null;
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

export default async function handler(req, res) {
  const cfg = getDecisionsConfig();

  try {
    assertAuthorized(req.headers, cfg);

    if (!cfg.notionApiToken || !cfg.workerDecisionsDataSourceId) {
      res.status(500).json({ error: 'worker-decisions storage is not configured' });
      return;
    }

    if (req.method === 'GET') {
      const limit = clampLimit(req.query?.limit);
      const decisions = await listLatestDecisions(cfg, limit);
      const humanized = await humanizeTitles(cfg, decisions);
      res.status(200).json({ ok: true, decisions: humanized });
      return;
    }

    if (req.method === 'DELETE') {
      const id = readId(req);
      if (!id) {
        res.status(400).json({ error: 'missing id' });
        return;
      }
      await notionRequest(cfg, `/v1/pages/${id}`, {
        method: 'PATCH',
        body: { in_trash: true },
      });
      res.status(200).json({ ok: true, id });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    if ((err.statusCode || 500) >= 500) {
      console.error('worker-decisions error:', err);
    }
    res.status(err.statusCode || 500).json({
      error: err && err.message ? err.message : 'request failed',
    });
  }
}

function getDecisionsConfig() {
  return {
    ...getIngestConfig(),
    workerDecisionsDataSourceId: process.env.WORKER_DECISIONS_DATA_SOURCE_ID || '',
  };
}

function clampLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.floor(n)), 25);
}

function readId(req) {
  if (req.query && typeof req.query.id === 'string') return req.query.id;
  try {
    const url = new URL(req.url, 'http://x');
    return url.searchParams.get('id');
  } catch {
    return null;
  }
}

async function listLatestDecisions(cfg, limit) {
  const response = await notionRequest(
    cfg,
    `/v1/data_sources/${cfg.workerDecisionsDataSourceId}/query`,
    {
      method: 'POST',
      body: {
        page_size: limit,
        sorts: [{ property: 'Trigger Timestamp', direction: 'descending' }],
      },
    },
  );

  return (response.results ?? []).map(pageToDecision);
}

function pageToDecision(page) {
  const props = page.properties || {};
  return {
    id: page.id,
    name: titleText(props.Name),
    reason: richTextValue(props.Reason),
    decision: selectName(props.Decision),
    modality: selectName(props['Suggested Modality']),
    intensity: selectName(props['Suggested Intensity']),
    status: statusName(props.Status),
    triggerTimestamp: dateStart(props['Trigger Timestamp']),
  };
}

function titleText(prop) {
  if (!prop || !Array.isArray(prop.title)) return '';
  return prop.title.map((t) => t.plain_text ?? '').join('');
}

function richTextValue(prop) {
  if (!prop || !Array.isArray(prop.rich_text)) return '';
  return prop.rich_text.map((t) => t.plain_text ?? '').join('');
}

function selectName(prop) {
  return prop?.select?.name ?? null;
}

function statusName(prop) {
  return prop?.status?.name ?? null;
}

function dateStart(prop) {
  return prop?.date?.start ?? null;
}

async function humanizeTitles(cfg, decisions) {
  const openai = getOpenAI();
  if (!openai) return decisions;

  return Promise.all(
    decisions.map(async (d) => {
      if (!d.id) return d;
      try {
        const newTitle = await generateTitle(openai, d);
        if (!newTitle) return d;
        await notionRequest(cfg, `/v1/pages/${d.id}`, {
          method: 'PATCH',
          body: {
            properties: {
              Name: { title: [{ text: { content: newTitle } }] },
            },
          },
        });
        return { ...d, name: newTitle };
      } catch (err) {
        console.error('humanize title failed:', err);
        return d;
      }
    }),
  );
}

async function generateTitle(openai, decision) {
  const userMsg = [
    `Decision: ${decision.decision || 'unknown'}`,
    `Modality: ${decision.modality || 'unspecified'}`,
    `Intensity: ${decision.intensity || 'unspecified'}`,
    `Reason: ${decision.reason || '(no reason given)'}`,
  ].join('\n');

  const response = await openai.chat.completions.create({
    model: TITLE_MODEL,
    temperature: 0.9,
    max_tokens: 24,
    messages: [
      {
        role: 'system',
        content:
          'You write short, punchy titles for workout suggestions in a fitness app. ' +
          'Use 3-6 words in Title Case. Be specific to the suggestion. ' +
          'No quotes, no trailing punctuation, no emojis. ' +
          'Avoid clichés like "Crush It" or "Beast Mode".',
      },
      { role: 'user', content: userMsg },
    ],
  });

  const raw = response.choices?.[0]?.message?.content ?? '';
  return cleanTitle(raw);
}

function cleanTitle(raw) {
  const trimmed = raw.trim().replace(/^["'`]+|["'`.!?]+$/g, '').trim();
  return trimmed;
}
