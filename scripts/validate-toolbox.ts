import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { marked } from 'marked';
import { parseHtml } from './validate-build.js';
import { SITE_URL } from '../src/config.js';
import type { EuIndex, EuDocument, EuSearchCorpus } from '../lib/eurlex.js';

const day = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const time = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
  && day(value.slice(0, 10)) && !Number.isNaN(Date.parse(value));
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const sameSet = (a: string[], b: string[]): boolean => a.length === new Set(a).size && b.length === new Set(b).size && same([...a].sort(), [...b].sort());
const celex = (id: unknown) => typeof id === 'string' ? /^([03])(\d{4}[RLD]\d{4}(?:\(\d{2}\))?)(?:-(\d{8}))?$/.exec(id) : null;
const baseCelex = (id: string) => { const match = celex(id); return match ? `3${match[2]}` : undefined; };
const officialUrl = (id: string) => `https://eur-lex.europa.eu/legal-content/SV/TXT/?uri=CELEX:${id}`;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
type Parsed = ReturnType<typeof parseHtml>;
type MetadataRow = Record<string, { value?: string }>;

/** Checks the emitted artifact, independently of the import and view functions. No network calls. */
export async function validateToolbox(options: { distDir?: string; siteUrl?: string; expectedCount?: number; maxErrors?: number } = {}) {
  const root = path.resolve(options.distDir ?? 'dist');
  const base = new URL(options.siteUrl ?? SITE_URL);
  const errors: string[] = [], warnings: string[] = [];
  const uniqueErrors = new Set<string>(), checked = new Set<string>();
  const pages = new Map<string, Parsed>();
  let documentCount = 0, articleCount = 0, sectionCount = 0, htmlCount = 0, sourceHashesChecked = 0;
  const fail = (message: string) => { if (uniqueErrors.has(message)) return; uniqueErrors.add(message); if (errors.length < (options.maxErrors ?? 60)) errors.push(message); };
  const result = () => ({ ok: uniqueErrors.size === 0, errors, errorCount: uniqueErrors.size, omittedErrors: uniqueErrors.size - errors.length,
    warnings, documentCount, articleCount, sectionCount, htmlCount, sourceHashesChecked, checkedLocalLinks: checked.size });
  const exists = async (filename: string) => { try { return (await fs.stat(filename)).isFile(); } catch { return false; } };
  const json = async <T>(relative: string): Promise<T | undefined> => {
    try { return JSON.parse(await fs.readFile(path.join(root, relative), 'utf8')) as T; }
    catch { fail(`Cannot read JSON ${relative}`); return undefined; }
  };
  function localFile(url: URL): string | undefined {
    if (url.origin !== base.origin) return undefined;
    if (!url.pathname.startsWith(base.pathname)) { fail(`Local URL escapes site base: ${url.href}`); return; }
    let relative: string;
    try { relative = decodeURIComponent(url.pathname.slice(base.pathname.length)); } catch { fail(`Invalid URL encoding: ${url.href}`); return; }
    const filename = path.resolve(root, relative || '.');
    if (filename !== root && !filename.startsWith(root + path.sep)) { fail(`Local URL escapes dist: ${url.href}`); return; }
    return url.pathname.endsWith('/') ? path.join(filename, 'index.html') : filename;
  }
  async function link(value: string, pageUrl: URL, source: string, kind: string) {
    if (/^(?:mailto:|tel:|data:)/i.test(value)) return;
    let url: URL;
    try { url = new URL(value, pageUrl); } catch { fail(`${source}: invalid ${kind} URL`); return; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) { fail(`${source}: unsafe ${kind} URL ${value.slice(0, 160)}`); return; }
    if (url.origin !== base.origin) return;
    const key = `${kind}:${url.href}`;
    if (checked.has(key)) return;
    checked.add(key);
    const filename = localFile(url);
    if (!filename) return;
    if (!await exists(filename)) { fail(`${source}: missing ${kind} ${url.pathname}`); return; }
    if (url.hash && filename.endsWith('.html')) {
      let anchor: string;
      try { anchor = decodeURIComponent(url.hash.slice(1)); } catch { fail(`${source}: invalid anchor encoding`); return; }
      const html = pages.get(filename) ?? parseHtml(await fs.readFile(filename, 'utf8'));
      pages.set(filename, html);
      if (anchor && !html.ids.has(anchor)) fail(`${source}: missing linked anchor ${url.pathname}${url.hash}`);
    }
  }
  async function html(route: string, marker: string): Promise<Parsed | undefined> {
    const relative = `${route}index.html`, filename = path.join(root, relative), pageUrl = new URL(route, base);
    let parsed: Parsed;
    try { parsed = parseHtml(await fs.readFile(filename, 'utf8')); } catch { fail(`Missing static HTML: ${relative}`); return; }
    pages.set(filename, parsed); htmlCount++;
    if (!parsed.title.trim()) fail(`${relative}: missing title`);
    if (!parsed.tags.some(t => t.name === 'meta' && t.attrs.name === 'description' && t.attrs.content?.trim())) fail(`${relative}: missing description`);
    if (!parsed.tags.some(t => t.name === 'script' && t.attrs.src)) fail(`${relative}: missing JavaScript bundle`);
    if (!parsed.tags.some(t => t.name === 'link' && t.attrs.rel === 'stylesheet' && t.attrs.href)) fail(`${relative}: missing stylesheet`);
    const canonical = parsed.tags.filter(t => t.name === 'link' && t.attrs.rel === 'canonical');
    if (canonical.length !== 1 || canonical[0].attrs.href !== pageUrl.href) fail(`${relative}: canonical must equal ${pageUrl.href}`);
    if (!parsed.tags.some(t => t.attrs['data-route'] === marker)) fail(`${relative}: missing route marker ${marker}`);
    const ids = parsed.tags.flatMap(t => t.attrs.id ? [t.attrs.id] : []);
    if (new Set(ids).size !== ids.length) fail(`${relative}: duplicate HTML ids`);
    for (const tag of parsed.tags) {
      if (tag.attrs.href) await link(tag.attrs.href, pageUrl, relative, 'link');
      if (tag.attrs.src) await link(tag.attrs.src, pageUrl, relative, tag.name === 'script' ? 'script' : 'media');
      if (tag.attrs.srcset) for (const item of tag.attrs.srcset.split(',')) await link(item.trim().split(/\s+/)[0], pageUrl, relative, 'srcset');
    }
    return parsed;
  }

  const index = await json<EuIndex>('data/eu/index.json');
  const corpus = await json<EuSearchCorpus>('data/eu/search.json');
  const catalog = await json<{ asOf: string; documents: { id: string; euRelations?: { celex: string }[] }[] }>('data/catalog.json');
  if (!index || !corpus || !catalog) return result();
  if (index.schemaVersion !== 1 || !Array.isArray(index.documents) || !object(index.coverage) || !Array.isArray(index.failures)
    || corpus.schemaVersion !== 1 || !Array.isArray(corpus.documents) || !Array.isArray(catalog.documents)) { fail('Invalid EU index/corpus/catalog shape'); return result(); }
  if (!day(index.asOf) || index.asOf !== corpus.asOf || index.asOf !== catalog.asOf) fail('Invalid or inconsistent EU/catalog/corpus snapshot date');
  if (!time(index.retrievedAt)) fail('Invalid EU index retrieval timestamp');
  documentCount = index.documents.length;
  if (!documentCount || (options.expectedCount !== undefined && documentCount !== options.expectedCount)) fail(`Expected ${options.expectedCount ?? 'at least one'} EU documents, found ${documentCount}`);
  const ids = index.documents.map(d => d.id), bases = index.documents.map(d => d.baseCelex);
  if (new Set(ids).size !== ids.length || new Set(bases).size !== bases.length) fail('Duplicate EU document id or base act');
  if (!sameSet(ids, corpus.documents.map(d => d.id))) fail('EU index and corpus document sets differ');
  const linked = new Map<string, Set<string>>();
  for (const fffs of catalog.documents) for (const relation of fffs.euRelations ?? []) {
    const id = baseCelex(relation.celex);
    if (!id) { fail(`${fffs.id}: invalid linked CELEX ${relation.celex}`); continue; }
    const targets = linked.get(id) ?? new Set<string>(); targets.add(fffs.id); linked.set(id, targets);
  }
  const missing = [...linked.keys()].filter(id => !bases.includes(id));
  if (index.coverage.linkedActCount !== linked.size || index.coverage.importedActCount !== documentCount
    || !Array.isArray(index.coverage.missingBaseCelex) || !sameSet(index.coverage.missingBaseCelex, missing)
    || bases.some(id => !linked.has(id))) fail('EU coverage counts/sets disagree with FFFS relations');

  const metadataRows: MetadataRow[] = [];
  const filenames = await fs.readdir(path.join(root, 'data/eu'));
  for (const name of filenames.filter(n => /^metadata-\d+\.json$/.test(n))) {
    const metadata = await json<{ sourceUrl: string; retrievedAt: string; results: MetadataRow[] }>(`data/eu/${name}`);
    if (!metadata || !Array.isArray(metadata.results)) { fail(`${name}: invalid metadata rows`); continue; }
    if (metadata.sourceUrl !== 'https://publications.europa.eu/webapi/rdf/sparql' || !time(metadata.retrievedAt)) fail(`${name}: invalid CELLAR metadata provenance`);
    metadataRows.push(...metadata.results);
  }
  if (!metadataRows.length) warnings.push('No saved CELLAR metadata rows: latest-version selection cannot be independently checked.');
  const routes = [['verktyg/', 'toolbox'], ['eu/', 'eu'], ['aktorer/', 'actors'], ['underlag/', 'evidence']] as const;
  for (const [route, marker] of routes) await html(route, marker);

  for (const summary of index.documents) {
    const id = summary.id, parts = celex(id);
    if (!parts || (parts[1] === '0' ? !parts[3] : !!parts[3])) { fail(`${id}: invalid CELEX identity`); continue; }
    const doc = await json<EuDocument>(`data/eu/documents/${id}.json`);
    const page = await html(`eu/${id}/`, 'eu-document');
    if (!doc) continue;
    if (!Array.isArray(doc.articles) || !Array.isArray(doc.sections) || typeof doc.text !== 'string' || typeof doc.markdown !== 'string') { fail(`${id}: invalid document structure`); continue; }
    const { articles, sections, markdown, text, ...documentSummary } = doc;
    if (!same(documentSummary, summary)) fail(`${id}: index/document metadata differ`);
    if (doc.id !== id || doc.celex !== id || doc.baseCelex !== `3${parts[2]}`) fail(`${id}: document CELEX/base identity mismatch`);
    if (doc.language !== 'SV' || doc.requestedLanguage !== 'SV') fail(`${id}: document is not requested Swedish text`);
    if (!day(doc.asOf) || doc.asOf !== index.asOf || !time(doc.retrievedAt) || !time(doc.inForceReportedAt)) fail(`${id}: invalid snapshot/retrieval/status date`);
    if (doc.documentDate !== null && (!day(doc.documentDate) || doc.documentDate > index.asOf)) fail(`${id}: invalid/future document date`);
    if (![true, false, null].includes(doc.inForce)) fail(`${id}: invalid inForce state`);
    const dateFromId = parts[3] ? `${parts[3].slice(0,4)}-${parts[3].slice(4,6)}-${parts[3].slice(6,8)}` : null;
    if (parts[1] === '0') {
      if (doc.versionKind !== 'consolidated' || !day(dateFromId) || doc.consolidationDate !== dateFromId || dateFromId > index.asOf
        || doc.versionSelection !== 'latest_consolidated_as_of') fail(`${id}: invalid/future consolidated version selection`);
    } else if (doc.versionKind !== 'original' || doc.consolidationDate !== null || !['original_no_consolidation_found', 'original_after_consolidated_failure', 'original_metadata_unavailable'].includes(doc.versionSelection)) fail(`${id}: original edition mislabelled`);
    if (doc.sourceUrl !== officialUrl(id)) fail(`${id}: source URL does not identify exact Swedish CELEX version`);
    try { const source = new URL(doc.contentSourceUrl); if (source.protocol !== 'https:' || source.hostname !== 'publications.europa.eu' || source.username || source.password) fail(`${id}: contentSourceUrl is not official HTTPS CELLAR`); }
    catch { fail(`${id}: invalid contentSourceUrl`); }
    for (const [key, expected] of [['documentUrl', `data/eu/documents/${id}.json`], ['markdownUrl', `eu-documents/${id}.md`], ['sourceHtmlUrl', `data/eu/sources/${id}.html.txt`]] as const) if (doc[key] !== expected) fail(`${id}: ${key} must identify its exact local artifact`);
    if (!Array.isArray(doc.linkedFffs) || !sameSet(doc.linkedFffs, [...(linked.get(doc.baseCelex) ?? [])])) fail(`${id}: linked FFFS metadata disagree with catalog`);
    if (doc.articleCount !== articles.length || doc.sectionCount !== sections.length || doc.textCharacters !== text.length || !articles.length || !text.trim()) fail(`${id}: article/section/text counts disagree`);
    if (!same(doc.articleTitles, articles.map(a => a.title))) fail(`${id}: article title metadata differ`);
    if (new Set(sections.map(s => s.id)).size !== sections.length || new Set(articles.map(a => a.id)).size !== articles.length) fail(`${id}: duplicate section/article ids`);
    if (!same(articles, sections.filter(s => s.kind === 'article'))) fail(`${id}: articles and section text disagree`);
    if (text !== sections.map(s => s.text).join('\n\n')) fail(`${id}: aggregate document text differs from sections`);
    const searchDoc = corpus.documents.find(d => d.id === id);
    const expectedSearch = { id, baseCelex: doc.baseCelex, title: doc.title, label: doc.label, linkedFffs: doc.linkedFffs, text,
      articles: articles.map(({ id, number, title, text, sourceUrl }) => ({ id, number, title, text, sourceUrl })) };
    if (!same(searchDoc, expectedSearch)) fail(`${id}: corpus metadata/text/articles differ from document`);
    const markdownPath = path.join(root, `eu-documents/${id}.md`);
    try { if (await fs.readFile(markdownPath, 'utf8') !== markdown) fail(`${id}: downloadable Markdown differs from document`); }
    catch { fail(`${id}: missing Markdown download`); }
    if (!/^[a-f0-9]{64}$/.test(doc.sourceSha256)) fail(`${id}: invalid SHA-256 metadata`);
    try {
      const sourceFile = localFile(new URL(doc.sourceHtmlUrl, base));
      if (!sourceFile) throw new Error('Source file is not local');
      const source = await fs.readFile(sourceFile);
      sourceHashesChecked++;
      if (createHash('sha256').update(source).digest('hex') !== doc.sourceSha256) fail(`${id}: source HTML SHA-256 mismatch`);
    } catch { fail(`${id}: source HTML missing`); }
    if (await exists(path.join(root, `data/eu/sources/${id}.html`))) fail(`${id}: executable raw source HTML must not be published on the application origin`);
    const mdHtml = parseHtml(markdown);
    const mdLinks: string[] = [];
    marked.walkTokens(marked.lexer(markdown), token => { if (token.type === 'link' || token.type === 'image') mdLinks.push(token.href); });
    for (const href of mdLinks) await link(href, new URL(doc.markdownUrl, base), `${id}.md`, 'Markdown link');
    for (const section of sections) {
      sectionCount++;
      if (!mdHtml.ids.has(section.id)) fail(`${id}: Markdown lacks section anchor ${section.id}`);
      if (page && !page.ids.has(section.id)) fail(`${id}: static HTML lacks section anchor ${section.id}`);
      if (!section.sourceUrl?.startsWith(doc.sourceUrl) || (section.sourceUrl !== doc.sourceUrl && !section.sourceUrl.startsWith(doc.sourceUrl + '#'))) fail(`${id}: section ${section.id} source does not match edition`);
    }
    articleCount += articles.length;
    if (page) {
      if (!page.tags.some(t => t.attrs['data-eu-document'] === id)) fail(`${id}: missing static EU document marker`);
      if (!page.tags.some(t => t.attrs.class?.split(/\s+/).includes('prose'))) fail(`${id}: missing static fulltext container`);
      if (!page.tags.some(t => t.name === 'button' && t.attrs['data-save-eu'] === id && !t.attrs['data-article'])) fail(`${id}: missing save-document button`);
      for (const article of articles) if (page.tags.filter(t => t.name === 'button' && t.attrs['data-save-eu'] === id && t.attrs['data-article'] === article.id).length !== 1) fail(`${id}: missing/duplicate save-article button ${article.id}`);
      const anchors = page.tags.filter(t => t.name === 'a' && t.attrs.href).flatMap(t => {
        try { return [new URL(t.attrs.href, new URL(`eu/${id}/`, base)).href]; } catch { return []; }
      });
      for (const source of [doc.sourceUrl, new URL(doc.documentUrl, base).href, new URL(doc.markdownUrl, base).href]) if (!anchors.includes(source)) fail(`${id}: missing source/JSON/Markdown link ${source}`);
      try {
        const ld = page.jsonLd.map(value => JSON.parse(value)).find(value => value['@type'] === 'DigitalDocument');
        if (!ld || ld.identifier !== id || ld.url !== new URL(`eu/${id}/`, base).href || ld.isBasedOn !== doc.sourceUrl || ld.inLanguage !== 'sv' || ld.name !== doc.title || ld.dateModified !== doc.retrievedAt) fail(`${id}: inconsistent DigitalDocument JSON-LD`);
      } catch { fail(`${id}: invalid JSON-LD`); }
    }
    const rows = metadataRows.filter(row => row.baseCelex?.value === doc.baseCelex);
    const versions = rows.flatMap(row => row.versionCelex?.value && row.versionDate?.value ? [{ id: row.versionCelex.value, date: row.versionDate.value.slice(0,10) }] : []);
    for (const version of versions) if (!day(version.date)) fail(`${id}: invalid saved version date ${version.date}`);
    const latest = versions.filter(v => day(v.date) && v.date <= index.asOf).sort((a,b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
    if (rows.length) {
      const originalDates = rows.flatMap(row => row.date?.value ? [row.date.value.slice(0,10)] : []);
      const sourceForce = rows.flatMap(row => row.inForce?.value ? [['true', '1'].includes(row.inForce.value)] : []);
      if (originalDates.length && !originalDates.includes(doc.documentDate ?? '')) fail(`${id}: document date differs from saved CELLAR metadata`);
      if (sourceForce.length && !sourceForce.includes(doc.inForce as boolean)) fail(`${id}: inForce differs from saved CELLAR metadata`);
      if (doc.versionSelection === 'latest_consolidated_as_of' && latest?.id !== id) fail(`${id}: selected consolidation is not latest saved metadata as of ${index.asOf}`);
      if (doc.versionSelection === 'original_no_consolidation_found' && latest) fail(`${id}: original claims no consolidation despite saved version metadata`);
      if (doc.versionSelection === 'original_after_consolidated_failure' && (!latest || !index.failures.some(f => f.baseCelex === doc.baseCelex && f.requestedCelex === latest.id && ['content', 'parse'].includes(f.stage)))) fail(`${id}: original fallback lacks recorded latest-consolidation failure`);
    } else if (metadataRows.length && doc.versionSelection !== 'original_metadata_unavailable') fail(`${id}: claimed version selection has no saved metadata`);
  }
  try {
    const sitemap = await fs.readFile(path.join(root, 'sitemap.xml'), 'utf8');
    for (const route of [...routes.map(([r]) => r), ...ids.map(id => `eu/${id}/`)]) if (!sitemap.includes(new URL(route, base).href)) fail(`Sitemap missing ${route}`);
  } catch { fail('Missing sitemap.xml'); }
  return result();
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const result = await validateToolbox({ distDir: process.argv[2] ?? 'dist' });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
