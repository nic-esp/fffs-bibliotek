/** Browser-safe EU reading model and parser over the documented CELLAR API.
 * Preflight: cyanheads/eur-lex-mcp-server v0.18.2 (Apache-2.0), notably its
 * distinction between real article headings and amending quotations in tables.
 * Uses the project's maintained htmlparser2 dependency; no server runtime,
 * credentials or Node built-ins are included in this shared module.
 */
import { parseDocument } from 'htmlparser2';
import type { AnyNode, Element } from 'domhandler';
import { matchesSearchTerm } from './search.js';

export type EuVersionKind = 'original' | 'consolidated';
export interface EuSection { id: string; kind: 'preamble' | 'article' | 'annex' | 'chapter' | 'section'; number?: string; title: string; text: string; markdown: string; sourceUrl: string }
export interface EuArticle extends EuSection { kind: 'article'; number: string }
export interface EuDocumentSummary {
  id: string; celex: string; baseCelex: string; title: string; label: string;
  language: 'SV'; requestedLanguage: 'SV'; versionKind: EuVersionKind;
  consolidationDate: string | null; documentDate: string | null;
  inForce: boolean | null; inForceReportedAt: string; asOf: string; retrievedAt: string;
  sourceUrl: string; contentSourceUrl: string; sourceSha256: string;
  documentUrl: string; markdownUrl: string; sourceHtmlUrl: string;
  articleCount: number; sectionCount: number; textCharacters: number;
  linkedFffs: string[]; articleTitles: string[]; notes: string[];
  versionSelection: 'latest_consolidated_as_of' | 'original_no_consolidation_found' | 'original_after_consolidated_failure' | 'original_metadata_unavailable';
}
export interface EuDocument extends EuDocumentSummary { markdown: string; text: string; articles: EuArticle[]; sections: EuSection[] }
export interface EuImportFailure { baseCelex: string; requestedCelex: string; stage: 'metadata' | 'content' | 'parse'; message: string; retrievedAt: string }
export interface EuIndex {
  schemaVersion: 1; asOf: string; retrievedAt: string; documents: EuDocumentSummary[];
  failures: EuImportFailure[];
  coverage: { linkedActCount: number; importedActCount: number; missingBaseCelex: string[]; note: string };
}
export interface EuSearchDocument { id: string; baseCelex: string; title: string; label: string; linkedFffs: string[]; text: string; articles: Pick<EuArticle, 'id' | 'number' | 'title' | 'text' | 'sourceUrl'>[] }
export interface EuSearchCorpus { schemaVersion: 1; asOf: string; documents: EuSearchDocument[] }
export interface EuSearchHit { id: string; baseCelex: string; title: string; label: string; linkedFffs: string[]; score: number; snippet: string; articleId?: string; articleNumber?: string; sourceUrl?: string }

export function normalizeCelex(value: string): string {
  const id = value.trim().replace(/^CELEX\s*:\s*/i, '').toUpperCase();
  if (!/^[03]\d{4}[RLD]\d{4}(?:\(\d{2}\))?(?:-\d{8})?$/.test(id)) throw new Error('Ogiltigt CELEX-id för en EU-rättsakt.');
  if (id[0] === '0' && !/-\d{8}$/.test(id)) throw new Error('En konsoliderad text måste ha ett daterat CELEX-id.');
  if (id[0] === '3' && /-\d{8}$/.test(id)) throw new Error('Grundaktens CELEX-id får inte innehålla konsolideringsdatum.');
  const date = /-(\d{4})(\d{2})(\d{2})$/.exec(id);
  if(date){const iso=`${date[1]}-${date[2]}-${date[3]}`;const parsed=new Date(iso);if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==iso)throw new Error('Ogiltigt konsolideringsdatum.');}
  return id;
}
export function baseCelexOf(value: string): string { const id = normalizeCelex(value); return id[0] === '0' ? `3${id.slice(1).replace(/-\d{8}$/, '')}` : id; }
export function euOfficialUrl(value: string): string { return `https://eur-lex.europa.eu/legal-content/SV/TXT/?uri=CELEX:${normalizeCelex(value)}`; }
export function getEuArticle(document: Pick<EuDocument, 'articles'>, numberOrId: string): EuArticle | undefined {
  const number = numberOrId.trim().replace(/^(?:article-|artikel\s+|article\s+)/i, '').replace(/\s+/g, '').toLowerCase();
  return document.articles.find(article => article.id === numberOrId || article.number.toLowerCase() === number);
}

function element(node: AnyNode): node is Element { return node.type === 'tag' || node.type === 'script' || node.type === 'style'; }
function children(node: AnyNode): AnyNode[] { return 'children' in node ? node.children : []; }
function textOf(node: AnyNode): string {
  if (node.type === 'text') return node.data;
  if (element(node) && ['script', 'style', 'head', 'noscript'].includes(node.name)) return '';
  if (element(node) && node.name === 'br') return '\n';
  const content = children(node).map(textOf).join('');
  return element(node) && ['p', 'div', 'tr', 'td', 'th', 'li', 'table'].includes(node.name) ? '\n' + content + '\n' : content;
}
function clean(text: string): string { return text.replace(/\u00a0/g, ' ').replace(/[\t \r]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }
function walk(node: AnyNode, fn: (node: Element) => void): void { if (element(node)) fn(node); for (const child of children(node)) walk(child, fn); }
function safeUrl(raw: string, sourceUrl: string): string | null { try { const url = new URL(raw, sourceUrl); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; } }
function inline(node: AnyNode, sourceUrl: string): string {
  if (node.type === 'text') return node.data.replace(/[<>]/g, c => c === '<' ? '&lt;' : '&gt;');
  if (!element(node)) return children(node).map(n => inline(n, sourceUrl)).join('');
  if (['script', 'style', 'head', 'noscript'].includes(node.name)) return '';
  if (node.name === 'br') return '\n';
  if (node.name === 'img') { const url = safeUrl(node.attribs.src ?? '', sourceUrl); return url ? `![${node.attribs.alt || 'Illustration eller formel i originalet'}](${url})` : ''; }
  const content = children(node).map(n => inline(n, sourceUrl)).join('');
  if (node.name === 'a' && node.attribs.href) { const url = safeUrl(node.attribs.href, sourceUrl); return url && content.trim() ? `[${content}](${url})` : content; }
  if (['p', 'div', 'li'].includes(node.name)) return `\n${content}\n`;
  return content;
}
function tableMarkdown(table: Element, sourceUrl: string): string {
  const rows: Element[] = [];
  const visit = (node: AnyNode) => { if (element(node) && node !== table && node.name === 'table') return; if (element(node) && node.name === 'tr') rows.push(node); else children(node).forEach(visit); };
  visit(table);
  const cells = rows.map(row => children(row).filter((n): n is Element => element(n) && ['td', 'th'].includes(n.name)));
  const isLayout = !/\boj-table\b/.test(table.attribs.class ?? '') && cells.length > 0 && cells.every(row => row.length <= 2 && (row.length === 1 || clean(textOf(row[0])).length <= 12));
  if (isLayout) return cells.map(row => row.map(cell => clean(inline(cell, sourceUrl))).join(' ')).join('\n\n');
  const values = cells.map(row => row.map(cell => clean(inline(cell, sourceUrl)).replace(/\n/g, '<br>').replace(/\|/g, '\\|')));
  if (!values.length) return clean(inline(table, sourceUrl));
  const width = Math.max(...values.map(row => row.length));
  const renderRow = (row: string[]) => '| ' + [...row, ...Array(width - row.length).fill('')].join(' | ') + ' |';
  return [renderRow(values[0]), '| ' + Array(width).fill('---').join(' | ') + ' |', ...values.slice(1).map(renderRow)].join('\n');
}
interface Block { text: string; markdown: string; kind?: EuSection['kind']; number?: string; anchor?: string; subtitle?: boolean }

/** Parse only Swedish text actually returned by CELLAR. No language or version fallback. */
export function parseEuHtml(html: string, options: { celex: string; sourceUrl?: string; contentSourceUrl?: string }): { title: string; text: string; markdown: string; articles: EuArticle[]; sections: EuSection[]; warnings: string[] } {
  const celex = normalizeCelex(options.celex); const sourceUrl = options.sourceUrl ?? euOfficialUrl(celex); const contentUrl = options.contentSourceUrl ?? sourceUrl;
  if (html.length < 500 || /(?:verify that you(?:'re| are) not a robot|aws-waf-token|captcha-container|request unsuccessful.*incapsula)/i.test(html)) throw new Error('Källan gav ingen läsbar rättsakt eller visade en åtkomstutmaning.');
  const dom = parseDocument(html, { decodeEntities: true });
  let body: AnyNode = dom; let title = ''; let explicitLanguage = ''; let hasSemanticArticles = false;
  walk(dom, node => {
    if (node.name === 'body') body = node;
    if (node.name === 'html') explicitLanguage = (node.attribs.lang || node.attribs['xml:lang'] || '').toLowerCase();
    if (!title && /(?:^|\s)(?:eli-main-title|doc-ti|oj-doc-ti)(?:\s|$)/.test(node.attribs.class ?? '')) title = clean(textOf(node));
    if (/(?:^|\s)(?:oj-ti-art|ti-art|title-article-norm)(?:\s|$)/.test(node.attribs.class ?? '')) hasSemanticArticles = true;
  });
  if (explicitLanguage && !['sv', 'swe'].includes(explicitLanguage)) throw new Error(`Källans språk är ${explicitLanguage}, inte begärda SV.`);
  const blocks: Block[] = [];
  const visit = (node: AnyNode) => {
    if (!element(node)) {
      if (node.type === 'text' && node.data.trim()) blocks.push({text:clean(node.data),markdown:clean(inline(node,contentUrl))});
      else children(node).forEach(visit);
      return;
    }
    if (['script', 'style', 'head', 'noscript', 'link', 'hr'].includes(node.name) || node.attribs.id === 'banner') return;
    if (node.name === 'table') {
      if (/(?:oj-hd-ti|oj-hd-oj|oj-hd-date|oj-hd-lg)/.test(children(node).map(n => JSON.stringify(n, (k,v) => ['parent','prev','next'].includes(k) ? undefined : v)).join(''))) return;
      blocks.push({ text: clean(textOf(node)), markdown: tableMarkdown(node, contentUrl) }); return;
    }
    if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'].includes(node.name)) {
      const text = clean(textOf(node)); if (!text) return;
      const articleClass = /(?:^|\s)(?:oj-ti-art|ti-art|title-article-norm)(?:\s|$)/.test(node.attribs.class ?? '');
      // Consolidated grid lists also contain standalone "Artikel 449b." cross-
      // references. Where semantic headings exist, plain norm paragraphs never
      // create new articles. Old conversions may instead use bold headings.
      const legacyHeading = !hasSemanticArticles && children(node).some(n=>element(n)&&['b','strong'].includes(n.name));
      const article = (articleClass || legacyHeading) ? /^Artikel\s+(\d+\s*[a-z]?)\.?$/i.exec(text) : null;
      const annex = /^BILAGA(?:\s+([IVXLCDM]+|\d+[A-Z]?))?\s*$/i.exec(text);
      const chapter = /^KAPITEL\s+([IVXLCDM]+|\d+)\b(?:\s+[^a-zåäö]+)?$/.exec(text);
      const section = /^AVSNITT\s+([IVXLCDM]+|\d+)\b(?:\s+[^a-zåäö]+)?$/.exec(text);
      let parent = node.parent; let anchor = node.attribs.id;
      while (!anchor && parent && element(parent)) { if (parent.attribs.id && /^(?:art|anx|cpt|sct)/i.test(parent.attribs.id)) anchor = parent.attribs.id; parent = parent.parent; }
      blocks.push({ text, markdown: clean(inline(node, contentUrl)), kind: article ? 'article' : annex ? 'annex' : chapter ? 'chapter' : section ? 'section' : undefined, number: (article?.[1] || annex?.[1] || chapter?.[1] || section?.[1])?.replace(/\s/g, ''), anchor, subtitle: /(?:sti-art|title-article)/.test(node.attribs.class ?? '') && !article }); return;
    }
    if (node.name === 'img') { const md = inline(node, contentUrl); if (md) blocks.push({ text: node.attribs.alt || '[Illustration/formel: se originalet]', markdown: md }); return; }
    children(node).forEach(visit);
  };
  visit(body);
  if (!blocks.some(block => block.kind === 'article')) throw new Error('Ingen svensk artikelstruktur hittades; källan publiceras inte som verifierat läsbar rättsakt.');
  const sections: EuSection[] = []; const used = new Set<string>(); const warnings: string[] = [];
  let active: EuSection = { id: 'preamble', kind: 'preamble', title: 'Ingress och skäl', text: '', markdown: '', sourceUrl };
  const flush = () => { active.text = active.text.trim(); active.markdown = active.markdown.trim(); if (active.text) sections.push(active); };
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.kind) {
      // Quoted inserted provisions in numbering tables never enter this branch.
      const id = `${block.kind}-${(block.number || 'unnumbered').toLowerCase()}`;
      if (block.kind === 'article' && used.has(id)) throw new Error(`Dubbel artikelrubrik ${block.number}; kräver strukturell granskning.`);
      flush(); let uniqueId = id; let suffix = 2; while (used.has(uniqueId)) uniqueId = `${id}-${suffix++}`; used.add(uniqueId);
      const subtitle = block.kind === 'article' && blocks[i+1]?.subtitle ? blocks[i+1].text : '';
      active = { id: uniqueId, kind: block.kind, ...(block.number ? {number:block.number} : {}), title: block.text + (subtitle ? ` — ${subtitle}` : ''), text:'',markdown:'', sourceUrl: sourceUrl + (block.anchor ? `#${encodeURIComponent(block.anchor)}` : '') };
    }
    active.text += block.text + '\n\n'; active.markdown += block.markdown + '\n\n';
  }
  flush();
  const articles = sections.filter((s): s is EuArticle => s.kind === 'article' && !!s.number);
  const text = sections.map(s => s.text).join('\n\n');
  if (!/\b(?:förordning|direktiv|beslut)\b/i.test(text.slice(0, 15000))) throw new Error('Svensk rättsaktstext kunde inte beläggas.');
  if (!title) { title = blocks.find(block => /(?:FÖRORDNING|DIREKTIV|BESLUT)/.test(block.text))?.text ?? celex; warnings.push('Titeln har lästs från dokumentets första rättsaktsrubrik.'); }
  const markdown = sections.map(s => `<a id="${s.id}"></a>\n\n## ${s.title}\n\n${s.markdown}`).join('\n\n');
  return { title, text, markdown, articles, sections, warnings };
}

function normalized(value: string): string { return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase(); }
export function searchEuDocuments(input: EuIndex | EuSearchCorpus | readonly EuDocumentSummary[], query: string, options: { limit?: number; fffsId?: string; baseCelex?: string } = {}): EuSearchHit[] {
  const documents = Array.isArray(input) ? input : (input as EuIndex | EuSearchCorpus).documents;
  const terms = normalized(query).trim().split(/\s+/).filter(Boolean); const results: EuSearchHit[] = [];
  for (const document of documents) {
    if (options.fffsId && !document.linkedFffs.includes(options.fffsId)) continue;
    if (options.baseCelex && document.baseCelex !== baseCelexOf(options.baseCelex)) continue;
    const candidate = document as EuDocumentSummary & Partial<EuSearchDocument>;
    const metadata = `${document.id} ${document.baseCelex} ${document.title} ${document.label} ${candidate.articleTitles?.join(' ') ?? ''}`;
    const full = normalized(metadata + ' ' + (candidate.text ?? ''));
    if (!terms.every(term => matchesSearchTerm(full,term))) continue;
    const article = candidate.articles?.find(a => terms.every(term => matchesSearchTerm(normalized(a.title + ' ' + a.text),term)));
    const snippetText = article?.text ?? candidate.text ?? document.title;
    const first = terms.length ? normalized(snippetText).indexOf(terms[0]) : 0; const start = Math.max(0, first - 70);
    const score = terms.reduce((sum,term) => sum + (matchesSearchTerm(normalized(metadata),term) ? 10 : 1),0);
    results.push({ id:document.id,baseCelex:document.baseCelex,title:document.title,label:document.label,linkedFffs:document.linkedFffs,score,snippet:snippetText.slice(start,start+320),...(article ? {articleId:article.id,articleNumber:article.number,sourceUrl:article.sourceUrl} : {}) });
  }
  return results.sort((a,b) => b.score-a.score || a.id.localeCompare(b.id)).slice(0,Math.min(200,Math.max(1,options.limit ?? 20)));
}

export interface EuLoader { index(): Promise<EuIndex>; document(id: string): Promise<EuDocument>; corpus(): Promise<EuSearchCorpus> }
export function createEuLoader(base: string, fetcher: typeof fetch = fetch, options: { ttlMs?: number; allowLocalhost?: boolean } = {}): EuLoader {
  const root = new URL(base.endsWith('/') ? base : base + '/');
  const local = options.allowLocalhost && ['localhost','127.0.0.1','[::1]'].includes(root.hostname) && ['http:','https:'].includes(root.protocol);
  const production = root.protocol === 'https:' && /^[a-z0-9-]+\.github\.io$/i.test(root.hostname) && !root.port;
  if ((!production && !local) || root.username || root.password || root.search || root.hash) throw new Error('EU-biblioteket kräver en fast HTTPS-adress på GitHub Pages; localhost måste aktiveras uttryckligen.');
  const ttlMs = options.ttlMs ?? 300_000;
  const cache = new Map<string, {expires:number; value:Promise<unknown>}>();
  const load = <T>(path: string, maxBytes: number, validate: (value: unknown) => T): Promise<T> => {
    if (cache.has(path) && cache.get(path)!.expires<=Date.now()) cache.delete(path);
    if (!cache.has(path)) {
      const pending = (async () => {
        const response = await fetcher(new URL(path,root), {redirect:'error',signal:AbortSignal.timeout(20000),headers:{accept:'application/json'}});
        if (!response.ok) throw new Error(`EU-källfilen kunde inte hämtas (HTTP ${response.status}).`);
        if (Number(response.headers.get('content-length') ?? 0)>maxBytes) { await response.body?.cancel(); throw new Error('EU-källfilen överskrider storleksgränsen.'); }
        if (!response.body) throw new Error('EU-källfilen är tom.');
        const reader=response.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;
        try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes){await reader.cancel();throw new Error('EU-källfilen överskrider storleksgränsen.');}chunks.push(value);}}finally{reader.releaseLock();}
        const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
        const value:unknown=JSON.parse(new TextDecoder().decode(buffer));return validate(value);
      })();
      cache.set(path,{value:pending,expires:Date.now()+ttlMs}); pending.catch(() => cache.delete(path));
      while (cache.size>12) cache.delete(cache.keys().next().value!);
    }
    return cache.get(path)!.value as Promise<T>;
  };
  return {
    index: () => load('data/eu/index.json', 4_000_000, value => { const x=value as EuIndex; if(x?.schemaVersion!==1 || !Array.isArray(x.documents) || !x.coverage) throw new Error('Ogiltigt EU-index.'); return x; }),
    document: value => { const id=normalizeCelex(value); return load(`data/eu/documents/${id}.json`, 16_000_000, value => { const x=value as EuDocument; if(x?.id!==id || x.language!=='SV' || !Array.isArray(x.articles) || typeof x.markdown!=='string') throw new Error('EU-dokumentets identitet eller format stämmer inte.'); return x; }); },
    corpus: () => load('data/eu/search.json', 64_000_000, value => { const x=value as EuSearchCorpus; if(x?.schemaVersion!==1 || !Array.isArray(x.documents)) throw new Error('Ogiltigt EU-sökindex.'); return x; }),
  };
}
