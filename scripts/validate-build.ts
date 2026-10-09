import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Parser } from 'htmlparser2';
import { marked } from 'marked';
import { SITE_URL } from '../src/config';
import type { Catalog, Corpus, DocumentContent } from '../lib/types';

type Tag = { name: string; attrs: Record<string, string> };
type ParsedHtml = { tags: Tag[]; ids: Set<string>; title: string; jsonLd: string[]; text: string };
export function parseHtml(html: string): ParsedHtml {
  const result: ParsedHtml = { tags: [], ids: new Set(), title: '', jsonLd: [], text: '' };
  let inTitle = false, inJson = false, json = '';
  const parser = new Parser({
    onopentag(name, attrs) { result.tags.push({ name, attrs }); if (attrs.id) result.ids.add(attrs.id); if (name === 'title') inTitle = true; if (name === 'script' && attrs.type === 'application/ld+json') { inJson = true; json = ''; } },
    ontext(text) { result.text += text; if (inTitle) result.title += text; if (inJson) json += text; },
    onclosetag(name) { if (name === 'title') inTitle = false; if (name === 'script' && inJson) { result.jsonLd.push(json); inJson = false; } }
  }, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true });
  parser.write(html); parser.end(); return result;
}
export async function validateBuild(options: { distDir?: string; siteUrl?: string; expectedCount?: number } = {}) {
  const root = path.resolve(options.distDir ?? 'dist');
  const base = new URL(options.siteUrl ?? SITE_URL);
  const expectedCount = options.expectedCount ?? 130;
  const errors: string[] = [], warnings: string[] = [];
  const seenErrors = new Set<string>();
  const checkedLinks = new Set<string>();
  const htmlByPath = new Map<string, ParsedHtml>();
  let documentCount = 0, sectionCount = 0, imageLinks = 0, htmlCount = 0;
  const error = (message: string) => { if (seenErrors.has(message)) return; seenErrors.add(message); if (errors.length < 60) errors.push(message); };
  const readJson = async <T>(relative: string): Promise<T | undefined> => { try { return JSON.parse(await fs.readFile(path.join(root, relative), 'utf8')) as T; } catch (cause) { error(`Cannot read JSON ${relative}: ${cause instanceof Error ? cause.message : String(cause)}`); return undefined; } };
  const exists = async (filename: string) => { try { return (await fs.stat(filename)).isFile(); } catch { return false; } };
  function localPath(url: URL): string | undefined {
    if (url.origin !== base.origin) return undefined;
    if (!url.pathname.startsWith(base.pathname)) { error(`Local URL escapes the Pages base ${base.pathname}: ${url.href}`); return undefined; }
    let relative: string;
    try { relative = decodeURIComponent(url.pathname.slice(base.pathname.length)); } catch { error(`Invalid URL encoding: ${url.href}`); return undefined; }
    const filename = path.resolve(root, relative || '.');
    if (filename !== root && !filename.startsWith(root + path.sep)) { error(`Local URL escapes dist: ${url.href}`); return undefined; }
    return url.pathname.endsWith('/') ? path.join(filename, 'index.html') : filename;
  }
  async function checkLink(value: string | undefined, pageUrl: URL, source: string, kind: string) {
    if (!value || /^(mailto:|tel:|data:)/i.test(value)) return;
    if (/^(?:javascript|file):/i.test(value)) { error(`${source}: unsafe/nonpublic ${kind} ${value}`); return; }
    let url: URL; try { url = new URL(value, pageUrl); } catch { error(`${source}: invalid ${kind} ${value}`); return; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') { error(`${source}: unsupported ${kind} URL ${value}`); return; }
    if (url.origin !== base.origin) return;
    const key = `${kind}:${url.href}`; if (checkedLinks.has(key)) return; checkedLinks.add(key);
    const filename = localPath(url); if (!filename) return;
    if (!await exists(filename)) { error(`${source}: missing ${kind} ${url.pathname}`); return; }
    if (url.hash && filename.endsWith('.html')) {
      const page = htmlByPath.get(filename) ?? parseHtml(await fs.readFile(filename, 'utf8')); htmlByPath.set(filename, page);
      let id: string; try { id = decodeURIComponent(url.hash.slice(1)); } catch { error(`${source}: invalid anchor ${url.hash}`); return; }
      if (id && !page.ids.has(id)) error(`${source}: missing anchor ${url.pathname}${url.hash}`);
    }
  }
  async function readHtml(relative: string, canonical?: string) {
    const filename = path.join(root, relative);
    let parsed: ParsedHtml;
    try { parsed = parseHtml(await fs.readFile(filename, 'utf8')); htmlByPath.set(filename, parsed); htmlCount++; }
    catch { error(`Missing static HTML: ${relative}`); return undefined; }
    const pageUrl = new URL(relative.replace(/index\.html$/, ''), base);
    if (!parsed.title.trim()) error(`${relative}: missing title`);
    if (!parsed.tags.some(tag => tag.name === 'script' && tag.attrs.src)) error(`${relative}: missing JavaScript bundle reference`);
    if (!parsed.tags.some(tag => tag.name === 'link' && tag.attrs.rel === 'stylesheet')) error(`${relative}: missing stylesheet reference`);
    const description = parsed.tags.find(tag => tag.name === 'meta' && tag.attrs.name === 'description')?.attrs.content;
    if (!description?.trim()) error(`${relative}: missing description`);
    if (canonical) {
      const canonicals = parsed.tags.filter(tag => tag.name === 'link' && tag.attrs.rel === 'canonical');
      if (canonicals.length !== 1 || canonicals[0].attrs.href !== canonical) error(`${relative}: canonical must equal ${canonical}`);
    }
    for (const tag of parsed.tags) {
      if (tag.attrs.href) await checkLink(tag.attrs.href, pageUrl, relative, tag.name === 'link' && tag.attrs.rel === 'stylesheet' ? 'stylesheet' : 'link');
      if (tag.attrs.src) { if (tag.name === 'img') imageLinks++; await checkLink(tag.attrs.src, pageUrl, relative, tag.name === 'script' ? 'script' : 'media'); }
      if (tag.attrs.srcset) for (const candidate of tag.attrs.srcset.split(',')) await checkLink(candidate.trim().split(/\s+/)[0], pageUrl, relative, 'srcset');
    }
    return parsed;
  }
  const catalog = await readJson<Catalog>('data/catalog.json');
  const corpus = await readJson<Corpus>('data/search.json');
  if (!catalog || !corpus) return { ok: false, errors, warnings, documentCount, htmlCount, sectionCount, imageLinks, checkedLocalLinks: checkedLinks.size };
  documentCount = catalog.documents.length;
  if (documentCount !== expectedCount) error(`Expected ${expectedCount} catalog documents, found ${documentCount}`);
  if (corpus.asOf !== catalog.asOf) error('Catalog and corpus snapshot dates differ');
  const ids = new Set(catalog.documents.map(doc => doc.id));
  if (ids.size !== documentCount) error('Duplicate catalog ids');
  const corpusIds = new Set(corpus.documents.map(doc => doc.id));
  if (corpusIds.size !== corpus.documents.length) error('Duplicate corpus ids');
  if (ids.size !== corpusIds.size || [...ids].some(id => !corpusIds.has(id))) error('Catalog/corpus document sets differ');
  const corpusById = new Map(corpus.documents.map(doc => [doc.id, doc]));
  for (const route of ['', 'mcp/', 'om/']) await readHtml(`${route}index.html`, new URL(route, base).href);
  for (const doc of catalog.documents) {
    const canonical = new URL(`fffs/${doc.id}/`, base).href;
    if (doc.canonicalUrl !== canonical) error(`${doc.id}: metadata canonicalUrl must equal ${canonical}`);
    if (doc.pageUrl && doc.pageUrl !== canonical) error(`${doc.id}: pageUrl alias disagrees with canonicalUrl`);
    if (doc.asOf !== catalog.asOf) error(`${doc.id}: document metadata snapshot differs from catalog`);
    const page = await readHtml(`fffs/${doc.id}/index.html`, canonical);
    if (page && !page.tags.some(tag => tag.attrs['data-document'] === doc.id)) error(`${doc.id}: missing static document marker`);
    if (page && !page.text.includes(doc.number)) error(`${doc.id}: number missing from static page`);
    if (page && !page.text.includes(catalog.asOf)) error(`${doc.id}: snapshot missing from static page`);
    if (page && !page.tags.some(tag => tag.attrs.class?.split(/\s+/).includes('prose'))) error(`${doc.id}: missing prerendered fulltext container`);
    if (page) {
      let metadata: Record<string, unknown>[] = [];
      try { metadata = page.jsonLd.map(text => JSON.parse(text)); } catch { error(`${doc.id}: invalid JSON-LD`); }
      const ld = metadata.find(value => value['@type'] === 'DigitalDocument');
      if (!ld || ld.identifier !== doc.number || ld.url !== canonical) error(`${doc.id}: missing/inconsistent DigitalDocument JSON-LD`);
    }
    const content = await readJson<DocumentContent>(`data/documents/${doc.id}.json`);
    if (content) {
      if (content.id !== doc.id) error(`${doc.id}: JSON document id mismatch`);
      const corpusDoc = corpusById.get(doc.id);
      if (corpusDoc?.markdown !== content.markdown || JSON.stringify(corpusDoc?.sections) !== JSON.stringify(content.sections)) error(`${doc.id}: corpus and document JSON disagree`);
      if (new Set(content.sections.map(section => section.id)).size !== content.sections.length) error(`${doc.id}: duplicate section ids`);
      for (const section of content.sections) { sectionCount++; if (page && !page.ids.has(section.id)) error(`${doc.id}: static HTML lacks section anchor ${section.id}`); }
      if (!content.markdown.trim()) error(`${doc.id}: empty Markdown`);
      if (!doc.markdownUrl) error(`${doc.id}: no Markdown URL`);
      else {
        const markdownUrl = new URL(doc.markdownUrl, base); const filename = localPath(markdownUrl);
        if (!filename || !await exists(filename)) error(`${doc.id}: Markdown download missing`);
        else if (await fs.readFile(filename, 'utf8') !== content.markdown) error(`${doc.id}: downloadable Markdown differs from document JSON`);
        const links: { href: string; kind: string }[] = [];
        marked.walkTokens(marked.lexer(content.markdown), token => { if (token.type === 'image' || token.type === 'link') links.push({ href: token.href, kind: token.type }); });
        for (const link of links) { if (link.kind === 'image') imageLinks++; await checkLink(link.href, markdownUrl, `${doc.id}.md`, `Markdown ${link.kind}`); }
        for (const tag of parseHtml(content.markdown).tags) { if (tag.attrs.src) await checkLink(tag.attrs.src, markdownUrl, `${doc.id}.md`, 'Markdown HTML media'); if (tag.attrs.href) await checkLink(tag.attrs.href, markdownUrl, `${doc.id}.md`, 'Markdown HTML link'); }
      }
    }
    if (!doc.pdfUrl) error(`${doc.id}: no PDF URL`);
    else {
      const filename = localPath(new URL(doc.pdfUrl, base));
      if (!filename || !await exists(filename)) error(`${doc.id}: PDF download missing`);
      else { const handle = await fs.open(filename, 'r'); try { const bytes = Buffer.alloc(5); const { bytesRead } = await handle.read(bytes, 0, 5, 0); if (bytesRead !== 5 || bytes.toString() !== '%PDF-') error(`${doc.id}: file does not have a PDF header`); } finally { await handle.close(); } }
    }
  }
  try {
    const sitemap = await fs.readFile(path.join(root, 'sitemap.xml'), 'utf8');
    for (const id of ids) if (!sitemap.includes(new URL(`fffs/${id}/`, base).href)) error(`Sitemap missing ${id}`);
  } catch { error('Missing sitemap.xml'); }
  for (const name of ['robots.txt', 'llms.txt', '.nojekyll']) if (!await exists(path.join(root, name))) error(`Missing ${name}`);
  return { ok: !errors.length, errors, errorCount: seenErrors.size, omittedErrors: Math.max(0, seenErrors.size - errors.length), warnings, asOf: catalog.asOf, documentCount, htmlCount, sectionCount, imageLinks, checkedLocalLinks: checkedLinks.size };
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const result = await validateBuild({ distDir: process.argv[2] ?? 'dist', expectedCount: process.env.EXPECTED_DOCUMENTS ? Number(process.env.EXPECTED_DOCUMENTS) : 130 });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
