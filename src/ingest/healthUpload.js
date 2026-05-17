const DEFAULT_NOTION_VERSION = '2026-03-11';
const MAX_NOTION_INLINE_BODY_BYTES = 10 * 1024 * 1024;
const NOTION_TEXT_CHUNK_CHARS = 1900;
const NOTION_CHILDREN_BATCH_SIZE = 100;

export function timestampedName(ext, date = new Date()) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}` +
    `-${pad(date.getMilliseconds(), 3)}`;
  return `${stamp}.${ext}`;
}

export function getIngestConfig(env = process.env) {
  return {
    notionApiToken: env.NOTION_API_TOKEN || '',
    notionVersion: env.NOTION_VERSION || DEFAULT_NOTION_VERSION,
    healthSyncRunsDataSourceId: env.HEALTH_SYNC_RUNS_DATA_SOURCE_ID || '',
    ingestToken: env.INGEST_TOKEN || '',
  };
}

export function notionEnabled(config) {
  return Boolean(config.notionApiToken && config.healthSyncRunsDataSourceId);
}

export function assertAuthorized(headers, config) {
  if (!config.ingestToken) {
    return;
  }

  const auth = getHeader(headers, 'authorization') || '';
  if (auth !== `Bearer ${config.ingestToken}`) {
    const error = new Error('unauthorized');
    error.statusCode = 401;
    throw error;
  }
}

export function normalizeContentType(contentType) {
  const value = (contentType || '').toLowerCase();
  return value.includes('json') ? 'application/json' : (value || 'application/octet-stream');
}

export async function createHealthSyncRun(config, body, filename, contentType) {
  if (!contentType.includes('json')) {
    const error = new Error(`Unsupported Notion health upload content type: ${contentType}`);
    error.statusCode = 415;
    throw error;
  }
  if (body.length > MAX_NOTION_INLINE_BODY_BYTES) {
    const error = new Error(`Health upload is too large for Notion inline storage: ${body.length} bytes`);
    error.statusCode = 413;
    throw error;
  }

  const now = new Date();
  const page = await notionRequest(config, '/v1/pages', {
    method: 'POST',
    body: {
      parent: {
        type: 'data_source_id',
        data_source_id: config.healthSyncRunsDataSourceId,
      },
      properties: {
        Name: {
          title: [
            {
              text: {
                content: `Health upload - ${filename}`,
              },
            },
          ],
        },
        'Started At': {
          date: {
            start: now.toISOString(),
          },
        },
        Status: {
          status: {
            name: 'uploaded',
          },
        },
        'Anchor Ref': {
          rich_text: [
            {
              text: {
                content: `notion-inline:${filename}`,
              },
            },
          ],
        },
      },
    },
  });

  await appendHealthPayloadBlocks(config, page.id, body.toString('utf8'));

  return {
    pageId: page.id,
  };
}

async function appendHealthPayloadBlocks(config, pageId, contents) {
  const chunks = [];
  for (let offset = 0; offset < contents.length; offset += NOTION_TEXT_CHUNK_CHARS) {
    chunks.push(contents.slice(offset, offset + NOTION_TEXT_CHUNK_CHARS));
  }

  for (let offset = 0; offset < chunks.length; offset += NOTION_CHILDREN_BATCH_SIZE) {
    const batch = chunks.slice(offset, offset + NOTION_CHILDREN_BATCH_SIZE);
    await notionRequest(config, `/v1/blocks/${pageId}/children`, {
      method: 'PATCH',
      body: {
        children: batch.map((chunk, index) => {
          const chunkIndex = offset + index + 1;
          return {
            type: 'code',
            code: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: chunk,
                  },
                },
              ],
              caption: [
                {
                  type: 'text',
                  text: {
                    content: `eucalyptus-health-payload:v1:${chunkIndex}/${chunks.length}`,
                  },
                },
              ],
              language: 'json',
            },
          };
        }),
      },
    });
  }
}

export async function notionRequest(config, pathname, options) {
  const response = await fetch(`https://api.notion.com${pathname}`, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${config.notionApiToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': config.notionVersion,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = json && typeof json.message === 'string' ? json.message : text;
    throw new Error(`Notion API ${options.method} ${pathname} failed: ${message}`);
  }

  return json;
}

function getHeader(headers, name) {
  if (typeof headers.get === 'function') {
    return headers.get(name);
  }

  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}
