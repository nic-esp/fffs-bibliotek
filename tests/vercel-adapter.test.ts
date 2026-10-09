import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createFetchHandler, normalizeRequest, runtimeEnv, DEFAULT_DATA_BASE_URL } from '../server/adapter.js';
import { runMcpSmoke } from '../scripts/smoke-mcp.js';
import type { EuDocument, EuIndex } from '../lib/eurlex.js';
import type { Catalog } from '../lib/types.js';

test('Vercel adapter accepts exact public/API aliases and preserves request body, headers and query', async () => {
  const payload = '{"jsonrpc":"2.0","id":1,"method":"tools/list"}';
  const request = new Request('https://mcp.example/api/mcp?cursor=a%2Fb', { method: 'POST', headers: { 'content-type': 'application/json', 'x-test': 'kept' }, body: payload });
  const normalized = normalizeRequest(request, '/mcp')!;
  assert.equal(normalized.url, 'https://mcp.example/mcp?cursor=a%2Fb');
  assert.equal(normalized.method, 'POST'); assert.equal(normalized.headers.get('x-test'), 'kept');
  assert.equal(await normalized.text(), payload);
  const original = new Request('https://mcp.example/mcp');
  assert.equal(normalizeRequest(original, '/mcp'), original);
  for (const path of ['/api/health', '/health', '/api/mcp/', '/api/mcp/extra', '/api/%6dcp', '/admin?path=/mcp']) {
    assert.equal(normalizeRequest(new Request(`https://mcp.example${path}`), '/mcp'), null, path);
  }
  assert.equal(normalizeRequest(new Request('https://mcp.example/api/health'), '/health')!.url, 'https://mcp.example/health');
  assert.deepEqual(runtimeEnv({}), { DATA_BASE_URL: DEFAULT_DATA_BASE_URL, ALLOWED_ORIGINS: '*' });
  assert.equal(runtimeEnv({ ALLOWED_ORIGINS: '' }).ALLOWED_ORIGINS, '');
  assert.equal((await createFetchHandler('/mcp')(new Request('https://mcp.example/admin'))).status, 404);
});

test('standalone Vercel runtime serves all 11 tools against the real FFFS/EU corpus without network', async () => {
  const catalog = JSON.parse(await readFile(new URL('../public/data/catalog.json', import.meta.url), 'utf8')) as Catalog;
  const euIndex = JSON.parse(await readFile(new URL('../public/data/eu/index.json', import.meta.url), 'utf8')) as EuIndex;
  const upstream = globalThis.fetch;
  const env = { DATA_BASE_URL: process.env.DATA_BASE_URL, ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS };
  delete process.env.DATA_BASE_URL; delete process.env.ALLOWED_ORIGINS;
  const upstreamPaths: string[] = [];
  // Deterministic local upstream: same public files used by GitHub Pages, no network.
  globalThis.fetch = async input => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.origin, 'https://nic-esp.github.io');
    assert.match(url.pathname, /^\/fffs-bibliotek\/data\/(?:catalog\.json|search\.json|documents\/\d{4}-\d{2,3}\.json|eu\/(?:index\.json|search\.json|documents\/[03]\d{4}[RLD]\d{4}(?:\(\d{2}\))?(?:-\d{8})?\.json))$/);
    const relative = url.pathname.slice('/fffs-bibliotek/'.length);
    upstreamPaths.push(relative);
    const bytes = await readFile(new URL(`../public/${relative}`, import.meta.url));
    return new Response(bytes, { headers: { 'content-type': 'application/json' } });
  };
  const client = new Client({ name: 'fffs-vercel-bundle-test', version: '1.0.0' });
  const resultData = (result: Record<string, unknown>): any => {
    assert.notEqual(result.isError, true, JSON.stringify(result));
    return result.structuredContent;
  };
  try {
    // Dynamic URLs let JS API files keep their deployment format without TS wrappers.
    const mcp = (await import(new URL('../server/api/mcp.js', import.meta.url).href)).default;
    const health = (await import(new URL('../server/api/health.js', import.meta.url).href)).default;
    const headers = { origin: 'https://public-ai.example' };
    const healthResponse = await health.fetch(new Request('https://mcp.example/api/health', { headers }));
    assert.equal(healthResponse.status, 200); assert.equal(healthResponse.headers.get('access-control-allow-origin'), '*');
    const healthData = await healthResponse.json(); assert.equal(healthData.documentCount, catalog.documents.length); assert.equal(healthData.asOf, catalog.asOf);
    const options = await mcp.fetch(new Request('https://mcp.example/api/mcp', { method: 'OPTIONS', headers }));
    assert.equal(options.status, 204); assert.equal(options.headers.get('access-control-allow-credentials'), null);
    assert.equal((await mcp.fetch(new Request('https://mcp.example/mcp'))).status, 405);
    const transport = new StreamableHTTPClientTransport(new URL('https://mcp.example/api/mcp'), {
      fetch: async (input, init) => mcp.fetch(new Request(input, init)),
    });
    await client.connect(transport);
    assert.equal(transport.sessionId, undefined);
    assert.equal((await client.listTools()).tools.length, 11);
    const status = resultData(await client.callTool({ name: 'get_library_status', arguments: {} }));
    assert.equal(status.documentCount, catalog.documents.length); assert.equal(status.asOf, catalog.asOf);
    assert.equal(resultData(await client.callTool({ name: 'list_fffs', arguments: { status: 'all', limit: 1 } })).total, catalog.documents.length);
    const search = resultData(await client.callTool({ name: 'search_fffs', arguments: { query: 'FFFS 2014:4' } }));
    assert.equal(search.total, 1); assert.equal(search.results[0].document.id, '2014-04');
    assert.ok(resultData(await client.callTool({ name: 'search_fffs', arguments: { query: 'hållbarhet' } })).total > 0);
    let cursor: string | undefined; let markdown = ''; let first: any; let pages = 0;
    do {
      const result = resultData(await client.callTool({ name: 'get_fffs', arguments: { id: '2014:4', ...(cursor ? { cursor } : {}) } }));
      first ??= result; assert.ok(result.content.length <= 20_000); markdown += result.content; cursor = result.nextCursor;
      assert.ok(++pages < 100, 'Pagination terminates');
    } while (cursor);
    const raw = JSON.parse(await readFile(new URL('../public/data/documents/2014-04.json', import.meta.url), 'utf8'));
    assert.equal(markdown, raw.markdown); assert.ok(pages > 1);
    assert.equal(first.document.canonicalUrl, 'https://nic-esp.github.io/fffs-bibliotek/fffs/2014-04/');
    const section = resultData(await client.callTool({ name: 'get_section', arguments: { id: '2014:4', sectionId: raw.sections[0].id } }));
    assert.ok(section.content.length > 0);
    assert.ok(Array.isArray(resultData(await client.callTool({ name: 'get_amendments', arguments: { id: '2014:4' } })).amendments));
    assert.equal((await client.listResources()).resources.length, catalog.documents.length + 1);
    assert.ok((await client.readResource({ uri: 'fffs://catalog' })).contents.length);
    assert.ok((await client.readResource({ uri: 'fffs://2014-04' })).contents.length);
    assert.equal((await client.listResourceTemplates()).resourceTemplates[0].uriTemplate, 'fffs://{id}');
    const summary = await runMcpSmoke('https://mcp.example/mcp', { fetch: async (input, init) => mcp.fetch(new Request(input, init)) });
    assert.equal(summary.toolCount, 11); assert.equal(summary.euDocumentCount, euIndex.documents.length);
    assert.equal(summary.euAsOf, euIndex.asOf); assert.equal(summary.euMissingCount, euIndex.coverage.missingBaseCelex.length);
    // Compare actual paged output to the checked-in source, including fallback
    // version notes and a real CRR article that exceeds the 20k character bound.
    for (const [baseCelex, articleNumber] of [['32022R2554', '19'], ['32013R0575', '4']]) {
      const metadata = euIndex.documents.find(doc => doc.baseCelex === baseCelex); assert.ok(metadata);
      const source = JSON.parse(await readFile(new URL(`../public/data/eu/documents/${metadata.id}.json`, import.meta.url), 'utf8')) as EuDocument;
      const sourceArticle = source.articles.find(article => article.number === articleNumber); assert.ok(sourceArticle);
      const firstPage = resultData(await client.callTool({ name: 'get_eu_document', arguments: { id: baseCelex } }));
      assert.equal(firstPage.content, source.markdown.slice(0, firstPage.returnedChars));
      assert.equal(firstPage.totalChars, source.markdown.length);
      assert.deepEqual(firstPage.document.notes, source.notes); assert.equal(firstPage.document.retrievedAt, source.retrievedAt);
      assert.equal(firstPage.document.sourceSha256, source.sourceSha256); assert.equal(firstPage.document.versionSelection, source.versionSelection);
      assert.equal(firstPage.document.versionKind, source.versionKind); assert.equal(firstPage.document.consolidationDate, source.consolidationDate);
      assert.equal(firstPage.sections.length, source.sections.length);
      if (firstPage.nextCursor) {
        const secondPage = resultData(await client.callTool({ name: 'get_eu_document', arguments: { id: metadata.id, cursor: firstPage.nextCursor } }));
        assert.equal(secondPage.content, source.markdown.slice(secondPage.offset, secondPage.offset + secondPage.returnedChars));
      }
      let articleCursor: string | undefined; let articleText = ''; let articlePages = 0;
      do {
        const page = resultData(await client.callTool({ name: 'get_eu_article', arguments: { id: baseCelex, article: articleNumber, ...(articleCursor ? { cursor: articleCursor } : {}) } }));
        assert.equal(page.offset, articleText.length); assert.ok(page.content.length <= 20_000);
        assert.equal(page.article.sourceUrl, sourceArticle.sourceUrl); assert.deepEqual(page.document.notes, source.notes);
        articleText += page.content; articleCursor = page.nextCursor; assert.ok(++articlePages <= 64);
      } while (articleCursor);
      assert.equal(articleText, sourceArticle.markdown);
      if (articleNumber === '4') assert.ok(articlePages > 1);
      assert.equal(upstreamPaths.filter(path => path === `data/eu/documents/${metadata.id}.json`).length, 1);
    }
    assert.equal(upstreamPaths.filter(path => path === 'data/catalog.json').length, 1);
    assert.equal(upstreamPaths.filter(path => path === 'data/search.json').length, 1);
    assert.equal(upstreamPaths.filter(path => path === 'data/documents/2014-04.json').length, 1);
    assert.equal(upstreamPaths.filter(path => path === 'data/eu/index.json').length, 1);
    assert.equal(upstreamPaths.filter(path => path === 'data/eu/search.json').length, 1);
  } finally {
    await client.close(); globalThis.fetch = upstream;
    for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
