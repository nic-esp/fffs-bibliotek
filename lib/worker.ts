import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createFffsServer } from './mcp.js';
import { GitHubPagesLoader } from './loader.js';
import type { LibraryLoader } from './types.js';

export interface Env { DATA_BASE_URL: string; ALLOWED_ORIGINS?: string }
export function createWorker(loader: LibraryLoader, allowedOrigins: string[] = []) {
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== '/mcp' && url.pathname !== '/health') return new Response('Not found', { status: 404 });
      const origin = request.headers.get('origin');
      const publicCors = allowedOrigins.includes('*');
      if (origin && !publicCors && origin !== url.origin && !allowedOrigins.includes(origin)) return new Response('Origin not allowed', { status: 403 });
      const cors = new Headers({ vary: 'Origin', 'cache-control': 'no-store' });
      if (publicCors) cors.set('access-control-allow-origin', '*');
      else if (origin) cors.set('access-control-allow-origin', origin);
      cors.set('access-control-allow-methods', 'POST, GET, OPTIONS');
      cors.set('access-control-allow-headers', 'Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID');
      cors.set('access-control-expose-headers', 'MCP-Protocol-Version, MCP-Session-Id');
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (url.pathname === '/health') {
        if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, OPTIONS' } });
        try { const catalog = await loader.catalog(); return Response.json({ ok: true, service: 'fffs-library', asOf: catalog.asOf, documentCount: catalog.documents.length }, { headers: cors }); }
        catch { return Response.json({ ok: false, service: 'fffs-library', error: 'Källkatalogen är inte tillgänglig.' }, { status: 503, headers: cors }); }
      }
      // Stateless JSON responses: no standalone server event stream or session to delete.
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: new Headers([...cors, ['allow', 'POST, OPTIONS']]) });
      const server = createFffsServer(loader);
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 65_536 });
      try {
        await server.connect(transport);
        const response = await transport.handleRequest(request);
        const headers = new Headers(response.headers); cors.forEach((value, name) => headers.set(name, value));
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      } catch {
        return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'MCP-anropet kunde inte slutföras.' } }, { status: 500, headers: cors });
      } finally { await server.close(); }
    }
  };
}

// Bounded to one configured deployment corpus per Worker isolate.
let configured: { key: string; worker: ReturnType<typeof createWorker> } | undefined;
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const key = `${env.DATA_BASE_URL}\n${env.ALLOWED_ORIGINS ?? ''}`;
    try {
      if (!configured || configured.key !== key) {
        const loader = new GitHubPagesLoader(env.DATA_BASE_URL);
        const origins = (env.ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
        configured = { key, worker: createWorker(loader, [loader.base.origin, ...origins]) };
      }
      return await configured.worker.fetch(request);
    } catch { return Response.json({ ok: false, error: 'MCP-konfigurationen är inte giltig.' }, { status: 503 }); }
  }
};
