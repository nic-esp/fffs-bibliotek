import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerToolboxTools } from '../lib/toolbox-mcp.js';
import { euOfficialUrl, type EuArticle, type EuDocument, type EuDocumentSummary, type EuIndex, type EuLoader, type EuSearchCorpus } from '../lib/eurlex.js';
import type { Catalog, LibraryLoader } from '../lib/types.js';
import { catalog as baseCatalog, loader as baseLoader } from './fixtures.js';

const asOf = '2026-10-09'; const retrievedAt = `${asOf}T12:00:00.000Z`;
function euDoc(id: string, baseCelex: string, title: string, long = false): EuDocument {
  const consolidated = id.startsWith('0');
  const article: EuArticle = { id: 'article-5', number: '5', title: 'Artikel 5 — Styrning', kind: 'article', text: `Artikel 5\nÅtgärder för hållbarhet och operativ motståndskraft. ${long ? 'Källa 😀 med sammanhängande text. '.repeat(1_000) : 'En kort artikel.'}`, markdown: '', sourceUrl: `${euOfficialUrl(id)}#art_5` };
  article.markdown = `## ${article.title}\n\n${article.text}`;
  const preamble = { id: 'preamble', kind: 'preamble' as const, title: 'Ingress', text: 'Denna förordning innehåller skäl.', markdown: 'Denna förordning innehåller skäl.', sourceUrl: euOfficialUrl(id) };
  const annex = { id: 'annex-i', kind: 'annex' as const, title: 'BILAGA I', text: 'En fullständig bilaga.', markdown: '## BILAGA I\n\nEn fullständig bilaga.', sourceUrl: `${euOfficialUrl(id)}#anx_I` };
  const markdown = [preamble.markdown, article.markdown, annex.markdown].join('\n\n');
  return {
    id, celex: id, baseCelex, title, label: consolidated ? 'DORA' : 'CRD', language: 'SV', requestedLanguage: 'SV',
    versionKind: consolidated ? 'consolidated' : 'original', consolidationDate: consolidated ? '2026-01-17' : null,
    documentDate: '2022-12-14', inForce: null, inForceReportedAt: retrievedAt, asOf, retrievedAt,
    sourceUrl: euOfficialUrl(id), contentSourceUrl: `https://publications.europa.eu/resource/celex/${id}?language=sv`, sourceSha256: consolidated ? 'a'.repeat(64) : 'b'.repeat(64),
    documentUrl: `data/eu/documents/${id}.json`, markdownUrl: `documents/eu/${id}.md`, sourceHtmlUrl: `sources/eu/${id}.html`,
    articleCount: 1, sectionCount: 3, textCharacters: markdown.length, linkedFffs: [consolidated ? '2014-04' : '2014-12'], articleTitles: [article.title], notes: ['Källuttag; kontrollera den angivna utgåvan.'],
    versionSelection: consolidated ? 'latest_consolidated_as_of' : 'original_no_consolidation_found',
    text: markdown, markdown, articles: [article], sections: [preamble, article, annex],
  };
}
const first = euDoc('02022R2554-20260117', '32022R2554', 'Digital operativ motståndskraft', true);
const second = euDoc('32013L0036', '32013L0036', 'Kapitaltäckningsdirektiv');
const summary = (document: EuDocument): EuDocumentSummary => {
  const { text: _text, markdown: _markdown, articles: _articles, sections: _sections, ...rest } = document;
  return rest;
};
function fixture(documents = [first, second]) {
  const index: EuIndex = { schemaVersion: 1, asOf, retrievedAt, documents: documents.map(summary), failures: [{ baseCelex: '32014R0600', requestedCelex: '32014R0600', stage: 'content', message: 'Källan otillgänglig i detta test.', retrievedAt }], coverage: { linkedActCount: documents.length + 1, importedActCount: documents.length, missingBaseCelex: ['32014R0600'], note: 'Importerade källor, inte en fullständig EU-katalog.' } };
  const corpus: EuSearchCorpus = { schemaVersion: 1, asOf, documents: documents.map(doc => ({ id: doc.id, baseCelex: doc.baseCelex, title: doc.title, label: doc.label, linkedFffs: doc.linkedFffs, text: doc.text, articles: doc.articles })) };
  const reads: string[] = [];
  const euLoader: EuLoader = { index: async () => index, corpus: async () => corpus, document: async id => { reads.push(id); const found = documents.find(doc => doc.id === id); if (!found) throw Error('Missing fixture'); return found; } };
  const relation = (celex: string, type: 'implements' | 'references') => ({ celex, relation: type, title: celex, url: euOfficialUrl(celex), evidence: '1 kap. 1 § hänvisar uttryckligen till rättsakten.', sourceUrl: 'https://www.fi.se/fffs/', sectionId: 'section-5', sourceSectionTitle: '1 kap. 1 §', page: 1, evidenceType: 'explicit_text_reference', sourceTextPath: '/private/do-not-expose' });
  const catalog: Catalog = { ...baseCatalog, documents: baseCatalog.documents.map(doc => ({ ...doc, euRelations: doc.id === '2014-12' ? [relation('32013L0036', 'implements')] : doc.id === '2014-04' ? [relation('32022R2554', 'references'), { ...relation('32013L0036', 'references'), evidence: '' }] : doc.id === '2010-07' ? [relation('32022R2554', 'references')] : [] })) };
  const loader: LibraryLoader = { ...baseLoader, catalog: async () => catalog };
  return { index, corpus, reads, euLoader, loader };
}
async function connect(euLoader: EuLoader, loader: LibraryLoader) {
  const server = new McpServer({ name: 'toolbox-test', version: '1.0.0' }); registerToolboxTools(server, euLoader, loader);
  const client = new Client({ name: 'toolbox-client', version: '1.0.0' }); const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  return { client, close: async () => { await client.close(); await server.close(); } };
}
const data = (result: Record<string, unknown>): any => { assert.notEqual(result.isError, true, JSON.stringify(result)); return result.structuredContent; };

test('five anonymous read tools expose source/version metadata through the official SDK', async () => {
  const f = fixture(); const session = await connect(f.euLoader, f.loader);
  try {
    const tools = (await session.client.listTools()).tools;
    assert.deepEqual(tools.map(tool => tool.name).sort(), ['get_eu_article', 'get_eu_document', 'get_regulatory_links', 'get_toolbox_status', 'search_eu']);
    for (const tool of tools) { assert.equal(tool.annotations?.readOnlyHint, true); assert.equal(tool.annotations?.destructiveHint, false); }
    const result = data(await session.client.callTool({ name: 'search_eu', arguments: { query: 'atgarder hallbarhet', fffsId: 'FFFS 2014:4' } }));
    assert.equal(result.total, 1); assert.equal(result.asOf, asOf); assert.equal(result.results[0].articleId, 'article-5');
    assert.equal(result.results[0].document.id, first.id); assert.equal(result.results[0].document.sourceSha256, first.sourceSha256);
    assert.equal(result.results[0].document.versionKind, 'consolidated'); assert.equal(result.results[0].document.retrievedAt, retrievedAt);
    assert.equal(result.results[0].document.markdownUrl, `https://example.github.io/fffs-bibliotek/documents/eu/${first.id}.md`);
    assert.equal(result.results[0].canonicalUrl, `https://example.github.io/fffs-bibliotek/eu/${first.id}/#article-5`);
    assert.equal(result.coverage.missingBaseCelex[0], '32014R0600');
    const byId = data(await session.client.callTool({ name: 'search_eu', arguments: { query: 'CELEX: 32022R2554' } }));
    assert.equal(byId.total, 1);
    assert.equal(data(await session.client.callTool({ name: 'search_eu', arguments: { celex: '02022R2554-20250117' } })).total, 0);
    const noMatch = data(await session.client.callTool({ name: 'search_eu', arguments: { query: 'no-such-provision' } })); assert.equal(noMatch.total, 0); assert.ok(noMatch.coverage.note);
    const network = globalThis.fetch;
    globalThis.fetch = async () => { throw Error('Toolbox status must not contact providers'); };
    try {
      const status = data(await session.client.callTool({ name: 'get_toolbox_status', arguments: {} }));
      assert.equal(status.eu.documentCount, 2); assert.equal(status.eu.consolidatedCount, 1); assert.equal(status.eu.originalCount, 1);
      assert.equal(status.eu.failures.length, 1); assert.equal(status.fffs.asOf, asOf);
      assert.ok(status.screening.every((provider: { apiEnabled: boolean }) => provider.apiEnabled === false));
    } finally { globalThis.fetch = network; }
  } finally { await session.close(); }
});

test('documents and articles reconstruct fully across 20k pages with version-bound cursors', async () => {
  const f = fixture(); const session = await connect(f.euLoader, f.loader);
  try {
    for (const [name, expected, extra] of [['get_eu_document', first.markdown, {}], ['get_eu_article', first.articles[0].markdown, { article: 'Artikel 5' }]] as const) {
      let cursor: string | undefined; let reconstructed = ''; let pageCount = 0;
      do {
        const page = data(await session.client.callTool({ name, arguments: { id: first.baseCelex, ...extra, ...(cursor ? { cursor } : {}) } }));
        assert.ok(page.content.length <= 20_000); assert.equal(page.document.id, first.id);
        assert.ok(!/[\uD800-\uDBFF]$/.test(page.content)); reconstructed += page.content; cursor = page.nextCursor;
        assert.ok(++pageCount < 10);
      } while (cursor);
      assert.equal(reconstructed, expected); assert.ok(pageCount > 1);
    }
    assert.ok(f.reads.every(id => id === first.id));
    const page = data(await session.client.callTool({ name: 'get_eu_document', arguments: { id: first.id } }));
    assert.ok(page.sections.some((section: { kind: string }) => section.kind === 'annex'));
    const wrongScope = await session.client.callTool({ name: 'get_eu_article', arguments: { id: first.id, article: '5', cursor: page.nextCursor } }); assert.equal(wrongScope.isError, true);
    assert.equal((await session.client.callTool({ name: 'get_eu_article', arguments: { id: first.id, article: '15' } })).isError, true);
    const before = f.reads.length;
    assert.equal((await session.client.callTool({ name: 'get_eu_document', arguments: { id: '02022R2554-20250117' } })).isError, true);
    assert.equal((await session.client.callTool({ name: 'get_eu_document', arguments: { id: '../../credentials' } })).isError, true);
    assert.equal((await session.client.callTool({ name: 'get_eu_document', arguments: { id: 'https://internal.invalid/' } })).isError, true);
    assert.equal((await session.client.callTool({ name: 'get_eu_document', arguments: { id: first.id, maxChars: 20_001 } })).isError, true);
    assert.equal(f.reads.length, before);
  } finally { await session.close(); }
});

test('search totals and pagination remain correct for a corpus larger than the UI helper cap', async () => {
  const documents = Array.from({ length: 125 }, (_, i) => euDoc(`32026R${String(i + 1).padStart(4, '0')}`, `32026R${String(i + 1).padStart(4, '0')}`, `Åtgärder ${i}`));
  const f = fixture(documents); const session = await connect(f.euLoader, f.loader);
  try {
    const found = new Set<string>(); let offset: number | null = 0;
    while (offset !== null) {
      const page = data(await session.client.callTool({ name: 'search_eu', arguments: { query: '', limit: 50, offset } }));
      assert.equal(page.total, 125); for (const hit of page.results) found.add(hit.document.id); offset = page.nextOffset;
    }
    assert.equal(found.size, 125);
  } finally { await session.close(); }
});

test('regulatory links preserve evidence/type and status, omit private paths and expose incomplete mappings', async () => {
  const f = fixture(); const session = await connect(f.euLoader, f.loader);
  try {
    const current = data(await session.client.callTool({ name: 'get_regulatory_links', arguments: {} }));
    assert.equal(current.total, 2); assert.equal(current.unavailableRelationCount, 1);
    assert.deepEqual(current.results.map((hit: any) => hit.relation.type), ['references', 'implements']);
    assert.doesNotMatch(JSON.stringify(current), /private|sourceTextPath/);
    assert.ok(current.results[0].evidenceUrl.endsWith('/fffs/2014-04/#section-5'));
    assert.equal(current.results[0].relation.sectionTitle, '1 kap. 1 §');
    assert.equal(current.results[0].eu.importedDocument.id, first.id);
    const historical = data(await session.client.callTool({ name: 'get_regulatory_links', arguments: { celex: first.id, status: 'all', limit: 1 } }));
    assert.equal(historical.total, 2); assert.equal(historical.nextOffset, 1);
    const secondPage = data(await session.client.callTool({ name: 'get_regulatory_links', arguments: { celex: first.id, status: 'all', limit: 1, offset: 1 } }));
    assert.equal(secondPage.results[0].fffs.status, 'repealed');
    assert.equal(data(await session.client.callTool({ name: 'get_regulatory_links', arguments: { fffsId: 'FFFS 2014:12' } })).total, 1);
  } finally { await session.close(); }
});

test('inconsistent index/corpus/document versions fail explicitly instead of mixing snapshots', async () => {
  const f = fixture(); f.corpus.asOf = '2026-10-08';
  const session = await connect(f.euLoader, f.loader);
  try {
    assert.equal((await session.client.callTool({ name: 'search_eu', arguments: { query: '' } })).isError, true);
    f.corpus.asOf = asOf; f.corpus.documents[1] = f.corpus.documents[0];
    assert.equal((await session.client.callTool({ name: 'search_eu', arguments: { query: '' } })).isError, true);
    f.index.documents[0].sourceSha256 = 'c'.repeat(64);
    assert.equal((await session.client.callTool({ name: 'get_eu_document', arguments: { id: first.id } })).isError, true);
  } finally { await session.close(); }
});
