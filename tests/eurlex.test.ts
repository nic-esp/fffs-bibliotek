import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseDocument, DomUtils } from 'htmlparser2';
import { normalizeCelex, baseCelexOf, parseEuHtml, getEuArticle, searchEuDocuments, createEuLoader, type EuDocument, type EuIndex } from '../lib/eurlex.js';

const fixture = `<html lang="sv"><head><title>Document</title><script>never import me</script></head><body>
<div class="eli-main-title"><p class="oj-doc-ti">En svensk förordning för strukturell testning</p></div>
<p>Ingressens text ska bevaras. ${'Detta är ett uttryckligen syntetiskt parsertest. '.repeat(10)}</p>
<div class="eli-subdivision" id="art_1"><p class="title-article-norm">Artikel 1</p><p class="stitle-article-norm">Tillämpningsområde</p>
<div class="norm"><span class="no-parag">1.</span><div class="norm inline-element">Direkt text i en div måste också bevaras.</div></div>
<p class="norm">Artikel 449b.</p><table><tr><td>a)</td><td><p class="oj-ti-art">Artikel 9</p><p>En citerad ändring är ingen egen artikel.</p></td></tr></table>
</div><div class="eli-subdivision" id="art_2"><p class="title-article-norm">Artikel 2</p><p class="stitle-article-norm">Rapportering</p><p>Rapporteringen ska beskrivas här.</p></div>
<p>BILAGA I</p><table class="oj-table"><tr><th>Kod</th><th>Belopp</th></tr><tr><td>A</td><td>100</td></tr></table>
</body></html>`;

test('parser preserves the preamble, inline div text and annex; cross-references and quotations are not articles', () => {
  const parsed = parseEuHtml(fixture,{celex:'02022R2554-20221227'});
  assert.deepEqual(parsed.articles.map(a=>a.number),['1','2']);
  assert.equal(parsed.articles[0].id,'article-1');
  assert.match(parsed.articles[0].text,/Direkt text i en div/);
  assert.match(parsed.articles[0].text,/Artikel 449b/);
  assert.match(parsed.articles[0].text,/En citerad ändring/);
  assert.doesNotMatch(parsed.articles[0].text,/Rapporteringen ska/);
  assert.match(parsed.sections.find(s=>s.kind==='preamble')!.text,/Ingressens text/);
  assert.match(parsed.sections.find(s=>s.kind==='annex')!.markdown,/\| A \| 100 \|/);
  assert.doesNotMatch(parsed.text,/never import me/);
  assert.match(parsed.articles[1].sourceUrl,/#art_2$/);
});

test('ambiguous duplicate own articles, non-Swedish bodies and access challenges fail closed', () => {
  assert.throws(()=>parseEuHtml(fixture.replace('>Artikel 2<','>Artikel 1<'),{celex:'32022R2554'}),/Dubbel/);
  assert.throws(()=>parseEuHtml(fixture.replace('lang="sv"','lang="en"'),{celex:'32022R2554'}),/språk/);
  assert.throws(()=>parseEuHtml('verify that you are not a robot '+fixture,{celex:'32022R2554'}),/åtkomstutmaning/);
});

test('CELEX keeps the exact dated version and rejects path or query injection', () => {
  assert.equal(normalizeCelex('celex:02022r2554-20221227'),'02022R2554-20221227');
  assert.equal(baseCelexOf('02022R2554-20221227'),'32022R2554');
  for(const value of ['../../private','32022R2554?url=x','02022R2554','32022R2554-20221227','02022R2554-20260230'])assert.throws(()=>normalizeCelex(value));
});

test('full-text search finds article content absent from metadata and respects linked FFFS filters', () => {
  const parsed=parseEuHtml(fixture,{celex:'32022R2554'});
  const corpus={schemaVersion:1 as const,asOf:'2026-10-09',documents:[{id:'32022R2554',baseCelex:'32022R2554',title:parsed.title,label:'DORA',linkedFffs:['2024-20'],text:parsed.text,articles:parsed.articles}]};
  const results=searchEuDocuments(corpus,'rapporteringen',{fffsId:'2024-20'});
  assert.equal(results.length,1);assert.equal(results[0].articleId,'article-2');
  assert.equal(searchEuDocuments(corpus,'rapporteringen',{fffsId:'2014-12'}).length,0);
  assert.equal(getEuArticle(parsed,'Artikel 2')?.number,'2');
  const misleading={schemaVersion:1 as const,asOf:'2026-10-09',documents:[{...corpus.documents[0],id:'32013R0575',baseCelex:'32013R0575',title:'Kapitaltäckning',label:'CRR',text:'Företaget får tillgodoräkna sig beloppet.',articles:[]}]};
  assert.equal(searchEuDocuments(misleading,'DORA').length,0);
});

test('loader restricts host, expires cache, limits bytes and validates document identity', async () => {
  for(const url of ['https://evil.test/','http://example.github.io/','https://example.github.io.evil.test/','https://a:b@example.github.io/'])assert.throws(()=>createEuLoader(url));
  assert.throws(()=>createEuLoader('http://localhost:5173/'));
  assert.doesNotThrow(()=>createEuLoader('http://localhost:5173/',fetch,{allowLocalhost:true}));
  let count=0;const index={schemaVersion:1,documents:[],coverage:{}};
  const loader=createEuLoader('https://example.github.io/fffs/',async()=>{count++;return Response.json(index);},{ttlMs:0});
  await loader.index();await loader.index();assert.equal(count,2);
  const large=createEuLoader('https://example.github.io/',async()=>new Response('{}',{headers:{'content-length':'4000001'}}));
  await assert.rejects(large.index(),/storleksgränsen/);
  const wrong=createEuLoader('https://example.github.io/',async()=>Response.json({id:'32013R0575',language:'SV',articles:[],markdown:'text'}));
  await assert.rejects(wrong.document('32022R2554'),/identitet/);
});

test('imported official corpus has valid provenance and article boundaries', async () => {
  let index:EuIndex;
  try{index=JSON.parse(await readFile(new URL('../public/data/eu/index.json',import.meta.url),'utf8'));}catch{return;}
  assert.ok(index.documents.length>0);
  for(const entry of index.documents){
    const doc:EuDocument=JSON.parse(await readFile(new URL(`../public/${entry.documentUrl}`,import.meta.url),'utf8'));
    const source=await readFile(new URL(`../public/${entry.sourceHtmlUrl}`,import.meta.url),'utf8');
    assert.equal(createHash('sha256').update(source).digest('hex'),entry.sourceSha256);
    // Independent source-coverage check: every source letter/digit, in order,
    // survives extraction after only the documented non-body chrome is removed.
    const tree=parseDocument(source);
    DomUtils.findAll(n=>['head','script','style','noscript'].includes(n.name)||n.attribs?.id==='banner',tree.children).forEach(DomUtils.removeElement);
    const mastheads=DomUtils.findAll(n=>/\boj-hd-(ti|oj|date|lg)\b/.test(n.attribs?.class??''),tree.children);
    for(const marker of mastheads){let parent=marker as typeof marker | typeof tree;while(parent.parent && !('name' in parent && parent.name==='table'))parent=parent.parent as typeof parent;if('name' in parent && parent.name==='table')DomUtils.removeElement(parent);}
    const body=DomUtils.getElementsByTagName('body',tree)[0]??tree;
    const sourceCharacters=DomUtils.textContent(body).replace(/[^\p{L}\p{N}]/gu,'');
    const importedCharacters=doc.text.replace(/\[Illustration\/formel: se originalet\]/g,'').replace(/[^\p{L}\p{N}]/gu,'');
    assert.equal(importedCharacters,sourceCharacters,`Body character coverage: ${doc.id}`);
    assert.equal(doc.id,entry.id);assert.equal(baseCelexOf(doc.id),doc.baseCelex);assert.equal(doc.language,'SV');
    assert.equal(new Set(doc.articles.map(a=>a.id)).size,doc.articles.length);
    assert.equal(doc.articleCount,doc.articles.length);assert.ok(doc.text.length>1000);
    if(doc.versionKind==='consolidated'){assert.ok(doc.id.startsWith('0'));assert.ok(doc.consolidationDate!<=doc.asOf);}
    else{assert.ok(doc.id.startsWith('3'));assert.equal(doc.consolidationDate,null);assert.match(doc.notes.join(' '),/ursprungliga lydelse/);}
  }
  const dora=index.documents.find(d=>d.baseCelex==='32022R2554');
  if(dora){const doc:EuDocument=JSON.parse(await readFile(new URL(`../public/${dora.documentUrl}`,import.meta.url),'utf8'));assert.equal(doc.articleCount,64);assert.match(getEuArticle(doc,'19')!.text,/rapportera/i);assert.ok(doc.sections.some(s=>s.kind==='preamble'));}
});
