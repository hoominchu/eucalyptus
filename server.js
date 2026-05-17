import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  assertAuthorized,
  createHealthSyncRun,
  getIngestConfig,
  normalizeContentType,
  notionEnabled,
  timestampedName,
} from './src/ingest/healthUpload.js';

const PORT = Number(process.env.PORT) || 8765;
const OUT_DIR = path.join(os.homedir(), '.eucalyptus', 'apple-health-data');
const MAX_BODY_BYTES = 200 * 1024 * 1024;

fs.mkdirSync(OUT_DIR, { recursive: true });

const server = http.createServer((req, res) => {
  const config = getIngestConfig();

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      storage: notionEnabled(config) ? 'notion_page_chunks' : 'local',
      out: OUT_DIR,
    }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }

  try {
    assertAuthorized(req.headers, config);
  } catch (err) {
    res.writeHead(err.statusCode || 401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message || 'unauthorized' }));
    return;
  }

  const chunks = [];
  let total = 0;
  let aborted = false;

  req.on('data', (chunk) => {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      aborted = true;
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'payload too large' }));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', async () => {
    if (aborted) return;
    const body = Buffer.concat(chunks);
    const contentType = req.headers['content-type'] || '';
    const normalizedContentType = normalizeContentType(contentType);
    const ext = normalizedContentType.includes('json') ? 'json' : 'bin';
    const filename = timestampedName(ext);

    try {
      if (notionEnabled(config)) {
        const uploaded = await createHealthSyncRun(config, body, filename, normalizedContentType);
        console.log(`[${new Date().toISOString()}] uploaded ${filename} to Notion sync run ${uploaded.pageId} (${body.length} bytes)`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          storage: 'notion',
          payloadStorage: 'notion_page_chunks',
          file: filename,
          bytes: body.length,
          pageId: uploaded.pageId,
        }));
        return;
      }

      const filepath = path.join(OUT_DIR, filename);
      fs.writeFileSync(filepath, body);
      console.log(`[${new Date().toISOString()}] wrote ${filepath} (${body.length} bytes, ${contentType || 'no content-type'})`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        storage: 'local',
        file: filename,
        bytes: body.length,
      }));
    } catch (err) {
      console.error('upload error:', err);
      if (!res.headersSent) {
        res.writeHead(err.statusCode || 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err && err.message ? err.message : 'upload failed' }));
      }
    }
  });

  req.on('error', (err) => {
    console.error('request error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'server error' }));
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const config = getIngestConfig();
  console.log(`eucalyptus ingest listening on http://0.0.0.0:${PORT}`);
  console.log(`writing to ${OUT_DIR}`);
  console.log(config.ingestToken ? 'auth: bearer token required' : 'auth: disabled (set INGEST_TOKEN to enable)');
  console.log(notionEnabled(config) ? 'storage: notion page chunks' : 'storage: local files (set NOTION_API_TOKEN and HEALTH_SYNC_RUNS_DATA_SOURCE_ID to upload to Notion)');
});
