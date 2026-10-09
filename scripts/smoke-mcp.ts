import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const expectedTools = ['search_fffs', 'list_fffs', 'get_fffs', 'get_section', 'get_amendments', 'get_library_status', 'search_eu', 'get_eu_document', 'get_eu_article', 'get_regulatory_links', 'get_toolbox_status'].sort();
const data = (result: Record<string, unknown>): any => { assert.notEqual(result.isError, true, JSON.stringify(result)); assert.ok(result.structuredContent); return result.structuredContent; };
function euMetadata(document: any) {
  assert.equal(document.language, 'SV'); assert.equal(document.requestedLanguage, 'SV');
  assert.match(document.sourceSha256, /^[a-f0-9]{64}$/i);
  assert.match(document.asOf, /^\d{4}-\d{2}-\d{2}$/); assert.ok(Number.isFinite(Date.parse(document.retrievedAt)));
  assert.ok(['original', 'consolidated'].includes(document.versionKind));
  assert.equal(new URL(document.sourceUrl).hostname, 'eur-lex.europa.eu');
  assert.ok(document.canonicalUrl.endsWith(`/eu/${document.id}/`));
  for (const field of ['canonicalUrl', 'documentUrl', 'markdownUrl', 'sourceHtmlUrl']) assert.equal(new URL(document[field]).protocol, 'https:');
  assert.ok(Array.isArray(document.notes)); assert.ok(document.notes.length > 0);
  assert.equal(typeof document.versionSelection, 'string');
  if (document.versionKind === 'consolidated') {
    assert.match(document.consolidationDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(document.id.endsWith(document.consolidationDate.replaceAll('-', '')));
  } else assert.ok(document.id.startsWith('3'));
}
function assertPage(page: any, expectedOffset: number) {
  assert.equal(typeof page.content, 'string'); assert.ok(page.content.length > 0 && page.content.length <= 20_000);
  assert.equal(page.offset, expectedOffset); assert.equal(page.returnedChars, page.content.length);
  assert.ok(page.totalChars >= expectedOffset + page.returnedChars);
  assert.ok(!/[\uD800-\uDBFF]$/.test(page.content), 'Pages do not split a Unicode surrogate pair');
  if (page.nextCursor === null) assert.equal(expectedOffset + page.returnedChars, page.totalChars);
  else { assert.equal(typeof page.nextCursor, 'string'); assert.ok(expectedOffset + page.returnedChars < page.totalChars); }
}

/** Anonymous production smoke; optional fetch keeps local adapter tests network-free. */
export async function runMcpSmoke(endpoint: string | URL, options: { fetch?: typeof fetch } = {}) {
  const client = new Client({ name: 'fffs-public-smoke', version: '2.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), options.fetch ? { fetch: options.fetch } : undefined);
  await client.connect(transport);
  try {
    assert.equal(transport.sessionId, undefined);
    const tools = await client.listTools(); assert.deepEqual(tools.tools.map(tool => tool.name).sort(), expectedTools);
    for (const tool of tools.tools) assert.equal(tool.annotations?.readOnlyHint, true);
    const status = data(await client.callTool({ name: 'get_library_status', arguments: {} }));
    const all = data(await client.callTool({ name: 'list_fffs', arguments: { status: 'all', limit: 1 } })); assert.equal(all.total, status.documentCount);
    const search = data(await client.callTool({ name: 'search_fffs', arguments: { query: 'FFFS 2014:4' } })); assert.equal(search.total, 1);
    const first = data(await client.callTool({ name: 'get_fffs', arguments: { id: '2014:4' } })); assertPage(first, 0); assert.equal(first.asOf, status.asOf);
    if (first.nextCursor) assertPage(data(await client.callTool({ name: 'get_fffs', arguments: { id: '2014:4', cursor: first.nextCursor } })), first.returnedChars);
    const sectionId = first.sections[0]?.id; assert.ok(sectionId);
    assert.ok(data(await client.callTool({ name: 'get_section', arguments: { id: '2014:4', sectionId } })).content.length > 0);
    data(await client.callTool({ name: 'get_amendments', arguments: { id: '2014:4' } }));
    const resources = await client.listResources(); assert.ok(resources.resources.some(resource => resource.uri === 'fffs://catalog'));
    await client.readResource({ uri: 'fffs://catalog' }); await client.readResource({ uri: 'fffs://2014-04' }); await client.listResourceTemplates();

    const toolbox = data(await client.callTool({ name: 'get_toolbox_status', arguments: {} }));
    assert.equal(toolbox.fffs.documentCount, status.documentCount); assert.equal(toolbox.fffs.asOf, status.asOf);
    assert.ok(toolbox.eu.documentCount > 0); assert.equal(toolbox.eu.coverage.importedActCount, toolbox.eu.documentCount);
    assert.ok(Array.isArray(toolbox.eu.failures)); assert.ok(toolbox.screening.every((provider: any) => provider.apiEnabled === false));
    const euDocuments = new Map<string, any>(); let offset: number | null = 0; let listPages = 0;
    while (offset !== null) {
      const page = data(await client.callTool({ name: 'search_eu', arguments: { query: '', limit: 50, offset } }));
      assert.equal(page.total, toolbox.eu.documentCount); assert.equal(page.asOf, toolbox.eu.asOf); assert.equal(page.offset, offset);
      for (const hit of page.results) { euMetadata(hit.document); assert.ok(!euDocuments.has(hit.document.id)); euDocuments.set(hit.document.id, hit.document); }
      assert.ok(page.nextOffset === null || page.nextOffset > offset); offset = page.nextOffset;
      assert.ok(++listPages <= 100, 'EU listing pagination is bounded');
    }
    assert.equal(euDocuments.size, toolbox.eu.documentCount);
    const dora = [...euDocuments.values()].find(doc => doc.baseCelex === '32022R2554');
    const crr = [...euDocuments.values()].find(doc => doc.baseCelex === '32013R0575'); assert.ok(dora && crr, 'DORA and CRR are present');
    const exact = data(await client.callTool({ name: 'search_eu', arguments: { query: 'CELEX: 32022R2554' } })); assert.equal(exact.total, 1); assert.equal(exact.results[0].document.id, dora.id);
    const fulltext = data(await client.callTool({ name: 'search_eu', arguments: { query: 'incidentrapportering', celex: '32022R2554' } })); assert.equal(fulltext.total, 1);
    const links = data(await client.callTool({ name: 'get_regulatory_links', arguments: { celex: '32022R2554', status: 'all', limit: 10 } }));
    assert.ok(links.total > 0); assert.equal(links.asOf, status.asOf);
    for (const link of links.results) { assert.ok(link.relation.evidence); assert.ok(['references', 'implements', 'supplements'].includes(link.relation.type)); assert.equal(new URL(link.evidenceUrl).protocol, 'https:'); }
    const crrFirst = data(await client.callTool({ name: 'get_eu_document', arguments: { id: crr.baseCelex } }));
    euMetadata(crrFirst.document); assertPage(crrFirst, 0); assert.ok(crrFirst.nextCursor); assert.equal(crrFirst.document.id, crr.id);
    const crrNext = data(await client.callTool({ name: 'get_eu_document', arguments: { id: crr.id, cursor: crrFirst.nextCursor } }));
    assertPage(crrNext, crrFirst.returnedChars); assert.equal(crrNext.totalChars, crrFirst.totalChars); assert.equal(crrNext.document.sourceSha256, crrFirst.document.sourceSha256);
    assert.ok(crrFirst.sections.some((section: any) => section.kind === 'article' && section.number === '4'));

    const articleChecks = [];
    for (const [document, article] of [[dora, '19'], [crr, '4']] as const) {
      let cursor: string | undefined; let text = ''; let pages = 0; const cursors = new Set<string>();
      do {
        const page = data(await client.callTool({ name: 'get_eu_article', arguments: { id: document.baseCelex, article, ...(cursor ? { cursor } : {}) } }));
        euMetadata(page.document); assert.equal(page.document.sourceSha256, document.sourceSha256); assertPage(page, text.length);
        assert.equal(page.article.number, article); assert.equal(page.article.id, `article-${article}`); assert.ok(page.article.sourceUrl.startsWith('https://eur-lex.europa.eu/'));
        assert.ok(page.article.canonicalUrl.endsWith(`#article-${article}`)); text += page.content; cursor = page.nextCursor;
        if (cursor) { assert.ok(!cursors.has(cursor)); cursors.add(cursor); }
        assert.ok(++pages <= 64, 'Article pagination is bounded');
      } while (cursor);
      assert.ok(text.includes(`Artikel ${article}`));
      if (article === '4') assert.ok(pages > 1, 'CRR Article 4 exercises actual 20k pagination');
      articleChecks.push({ baseCelex: document.baseCelex, id: document.id, article, pages, characters: text.length, versionKind: document.versionKind });
    }
    return { ok: true, endpoint: String(endpoint), asOf: status.asOf, toolCount: tools.tools.length, documentCount: all.total, resourceCount: resources.resources.length, euAsOf: toolbox.eu.asOf, euDocumentCount: euDocuments.size, euMissingCount: toolbox.eu.coverage.missingBaseCelex.length, euListPages: listPages, crrDocumentPagesChecked: 2, articleChecks, canonicalUrl: first.document.canonicalUrl };
  } finally { await client.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const endpoint = process.argv[2];
  if (!endpoint) throw new Error('Usage: npx tsx scripts/smoke-mcp.ts https://<public-host>/mcp');
  console.log(JSON.stringify(await runMcpSmoke(endpoint), null, 2));
}
