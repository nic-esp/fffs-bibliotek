import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createWorker } from '../lib/worker.js';
import { corpus, loader } from './fixtures.js';

const worker = createWorker(loader, ['https://example.github.io']);
const structured = (result: Record<string, unknown>) => result.structuredContent as Record<string, unknown>;
const endpoint = new URL('https://mcp.example.test/mcp');
const fetcher: typeof fetch = async (input, init) => worker.fetch(new Request(input, init));

test('official SDK client initializes and calls all six tools and both resource types over stateless HTTP', async () => {
  const client = new Client({ name: 'fffs-test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(endpoint, { fetch: fetcher });
  await client.connect(transport);
  try {
    assert.equal(transport.sessionId, undefined);
    assert.equal((await client.listTools()).tools.length, 6);
    const search = await client.callTool({ name: 'search_fffs', arguments: { query: 'atgarder hallbarhet' } });
    assert.equal(search.isError, undefined); assert.equal(structured(search).total, 2);
    assert.equal(structured(await client.callTool({ name: 'list_fffs', arguments: {} })).total, 2);
    assert.equal(structured(await client.callTool({ name: 'get_library_status', arguments: {} })).asOf, '2026-10-09');
    const amendments = structured(await client.callTool({ name: 'get_amendments', arguments: { id: '2014:4' } }));
    assert.equal((amendments?.amendments as { future: boolean }[])[0].future, true);
    const section = await client.callTool({ name: 'get_section', arguments: { id: '2014:4', chapter: '2', paragraph: '13 a' } });
    assert.equal((structured(section).matches as unknown[]).length, 1);
    const metadata = structured(section).document as Record<string, string>; assert.equal(metadata.canonicalUrl, 'https://example.github.io/fffs-bibliotek/fffs/2014-04/'); assert.equal(metadata.pdfUrl, 'https://example.github.io/fffs-bibliotek/pdf/2014-04.pdf');
    assert.equal(structured(await client.callTool({ name: 'search_fffs', arguments: { query: 'ESG', institution: 'Kreditinstitut' } })).total, 1);
    const status = structured(await client.callTool({ name: 'get_library_status', arguments: {} })); assert.deepEqual(status.taxonomies, { categories: { 'ESG och hållbarhet': 1 }, institutions: { Kreditinstitut: 1 } });
    let cursor: string | undefined; let text = '';
    do {
      const result = await client.callTool({ name: 'get_fffs', arguments: { id: '2014:04', ...(cursor ? { cursor } : {}) } });
      assert.equal(result.isError, undefined); const data = structured(result);
      assert.ok((data.content as string).length <= 20_000); text += data.content; cursor = data.nextCursor as string | undefined;
    } while (cursor);
    assert.equal(text, corpus.documents[0].markdown);
    const resources = await client.listResources(); assert.ok(resources.resources.some(resource => resource.uri === 'fffs://catalog')); assert.ok(resources.resources.some(resource => resource.uri === 'fffs://2014-04'));
    assert.equal(JSON.parse(((await client.readResource({ uri: 'fffs://catalog' })).contents[0] as { text: string }).text).asOf, '2026-10-09');
    assert.equal(JSON.parse(((await client.readResource({ uri: 'fffs://2014-04' })).contents[0] as { text: string }).text).document.id, '2014-04');
    assert.equal((await client.listResourceTemplates()).resourceTemplates[0].uriTemplate, 'fffs://{id}');
    const invalid = await client.callTool({ name: 'get_fffs', arguments: { id: '../../secret' } }); assert.equal(invalid.isError, true);
    const tooLarge = await client.callTool({ name: 'get_fffs', arguments: { id: '2014:4', maxChars: 20001 } }); assert.equal(tooLarge.isError, true);
  } finally { await client.close(); }
});
test('HTTP routes, origin validation, notifications and malformed protocol requests are handled', async () => {
  assert.equal((await worker.fetch(new Request('https://mcp.example.test/admin'))).status, 404);
  const health = await worker.fetch(new Request('https://mcp.example.test/health')); assert.equal(health.status, 200); assert.equal((await health.json() as { asOf: string }).asOf, '2026-10-09');
  assert.equal((await worker.fetch(new Request(endpoint, { headers: { origin: 'https://evil.test' } }))).status, 403);
  assert.equal((await worker.fetch(new Request(endpoint, { method: 'GET' }))).status, 405);
  const notification = await worker.fetch(new Request(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) })); assert.equal(notification.status, 202);
  const malformed = await worker.fetch(new Request(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{' })); assert.equal(malformed.status, 400);
  const huge = await worker.fetch(new Request(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: 'x'.repeat(70_000) })); assert.equal(huge.status, 413);
});

test('wildcard browser CORS is explicit opt-in without cookies or credential headers', async () => {
  const publicWorker = createWorker(loader, ['*']);
  const headers = { origin: 'https://unrelated-ai-client.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,mcp-protocol-version' };
  const preflight = await publicWorker.fetch(new Request(endpoint, {method:'OPTIONS',headers}));
  assert.equal(preflight.status,204); assert.equal(preflight.headers.get('access-control-allow-origin'),'*');
  assert.equal(preflight.headers.get('access-control-allow-credentials'),null);
  const health = await publicWorker.fetch(new Request('https://mcp.example.test/health',{headers}));
  assert.equal(health.status,200); assert.equal(health.headers.get('access-control-allow-origin'),'*');
  assert.equal((await createWorker(loader).fetch(new Request(endpoint,{method:'OPTIONS',headers}))).status,403);
});
