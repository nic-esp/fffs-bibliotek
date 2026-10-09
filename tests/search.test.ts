import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalId, findSections, pageText, searchDocuments } from '../lib/search.js';
import { catalog, corpus } from './fixtures.js';

test('default scope excludes repealed, upcoming and repealing; filters and empty query work', () => {
  assert.equal(searchDocuments(catalog, corpus).total, 2);
  assert.equal(searchDocuments(catalog, corpus, { status: 'all' }).total, 5);
  assert.equal(searchDocuments(catalog, corpus, { status: 'all', year: 2010 }).results[0].document.id, '2010-07');
  assert.equal(searchDocuments(catalog, corpus, { kind: 'self_consolidated' }).results[0].document.id, '2014-12');
  assert.equal(searchDocuments(catalog, corpus, { limit: 1, offset: 1 }).results.length, 1);
});
test('accent tolerant fulltext produces source metadata and matching section references', () => {
  const result = searchDocuments(catalog, corpus, { query: 'atgarder hallbarhetsrisker' });
  assert.equal(result.total, 2);
  assert.equal(result.asOf, '2026-10-09');
  assert.equal(result.results[0].sectionId, 'kap-2-13a');
  assert.match(result.results[0].snippet, /hållbarhetsrisker/);
  assert.match(result.results[0].document.sourceUrl!, /^https:\/\/www.fi.se/);
  assert.equal(searchDocuments(catalog, corpus, { query: 'hållbarhetsrisker obefintligt' }).total, 0);
});
test('complete FFFS numbers normalize leading zeros without fuzzy matches or paths', () => {
  for (const query of ['FFFS 2014:4', '2014:04', '2014-04']) assert.deepEqual(searchDocuments(catalog, corpus, { query }).results.map(hit => hit.document.id), ['2014-04']);
  for (const id of ['../../secret', 'https://attacker.test', '2014-00', '2014-04/extra']) assert.throws(() => canonicalId(id));
});
test('text cursors reconstruct long documents exactly and reject changed scope/text', () => {
  const text = 'Inledning. ' + 'åtgärd 😀 '.repeat(4000);
  let cursor: string | undefined; let joined = ''; let pages = 0;
  do { const result = pageText(text, '2014-04@2026-10-09', cursor); assert.ok(result.returnedChars <= 20_000); joined += result.content; cursor = result.nextCursor ?? undefined; pages++; } while (cursor);
  assert.equal(joined, text); assert.ok(pages > 1);
  const first = pageText(text, 'one');
  assert.throws(() => pageText(text, 'two', first.nextCursor!));
  assert.throws(() => pageText(text + ' changed', 'one', first.nextCursor!));
});
test('section lookup respects chapter context and ignores cross references', () => {
  const doc = corpus.documents[0];
  assert.deepEqual(findSections(doc, { chapter: '2 kap.', paragraph: '13 a §' }).map(s => s.id), ['kap-2-13a']);
  assert.deepEqual(findSections(doc, { chapter: '3', paragraph: '13a' }).map(s => s.id), ['kap-3-13a']);
  assert.equal(findSections(doc, { paragraph: '14' }).length, 0);
  assert.equal(findSections(doc, { sectionId: 'kap-2-13a' }).length, 1);
});
test('mixed snapshot versions fail rather than silently combining datasets', () => {
  assert.throws(() => searchDocuments(catalog, { ...corpus, asOf: '2026-10-08' }));
});

test('evidence-backed ESG tags are searchable and category/institution filters intersect', () => {
  const result = searchDocuments(catalog, corpus, { query: 'ESG' });
  assert.equal(result.total, 1); assert.equal(result.results[0].document.id, '2014-12');
  assert.equal(result.results[0].sectionId, 'kap-2-13a');
  assert.equal(result.results[0].document.tagsEvidence?.[0].confidence, 'editorial');
  assert.equal(searchDocuments(catalog, corpus, { category: 'ESG och hallbarhet', institution: 'Kreditinstitut' }).total, 1);
  assert.equal(searchDocuments(catalog, corpus, { category: 'ESG och hållbarhet', institution: 'Försäkringsföretag' }).total, 0);
});

test('chapter retrieval ends before commencement and appendices; prose references do not change chapter', () => {
  const doc = { id: '2014-04', markdown: '', sections: [
    {id:'chapter',title:'3 kap. Rapportering',text:''},
    {id:'real',title:'3 kap. 2 §',text:'Hela paragrafen.'},
    {id:'reference',title:'1 kap. 2 § andra stycket i lagen',text:'en fortsättning'},
    {id:'real3',title:'3 kap. 3 §',text:'Nästa paragraf.'},
    {id:'commence',title:'Ikraftträdande- och övergångsbestämmelser',text:'Övergångar'},
    {id:'appendix',title:'Bilaga 1',text:'Blankett'},
    {id:'bad',title:'3 kap. 2 § andra stycket i lagen',text:'En annan hänvisning'}
  ] };
  assert.deepEqual(findSections(doc,{chapter:'3'}).map(x=>x.id),['chapter','real','reference','real3']);
  assert.deepEqual(findSections(doc,{chapter:'3',paragraph:'2'}).map(x=>x.id),['real']);
  assert.equal(findSections(doc,{chapter:'1',paragraph:'2'}).length,0);
});
test('UI can request all 130 rows while MCP independently bounds responses',()=>{
  const docs = Array.from({length:130},(_,i)=>({...catalog.documents[0],id:`2014-${i+1}`}));
  assert.equal(searchDocuments({...catalog,documents:docs},corpus,{limit:200}).results.length,130);
});


test('DORA acronym does not match tillgodoräkna while compounds retain ordinary substring search', async () => {
  const { matchesSearchTerm, normalize } = await import('../lib/search.js');
  assert.equal(matchesSearchTerm(normalize('Institutet får tillgodoräkna sig beloppet'), 'dora'),false);
  assert.equal(matchesSearchTerm(normalize('Enligt Dora-förordningen'), 'dora'),true);
  assert.equal(matchesSearchTerm(normalize('kreditriskhantering'), 'risk'),true);
});
