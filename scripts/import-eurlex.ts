/** Reproducible bounded import from the official public CELLAR interface.
 * Run: npx tsx scripts/import-eurlex.ts --as-of 2026-10-09 [--limit 12] [--refresh]
 * No API key; no challenge solving, proxy rotation or third-party content mirror.
 * See official docs https://op.europa.eu/en/web/cellar/cellar-data and OSS preflight
 * https://github.com/cyanheads/eur-lex-mcp-server/tree/v0.18.2
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { normalizeCelex, baseCelexOf, euOfficialUrl, parseEuHtml, type EuIndex, type EuDocument, type EuDocumentSummary, type EuImportFailure, type EuSearchCorpus } from '../lib/eurlex.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/data/eu');
const endpoint = 'https://publications.europa.eu/webapi/rdf/sparql';
const maxBytes = 40_000_000;
const args = process.argv.slice(2);
const option = (name:string) => { const i=args.indexOf(name); return i<0 ? undefined : args[i+1]; };
const asOf = option('--as-of') ?? new Date().toISOString().slice(0,10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(asOf))) throw new Error('Use --as-of YYYY-MM-DD.');
const maxActs = Number(option('--limit') ?? 1000);
if (!Number.isInteger(maxActs) || maxActs<1) throw new Error('Invalid --limit.');
const refresh = args.includes('--refresh');
const hash = (text:string) => createHash('sha256').update(text).digest('hex');
const save = async (path:string,value:unknown) => writeFile(path,JSON.stringify(value,null,2)+'\n','utf8');
const errorText = (error:unknown) => error instanceof Error ? error.message : String(error);
type Binding = Record<string,{value:string}>;
interface ActMeta { documentDate:string|null; inForce:boolean|null; versions:{celex:string;date:string}[]; available:boolean }
interface LinkedAct { celex:string; label:string; title:string; linkedFffs:string[] }

async function readBounded(response:Response):Promise<string> {
  if (Number(response.headers.get('content-length') ?? 0)>maxBytes) throw new Error('Official response exceeds configured 40 MB import limit.');
  if (!response.body) throw new Error('Empty response body.');
  const chunks:Uint8Array[]=[]; let length=0; const reader=response.body.getReader();
  try { while(true) { const {done,value}=await reader.read(); if(done)break; length+=value.byteLength; if(length>maxBytes){await reader.cancel();throw new Error('Official response exceeds configured 40 MB import limit.');}chunks.push(value); } } finally {reader.releaseLock();}
  return Buffer.concat(chunks).toString('utf8');
}

/** Only documented official hosts; redirects cannot turn the importer into a general URL fetcher. */
async function content(celex:string):Promise<{html:string;url:string;retrievedAt:string}> {
  let url=`https://publications.europa.eu/resource/celex/${normalizeCelex(celex)}`;
  for(let hop=0;hop<10;hop++) {
    const parsed=new URL(url);
    if(!['publications.europa.eu','eur-lex.europa.eu'].includes(parsed.hostname) || parsed.username || parsed.password) throw new Error('Untrusted content redirect.');
    parsed.protocol='https:'; url=parsed.href;
    const response=await fetch(url,{redirect:'manual',headers:{Accept:'application/xhtml+xml,text/html;q=0.9','Accept-Language':'swe','User-Agent':'FFFS-bibliotek/1.0 (public EU-law research import)'},signal:AbortSignal.timeout(35000)});
    if([301,302,303,307,308].includes(response.status)) { const location=response.headers.get('location'); if(!location)throw new Error('Redirect without Location.');url=new URL(location,url).href;await response.body?.cancel();continue; }
    if(!response.ok) {await response.body?.cancel();throw new Error(`Official content HTTP ${response.status}; no bypass attempted.`);}
    const type=response.headers.get('content-type') ?? '';
    if(!/html/i.test(type)) {await response.body?.cancel();throw new Error(`Unsupported official content type: ${type}`);}
    return {html:await readBounded(response),url,retrievedAt:new Date().toISOString()};
  }
  throw new Error('Too many official content redirects.');
}

async function metadata(acts:LinkedAct[],failures:EuImportFailure[]):Promise<Map<string,ActMeta>> {
  const result=new Map<string,ActMeta>();
  for (let offset=0;offset<acts.length;offset+=24) {
    const slice=acts.slice(offset,offset+24);
    const query=`PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>\nPREFIX xsd: <http://www.w3.org/2001/XMLSchema#>\nSELECT DISTINCT ?baseCelex ?work ?date ?inForce ?versionCelex ?versionDate WHERE {\n VALUES ?baseCelex { ${slice.map(a=>'"'+a.celex+'"^^xsd:string').join(' ')} }\n ?work cdm:resource_legal_id_celex ?baseCelex .\n OPTIONAL { ?work cdm:work_date_document ?date . }\n OPTIONAL { ?work cdm:resource_legal_in-force ?inForce . }\n OPTIONAL { ?version cdm:act_consolidated_based_on_resource_legal ?work ; cdm:act_consolidated_date ?versionDate ; cdm:resource_legal_id_celex ?versionCelex . }\n} ORDER BY ?baseCelex DESC(?versionDate) LIMIT 10000`;
    try {
      const response=await fetch(endpoint,{method:'POST',headers:{Accept:'application/sparql-results+json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({query}),signal:AbortSignal.timeout(55000)});
      if(!response.ok)throw new Error(`CELLAR SPARQL HTTP ${response.status}`);
      const data=JSON.parse(await readBounded(response)) as {results?:{bindings?:Binding[]}};
      const rows=data.results?.bindings;if(!rows)throw new Error('Invalid CELLAR SPARQL response.');if(rows.length>=10000)throw new Error('Metadata result cap reached; selection completeness is unknown.');
      await save(resolve(out,`metadata-${offset/24+1}.json`),{sourceUrl:endpoint,retrievedAt:new Date().toISOString(),query,results:rows});
      for(const row of rows){const celex=row.baseCelex?.value;if(!celex)continue;const existing=result.get(celex)??{documentDate:null,inForce:null,versions:[],available:true};existing.documentDate=row.date?.value.slice(0,10)??existing.documentDate;const force=row.inForce?.value;if(force)existing.inForce=['true','1'].includes(force);if(row.versionCelex?.value&&row.versionDate?.value){const version={celex:normalizeCelex(row.versionCelex.value),date:row.versionDate.value.slice(0,10)};if(!existing.versions.some(v=>v.celex===version.celex))existing.versions.push(version);}result.set(celex,existing);}
      for(const act of slice)if(!result.has(act.celex))result.set(act.celex,{documentDate:null,inForce:null,versions:[],available:false});
    } catch(error) {for(const act of slice){result.set(act.celex,{documentDate:null,inForce:null,versions:[],available:false});failures.push({baseCelex:act.celex,requestedCelex:act.celex,stage:'metadata',message:errorText(error),retrievedAt:new Date().toISOString()});}}
  }
  return result;
}

async function run() {
  await Promise.all([mkdir(resolve(out,'documents'),{recursive:true}),mkdir(resolve(out,'sources'),{recursive:true}),mkdir(resolve(root,'public/eu-documents'),{recursive:true})]);
  const catalog=JSON.parse(await readFile(resolve(root,'public/data/catalog.json'),'utf8')) as {documents:{id:string;euRelations?:{celex:string;label:string;title:string}[]}[]};
  const linked=new Map<string,LinkedAct>();
  for(const doc of catalog.documents)for(const relation of doc.euRelations??[]){const celex=baseCelexOf(relation.celex);const act=linked.get(celex)??{celex,label:relation.label,title:relation.title,linkedFffs:[]};if(!act.linkedFffs.includes(doc.id))act.linkedFffs.push(doc.id);linked.set(celex,act);}
  const priority=['32022R2554','32013R0575','32013L0036','32014L0065','32014R0600','32015L0849','32012R0648','32009L0138','32019R2033','32019L2034','32013R0231','32011L0061','32009L0065','32015L2366','32016R0679'];
  const rank=(id:string)=>{const n=priority.indexOf(id);return n<0?1000:n;};
  const acts=[...linked.values()].sort((a,b)=>rank(a.celex)-rank(b.celex)||b.linkedFffs.length-a.linkedFffs.length||a.celex.localeCompare(b.celex)).slice(0,maxActs);
  const failures:EuImportFailure[]=[];const meta=await metadata(acts,failures);const documents:EuDocument[]=[];
  let cursor=0;
  const worker=async()=>{while(cursor<acts.length){const act=acts[cursor++];const m=meta.get(act.celex)!;const newest=m.versions.filter(v=>v.date<=asOf).sort((a,b)=>b.date.localeCompare(a.date)||b.celex.localeCompare(a.celex))[0];const requested=newest?.celex??act.celex;const candidates=newest?[requested,act.celex]:[act.celex];let imported=false;
    for(const celex of candidates){try{
      const fp=resolve(out,'documents',`${celex}.json`);
      if(!refresh){try{const cached=JSON.parse(await readFile(fp,'utf8')) as EuDocument;if(cached.id===celex&&cached.asOf===asOf&&cached.language==='SV'){documents.push(cached);imported=true;console.log(`${act.celex}: cached ${celex} (${cached.articleCount} articles)`);break;}}catch{/* cache absent */}}
      const source=await content(celex);const parsed=parseEuHtml(source.html,{celex,contentSourceUrl:source.url});
      const versionKind=celex[0]==='0'?'consolidated':'original';
      const versionSelection:EuDocumentSummary['versionSelection']=versionKind==='consolidated'?'latest_consolidated_as_of':newest?'original_after_consolidated_failure':m.available?'original_no_consolidation_found':'original_metadata_unavailable';
      const notes=[versionKind==='consolidated'?'Officiellt publicerad konsoliderad lästext. Konsolideringen har ingen egen rättsverkan; grundakt och ändringsakter är källorna.':'Grundaktens ursprungliga lydelse. Senare ändringar kan finnas; texten är inte en försäkran om aktuell lydelse.', 'Maskinbearbetad svensk HTML från EU:s publikationsbyrå. Kontrollera tabeller, formler, bilagor och fotnoter mot originalet. Ingen språkfallback har använts.', 'Status inForce är CELLAR:s uppgift vid hämtningen och är inte en självständig historisk tillämplighetsbedömning.',...parsed.warnings];
      if(versionSelection==='original_after_consolidated_failure')notes.push(`Den valda konsolideringen ${requested} kunde inte importeras; grundakten visas uttryckligen som reservkälla.`);
      if(!m.available)notes.push('Versionsmetadata kunde inte beläggas i denna import; inga påståenden om senaste konsolidering görs.');
      const summary:EuDocumentSummary={id:celex,celex,baseCelex:act.celex,title:parsed.title,label:act.label,language:'SV',requestedLanguage:'SV',versionKind,consolidationDate:versionKind==='consolidated'?newest!.date:null,documentDate:m.documentDate,inForce:m.inForce,inForceReportedAt:source.retrievedAt,asOf,retrievedAt:source.retrievedAt,sourceUrl:euOfficialUrl(celex),contentSourceUrl:source.url,sourceSha256:hash(source.html),documentUrl:`data/eu/documents/${celex}.json`,markdownUrl:`eu-documents/${celex}.md`,sourceHtmlUrl:`data/eu/sources/${celex}.html.txt`,articleCount:parsed.articles.length,sectionCount:parsed.sections.length,textCharacters:parsed.text.length,linkedFffs:act.linkedFffs,articleTitles:parsed.articles.map(a=>a.title),notes,versionSelection};
      const intro=`# ${summary.label} — ${summary.celex}\n\n${notes.map(n=>'> '+n).join('\n>\n')}\n\n[Officiell text](${summary.sourceUrl}) · Hämtad ${summary.retrievedAt} · Språk: SV · ${versionKind==='consolidated'?'Konsolideringsdatum: '+summary.consolidationDate:'Ursprunglig grundakt'}\n\n`;
      const document:EuDocument={...summary,markdown:intro+parsed.markdown+'\n',text:parsed.text,articles:parsed.articles,sections:parsed.sections};
      await Promise.all([save(fp,document),writeFile(resolve(out,'sources',`${celex}.html.txt`),source.html,'utf8'),writeFile(resolve(root,'public/eu-documents',`${celex}.md`),document.markdown,'utf8')]);
      documents.push(document);imported=true;console.log(`${act.celex}: ${celex} ${parsed.articles.length} articles, ${parsed.text.length} chars`);break;
    }catch(error){failures.push({baseCelex:act.celex,requestedCelex:celex,stage:/artikel|språk|rättsakt|Dubbel/.test(errorText(error))?'parse':'content',message:errorText(error),retrievedAt:new Date().toISOString()});console.warn(`${celex}: ${errorText(error)}`);}}
    if(!imported)console.warn(`${act.celex}: no full text imported`);
  }};
  await Promise.all([worker(),worker(),worker()]);
  documents.sort((a,b)=>rank(a.baseCelex)-rank(b.baseCelex)||a.baseCelex.localeCompare(b.baseCelex));
  const summaries=documents.map(({markdown,text,articles,sections,...summary})=>summary);
  const imported=new Set(documents.map(d=>d.baseCelex));
  const index:EuIndex={schemaVersion:1,asOf,retrievedAt:new Date().toISOString(),documents:summaries,failures,coverage:{linkedActCount:linked.size,importedActCount:imported.size,missingBaseCelex:[...linked.keys()].filter(id=>!imported.has(id)).sort(),note:'Avgränsad import av svenska rättsakter som FFFS-katalogen hänvisar till. Träffar är hänvisningar, inte automatiska tillämplighetsbeslut. Saknade texter och misslyckade konsolideringar redovisas separat.'}};
  const search:EuSearchCorpus={schemaVersion:1,asOf,documents:documents.map(d=>({id:d.id,baseCelex:d.baseCelex,title:d.title,label:d.label,linkedFffs:d.linkedFffs,text:d.text,articles:d.articles.map(({id,number,title,text,sourceUrl})=>({id,number,title,text,sourceUrl}))}))};
  await Promise.all([save(resolve(out,'index.json'),index),save(resolve(out,'search.json'),search),save(resolve(out,'import-report.json'),{...index,documents:summaries.map(d=>({id:d.id,baseCelex:d.baseCelex,versionKind:d.versionKind,articleCount:d.articleCount,sourceSha256:d.sourceSha256})),officialDocumentation:'https://op.europa.eu/en/web/cellar/cellar-data',ossPreflight:'https://github.com/cyanheads/eur-lex-mcp-server/tree/v0.18.2',parser:'htmlparser2; positive Swedish headings; quoted article headings inside tables excluded; duplicate articles rejected'})]);
  console.log(JSON.stringify({imported:documents.length,linked:linked.size,failedAttempts:failures.length,articles:documents.reduce((n,d)=>n+d.articleCount,0)}));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
