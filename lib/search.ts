import type { Catalog, CatalogDocument, Corpus, DocumentContent, Kind, Section, Status } from './types.js';

export const MAX_PAGE_CHARS = 20_000;
export const normalize = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sv-SE');
export const tokenize = (value: string): string[] => [...new Set(normalize(value).match(/[\p{L}\p{N}]+/gu) ?? [])].slice(0, 16);

/** Accept a canonical id or a complete FFFS number. Never returns a path. */
export function canonicalId(value: string): string {
  const match = value.trim().match(/^(?:FFFS\s*)?(\d{4})\s*[:/-]\s*0*(\d{1,3})$/i);
  if (!match || Number(match[2]) === 0) throw new Error('Ange ett FFFS-nummer, till exempel FFFS 2014:12.');
  return `${match[1]}-${Number(match[2]).toString().padStart(2, '0')}`;
}

export interface SearchOptions { query?: string; status?: Status | 'all'; kind?: Kind | 'all'; year?: number; category?: string; institution?: string; limit?: number; offset?: number }
export interface SearchHit { document: CatalogDocument; score: number; snippet: string; sectionId?: string; sectionTitle?: string; page?: number }
const bound = (n: number | undefined, fallback: number, max: number) => Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n!))) : fallback;

function snippet(text: string, terms: string[]): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const folded = normalize(flat);
  const positions = terms.map(term => folded.indexOf(term)).filter(index => index >= 0);
  const at = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, at - 90);
  return `${start ? '…' : ''}${flat.slice(start, start + 360)}${flat.length > start + 360 ? '…' : ''}`;
}

/** Pure browser/Worker shared search. AND token matching, accent tolerant; default only current. */
export function searchDocuments(catalog: Catalog, corpus: Corpus, options: SearchOptions = {}) {
  if (catalog.asOf !== corpus.asOf) throw new Error('Katalog och sökindex har olika snapshotdatum.');
  const query = (options.query ?? '').trim().slice(0, 240);
  const terms = tokenize(query);
  let exactId: string | undefined;
  try { exactId = canonicalId(query); } catch { /* Normal free-text query. */ }
  const contents = new Map(corpus.documents.map(doc => [doc.id, doc]));
  const results: SearchHit[] = [];
  const status = options.status ?? 'current';
  for (const document of catalog.documents) {
    if (status !== 'all' && document.status !== status) continue;
    if (options.kind && options.kind !== 'all' && document.kind !== options.kind) continue;
    if (options.year !== undefined && document.year !== options.year) continue;
    if (options.category && !(document.categories ?? []).some(tag => normalize(tag) === normalize(options.category!))) continue;
    if (options.institution && !(document.institutions ?? []).some(tag => normalize(tag) === normalize(options.institution!))) continue;
    if (exactId && document.id !== exactId) continue;
    const content = contents.get(document.id);
    const title = normalize(`${document.number} ${document.title}`);
    const text = normalize(content?.markdown ?? '');
    const tags = normalize([...(document.categories ?? []), ...(document.institutions ?? [])].join(' '));
    if (!exactId && terms.some(term => !title.includes(term) && !text.includes(term) && !tags.includes(term))) continue;
    const rankedSections = (content?.sections ?? []).map(section => ({ section, score: terms.reduce((n, term) => n + (normalize(section.title).includes(term) ? 5 : 0) + (normalize(section.text).includes(term) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score);
    const best = rankedSections[0];
    const evidence = document.tagsEvidence?.find(item => terms.some(term => normalize(item.tag).includes(term)));
    const evidenceSection = evidence?.sectionId ? content?.sections.find(section => section.id === evidence.sectionId) : undefined;
    const section = best && (best.score > 0 || !terms.length) ? best.section : evidenceSection;
    const score = exactId ? 10_000 : terms.reduce((n, term) => n + (title.includes(term) ? 30 : tags.includes(term) ? 8 : 0), 0) + (best?.score ?? 0);
    results.push({ document, score, snippet: snippet(section?.text ?? evidence?.evidence ?? content?.markdown ?? document.title, terms), ...(section ? { sectionId: section.id, sectionTitle: section.title, page: section.page } : {}) });
  }
  results.sort((a, b) => b.score - a.score || b.document.year - a.document.year || Number(b.document.id.split('-')[1]) - Number(a.document.id.split('-')[1]));
  const offset = bound(options.offset, 0, 10_000);
  const limit = Math.max(1, bound(options.limit, 20, 200));
  return { asOf: catalog.asOf, total: results.length, results: results.slice(offset, offset + limit), offset, limit, nextOffset: offset + limit < results.length ? offset + limit : null };
}

// Cursor ties offsets to the source text; it cannot silently resume a changed document.
function fingerprint(text: string) { let hash = 2166136261; for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619); return (hash >>> 0).toString(36); }
export function pageText(text: string, scope: string, cursor?: string, requestedChars = MAX_PAGE_CHARS) {
  const stamp = fingerprint(text);
  let offset = 0;
  if (cursor) {
    const parts = cursor.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1' || parts[1] !== encodeURIComponent(scope) || parts[3] !== stamp || !/^\d+$/.test(parts[2])) throw new Error('Ogiltig eller inaktuell cursor. Börja om utan cursor.');
    offset = Number(parts[2]);
    if (!Number.isSafeInteger(offset) || offset > text.length) throw new Error('Cursor utanför dokumentet.');
  }
  const size = Math.max(1, bound(requestedChars, MAX_PAGE_CHARS, MAX_PAGE_CHARS));
  let end = Math.min(text.length, offset + size);
  if (end < text.length && end > offset && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  if (end === offset && offset < text.length) throw new Error('Öka maxChars till minst 2 för att läsa detta tecken.');
  return { content: text.slice(offset, end), offset, returnedChars: end - offset, totalChars: text.length, nextCursor: end < text.length ? `v1:${encodeURIComponent(scope)}:${end}:${stamp}` : null };
}

function numberPart(value: string, suffix: string): string {
  const stripped = normalize(value).replace(new RegExp(`\\s*${suffix}\\s*$`), '').replace(/\s+/g, '').trim();
  if (!/^\d+[a-z]?$/.test(stripped)) throw new Error('Ogiltigt kapitel- eller paragrafnummer.');
  return stripped;
}
export function findSections(document: DocumentContent, options: { sectionId?: string; chapter?: string; paragraph?: string }): Section[] {
  if (options.sectionId) return document.sections.filter(section => section.id === options.sectionId);
  if (!options.chapter && !options.paragraph) throw new Error('Ange sectionId, chapter eller paragraph.');
  const chapter = options.chapter ? numberPart(options.chapter, 'kap\\.?') : undefined;
  const paragraph = options.paragraph ? numberPart(options.paragraph, '§') : undefined;
  let activeChapter: string | undefined;
  let inBackMatter = false;
  return document.sections.filter(section => {
    const heading = normalize(section.title).replace(/^[#*\s]+/, '').trim();
    // An appendix or commencement section ends the preceding chapter. A later
    // genuine chapter heading may start a new scope in compiled documents.
    if (/^(?:bilaga(?:\s|$)|ikrafttradande|ikraft-|overgangsbestammelser|overgangs-)/.test(heading)) {
      activeChapter = undefined;
      inBackMatter = true;
    }
    const fullParagraph = heading.match(/^(\d+\s*[a-z]?)\s*kap\.\s*(\d+\s*[a-z]?)\s*§$/);
    const chapterMatch = heading.match(/^(\d+\s*[a-z]?)\s*kap\.(?:\s+(?!\d+\s*[a-z]?\s*§).*)?$/);
    if (chapterMatch) {
      activeChapter = chapterMatch[1].replace(/\s+/g, '');
      inBackMatter = false;
    }
    // A reference followed by prose ("3 kap. 2 § andra stycket ...") is not a
    // provision heading, even when imperfect extraction placed it in title.
    const paragraphMatch = heading.match(/^(\d+\s*[a-z]?)\s*§$/);
    const ownChapter = fullParagraph?.[1].replace(/\s+/g, '');
    if (ownChapter && !activeChapter && !inBackMatter) activeChapter = ownChapter;
    const ownParagraph = (fullParagraph?.[2] ?? paragraphMatch?.[1])?.replace(/\s+/g, '');
    if (paragraph && ownChapter && activeChapter && ownChapter !== activeChapter) return false;
    return (!chapter || (!inBackMatter && activeChapter === chapter)) && (!paragraph || ownParagraph === paragraph);
  });
}
