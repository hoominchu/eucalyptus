import {
  assertAuthorized,
  createHealthSyncRun,
  getIngestConfig,
  normalizeContentType,
  notionEnabled,
  timestampedName,
} from '../src/ingest/healthUpload.js';

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 300,
};

export default async function handler(req, res) {
  const ingestConfig = getIngestConfig();

  if (req.method === 'GET') {
    res.status(200).json({
      ok: true,
      storage: notionEnabled(ingestConfig) ? 'notion_page_chunks' : 'unconfigured',
    });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  try {
    assertAuthorized(req.headers, ingestConfig);

    if (!notionEnabled(ingestConfig)) {
      res.status(500).json({ error: 'notion upload storage is not configured' });
      return;
    }

    const body = await readBody(req);
    const contentType = normalizeContentType(req.headers['content-type'] || '');
    const ext = contentType.includes('json') ? 'json' : 'bin';
    const filename = timestampedName(ext);
    const uploaded = await createHealthSyncRun(ingestConfig, body, filename, contentType);

    res.status(200).json({
      ok: true,
      storage: 'notion',
      payloadStorage: 'notion_page_chunks',
      file: filename,
      bytes: body.length,
      pageId: uploaded.pageId,
    });
  } catch (err) {
    if ((err.statusCode || 500) >= 500) {
      console.error('ingest error:', err);
    }
    res.status(err.statusCode || 500).json({
      error: err && err.message ? err.message : 'upload failed',
    });
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
