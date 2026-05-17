import { assertLumaAuthorized, getLumaConfig } from '../../src/luma/auth.js';

export default async function handler(req, res) {
  const lumaConfig = getLumaConfig();

  if (req.method === 'GET') {
    res.status(200).json({
      ok: true,
      endpoint: 'luma-attendees',
      browserRequired: true,
    });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  try {
    assertLumaAuthorized(req.headers, lumaConfig);
    res.status(501).json({
      ok: false,
      error:
        'Luma attendee scraping requires the local luma-agent browser service with a persistent logged-in Chromium profile. Use luma-agent locally for /attendees.',
      localEndpoint: 'http://127.0.0.1:8780/attendees',
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      ok: false,
      error: err && err.message ? err.message : 'attendees failed',
    });
  }
}
