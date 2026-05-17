import { assertLumaAuthorized, getLumaConfig } from '../../src/luma/auth.js';
import { normalizeResearchInput, researchPerson } from '../../src/luma/research.js';

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  const lumaConfig = getLumaConfig();

  if (req.method === 'GET') {
    res.status(200).json({
      ok: true,
      endpoint: 'luma-research',
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  try {
    assertLumaAuthorized(req.headers, lumaConfig);
    const input = normalizeResearchInput(req.body);
    const result = await researchPerson(input);
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if ((err.statusCode || 500) >= 500) {
      console.error('luma research error:', err);
    }
    res.status(err.statusCode || 500).json({
      ok: false,
      error: err && err.message ? err.message : 'research failed',
    });
  }
}
