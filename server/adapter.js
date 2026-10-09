import worker from './worker.mjs';

export const DEFAULT_DATA_BASE_URL = 'https://nic-esp.github.io/fffs-bibliotek/';

// Vercel may pass either the public URL or the rewritten /api URL. Only exact
// route aliases are accepted; query/header values never select another route.
export function normalizeRequest(request, endpoint) {
  if (endpoint !== '/mcp' && endpoint !== '/health') throw new TypeError('Invalid endpoint');
  const url = new URL(request.url);
  if (url.pathname !== endpoint && url.pathname !== `/api${endpoint}`) return null;
  if (url.pathname === endpoint) return request;
  url.pathname = endpoint;
  return new Request(url, request);
}

export function runtimeEnv(env = process.env) {
  return {
    DATA_BASE_URL: env.DATA_BASE_URL || DEFAULT_DATA_BASE_URL,
    ALLOWED_ORIGINS: env.ALLOWED_ORIGINS ?? '*',
  };
}

export function createFetchHandler(endpoint) {
  return async function fetch(request) {
    const normalized = normalizeRequest(request, endpoint);
    if (!normalized) return new Response('Not found', { status: 404 });
    return worker.fetch(normalized, runtimeEnv());
  };
}
