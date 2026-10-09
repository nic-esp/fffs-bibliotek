import { BASE, e, resultRow } from './views';
import { SITE_URL } from './config';
import { searchDocuments } from '../lib/search';
import { searchEuDocuments } from '../lib/eurlex';
import { euResultRow } from './eu-views';
import { addEvidenceRecord, createEvidenceCase, exportEvidenceJson, exportEvidenceMarkdown, importEvidenceCase, loadEvidenceCase, normalizeEvidenceCase, removeEvidenceRecord, saveEvidenceCase, clearEvidenceCase, updateEvidenceRecord, EVIDENCE_LIMITS, type EvidenceCase, type ReviewDecision } from './evidence';

const now=()=>new Date().toISOString();
const getJson=async(path:string)=>{const r=await fetch(BASE+path);if(!r.ok)throw Error(`Källfilen kunde inte läsas (${r.status}).`);return r.json()};
function toast(message:string){document.querySelector('.toast')?.remove();const node=document.createElement('div');node.className='toast';node.setAttribute('role','status');node.textContent=message;document.body.append(node);setTimeout(()=>node.remove(),4000)}
function currentCase(){const result=loadEvidenceCase(localStorage);if(!result.ok)throw Error(result.error);return result.value??createEvidenceCase({title:'Mitt underlag',now:now()})}
function save(value:EvidenceCase){const result=saveEvidenceCase(localStorage,value,{explicit:true});if(!result.ok)throw Error(result.error);return result.value}
function saveRecord(record:unknown){save(addEvidenceRecord(currentCase(),record,now()));toast('Sparat i Mitt underlag')}
function errorText(error:unknown){return error instanceof Error?error.message:'Åtgärden kunde inte slutföras.'}
function download(text:string,filename:string,type:string){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}

export function startEvidence(){
 let value:EvidenceCase;
 const error=document.getElementById('evidence-error')!;
 const showError=(cause:unknown)=>{error.className='error';error.textContent=errorText(cause)};
 try{value=currentCase()}catch(cause){showError(cause);const reset=document.createElement('button');reset.className='btn';reset.textContent='Rensa det oläsbara lokala underlaget';reset.addEventListener('click',()=>{const result=clearEvidenceCase(localStorage,{explicit:true});if(result.ok)location.reload();else showError(result.error)});error.append(document.createElement('br'),reset);value=createEvidenceCase({title:'Återställt underlag',now:now()})}
 const title=document.getElementById('case-title') as HTMLInputElement;
 title.value=value.title;
 const persist=()=>{value=save(normalizeEvidenceCase({...value,title:title.value.trim()||'Mitt underlag',updatedAt:now()}))};
 const safe=(fn:()=>void)=>()=>{try{error.textContent='';error.className='';fn()}catch(cause){showError(cause)}};
 const render=()=>{
  document.getElementById('evidence-count')!.textContent=`${value.records.length} sparade belägg · versioner och källor följer med i exporten`;
  document.getElementById('evidence-records')!.innerHTML=value.records.length?value.records.map(record=>`<section class="evidence-card" data-record="${e(record.id)}"><span class="eyebrow">${e(record.type==='fffs'?'FFFS':record.type==='eurlex'?'EU-rättsakt':'Extern källa')} · ${e(record.sourceId)}</span><h2><a href="${e(record.url)}">${e(record.title)}</a></h2><p class="version-info">${record.section?e(record.section)+' · ':''}${record.version?e(record.version)+' · ':''}Hämtad ${e(record.retrievedAt.slice(0,10))}</p>${record.excerpt?`<blockquote>${e(record.excerpt)}</blockquote>`:''}<label for="note-${e(record.id)}">Din anteckning</label><textarea id="note-${e(record.id)}" rows="2" maxlength="${EVIDENCE_LIMITS.note}">${e(record.note)}</textarea><div class="evidence-actions"><select aria-label="Manuell bedömning av ${e(record.title)}"><option value="unreviewed" ${record.decision==='unreviewed'?'selected':''}>Ej granskad</option><option value="relevant" ${record.decision==='relevant'?'selected':''}>Relevant</option><option value="not-relevant" ${record.decision==='not-relevant'?'selected':''}>Ej relevant</option></select><button class="btn save-note">Spara bedömning</button><button class="btn remove-evidence">Ta bort</button></div></section>`).join(''):`<div class="empty"><strong>Inga belägg ännu</strong>Välj ”Spara i underlag” på en lässida, eller lägg till en extern källa nedan.<p><a href="${BASE}">Hitta en FFFS</a> · <a href="${BASE}eu/">Läs EU-regler</a></p></div>`;
  document.querySelectorAll<HTMLElement>('[data-record]').forEach(card=>{
   card.querySelector('.save-note')?.addEventListener('click',safe(()=>{value=updateEvidenceRecord(value,card.dataset.record!,{note:card.querySelector('textarea')!.value,decision:card.querySelector('select')!.value as ReviewDecision},now());persist();toast('Bedömningen sparad')}));
   card.querySelector('.remove-evidence')?.addEventListener('click',safe(()=>{value=removeEvidenceRecord(value,card.dataset.record!,now());persist();render()}));
  });
 };
 document.getElementById('save-case-title')!.addEventListener('click',safe(()=>{persist();toast('Namnet sparat')}));
 document.getElementById('export-md')!.addEventListener('click',safe(()=>{download(exportEvidenceMarkdown(normalizeEvidenceCase({...value,title:title.value.trim()||'Mitt underlag'})),'regelunderlag.md','text/markdown;charset=utf-8')}));
 document.getElementById('export-json')!.addEventListener('click',safe(()=>{download(exportEvidenceJson(normalizeEvidenceCase({...value,title:title.value.trim()||'Mitt underlag'})),'regelunderlag.json','application/json')}));
 document.getElementById('import-case')!.addEventListener('change',async event=>{const input=event.target as HTMLInputElement;try{const file=input.files?.[0];if(!file)return;if(file.size>EVIDENCE_LIMITS.importChars*2)throw Error('Filen är för stor.');const imported=importEvidenceCase(await file.text());if(imported.records.some(r=>r.type==='screening-candidate'))throw Error('Import av personuppgifter från screening stöds inte i denna öppna utgåva.');let merged=value.records.length?value:imported;if(value.records.length)for(const record of imported.records)merged=addEvidenceRecord(merged,record,now());value=save(merged);title.value=value.title;render();toast('Underlaget importerat; befintliga poster har bevarats')}catch(cause){showError(cause)}finally{input.value=''}});
 document.getElementById('manual-evidence')!.addEventListener('submit',event=>{event.preventDefault();safe(()=>{const form=event.target as HTMLFormElement;const data=new FormData(form);const url=String(data.get('url'));value=addEvidenceRecord(value,{type:'source',sourceId:new URL(url).hostname,title:String(data.get('title')),url,excerpt:String(data.get('excerpt')),note:String(data.get('note')),retrievedAt:now()},now());persist();render();form.reset();toast('Källan sparad lokalt')})()});
 render();
}

export function bindEvidenceButtons(){
 document.querySelectorAll<HTMLButtonElement>('[data-save-fffs]').forEach(button=>button.addEventListener('click',async()=>{
  button.disabled=true;
  try{
   const content=await getJson(`data/documents/${button.dataset.saveFffs}.json`);const metadata=content.metadata;
   const selection=window.getSelection();const prose=document.querySelector('.prose');
   const selected=selection?.anchorNode&&selection.focusNode&&prose?.contains(selection.anchorNode)&&prose?.contains(selection.focusNode)?selection.toString().trim():'';
   if(selected.length>EVIDENCE_LIMITS.excerpt)throw Error(`Välj ett utdrag på högst ${EVIDENCE_LIMITS.excerpt} tecken.`);
   let section=content.sections.find((s:any)=>s.id===location.hash.slice(1));
   if(selected&&selection?.anchorNode){const node=selection.anchorNode;const anchors=Array.from(prose!.querySelectorAll('a[id]'));const preceding=anchors.filter(anchor=>!!(anchor.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);section=content.sections.find((s:any)=>s.id===preceding?.id)??section}
   if(!section)section=content.sections.find((s:any)=>s.id===metadata.applicability?.sectionId);
   const excerpt=selected||section?.text||metadata.applicability?.text||'';
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content.markdown));const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
   saveRecord({type:'fffs',sourceId:metadata.number,title:`${metadata.number}: ${metadata.title}`.slice(0,EVIDENCE_LIMITS.title),url:metadata.sourceUrl,version:`${metadata.kind} · underlag ${metadata.asOf}`,section:section?.title??(selected?'Markerat utdrag':undefined),excerpt:excerpt.slice(0,EVIDENCE_LIMITS.excerpt),hash,retrievedAt:now(),note:`Lässida: ${SITE_URL}fffs/${metadata.id}/${section?'#'+section.id:''}\nSHA-256 avser bibliotekets Markdown-text.${excerpt.length>EVIDENCE_LIMITS.excerpt?'\nUtdraget är begränsat till 8 000 tecken. Hela avsnittet finns på lässidan.':''}`});
  }catch(cause){toast(errorText(cause))}finally{button.disabled=false}
 }));
 document.addEventListener('click',async event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-save-eu]');if(!button)return;button.disabled=true;try{const content=await getJson(`data/eu/documents/${button.dataset.saveEu}.json`);const article=button.dataset.article?content.articles.find((a:any)=>a.id===button.dataset.article):null;const excerpt=article?.text??'';saveRecord({type:'eurlex',sourceId:content.id,title:content.title.slice(0,EVIDENCE_LIMITS.title),url:article?.sourceUrl||content.sourceUrl,section:article?`${article.title}`.slice(0,EVIDENCE_LIMITS.section):undefined,excerpt:excerpt.slice(0,EVIDENCE_LIMITS.excerpt),version:`${content.id} · ${content.versionKind}`,retrievedAt:content.retrievedAt,hash:content.sourceSha256,note:`Lässida: ${SITE_URL}eu/${content.id}/${article?'#'+article.id:''}\nSHA-256 avser den importerade officiella HTML-källan.${excerpt.length>EVIDENCE_LIMITS.excerpt?'\nUtdraget är begränsat till 8 000 tecken. Hela artikeln finns på lässidan.':''}`})}catch(cause){toast(errorText(cause))}finally{button.disabled=false}});
}

export function startActors(){document.getElementById('provider-search')?.addEventListener('submit',event=>{event.preventDefault();const name=(document.getElementById('actor-name') as HTMLInputElement).value.trim();if(!name)return;const url=new URL('https://www.opensanctions.org/search/');url.searchParams.set('q',name);window.open(url.href,'_blank','noopener,noreferrer')})}

export async function startToolbox(){
 const form=document.getElementById('global-search')!;const input=document.getElementById('global-query') as HTMLInputElement;const output=document.getElementById('global-results')!;
 let revision=0;
 form.addEventListener('submit',async event=>{event.preventDefault();const query=input.value.trim();if(!query)return;const rev=++revision;output.innerHTML='<p class="subtle">Söker i FFFS och EU-biblioteket…</p>';try{const [catalog,corpus,eu,euCorpus]=await Promise.all([getJson('data/catalog.json'),getJson('data/search.json'),getJson('data/eu/index.json'),getJson('data/eu/search.json')]);if(rev!==revision)return;const fffs=searchDocuments(catalog,corpus,{query,limit:5,status:'current'});const euFound=searchEuDocuments(euCorpus,query,{limit:5});output.innerHTML=`<section class="search-group"><h2>FFFS · ${fffs.total} träffar</h2>${fffs.results.length?`<div class="table-wrap">${fffs.results.map(h=>resultRow(h,true)).join('')}</div>`:'<p class="subtle">Inga träffar i gällande FFFS-urval.</p>'}<p><a href="${BASE}?q=${encodeURIComponent(query)}">Öppna hela FFFS-sökningen →</a></p></section><section class="search-group"><h2>EU-regler</h2><div class="table-wrap">${euFound.map((hit:any)=>euResultRow(eu.documents.find((d:any)=>d.id===hit.id),hit)).join('')||'<p class="empty">Inga träffar i det importerade urvalet.</p>'}</div><p><a href="${BASE}eu/?q=${encodeURIComponent(query)}">Öppna EU-sökningen →</a></p></section>`}catch(cause){output.innerHTML=`<div class="error">${e(errorText(cause))} Försök igen eller öppna respektive bibliotek.</div>`}});
}
