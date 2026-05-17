export function getLumaConfig(env = process.env) {
  return {
    webhookToken: env.LUMA_WEBHOOK_TOKEN || env.WEBHOOK_TOKEN || env.INGEST_TOKEN || '',
  };
}

export function assertLumaAuthorized(headers, config) {
  if (!config.webhookToken) {
    const error = new Error('luma webhook token is not configured');
    error.statusCode = 500;
    throw error;
  }

  const auth = getHeader(headers, 'authorization') || '';
  if (auth !== `Bearer ${config.webhookToken}`) {
    const error = new Error('unauthorized');
    error.statusCode = 401;
    throw error;
  }
}

function getHeader(headers, name) {
  if (typeof headers.get === 'function') {
    return headers.get(name);
  }

  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}
