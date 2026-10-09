import { z } from 'zod';
import { canonicalId } from './search.js';
import type { Catalog, Corpus, DocumentContent, LibraryLoader } from './types.js';

const idSchema = z.string().regex(/^\d{4}-\d{2,3}$/);
const sectionSchema = z.object({ id: z.string(), title: z.string(), text: z.string(), page: z.number().int().positive().optional() });
const documentSchema = z.object({ id: idSchema, markdown: z.string(), sections: z.array(sectionSchema) });
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableText = z.string().nullable().optional();
const amendmentSchema = z.object({ number: z.string(), effectiveFrom: nullableText, sourceUrl: nullableText, pdfUrl: nullableText });
const catalogDocumentSchema = z.object({
  id: idSchema, number: z.string(), title: z.string(), year: z.number().int(),
  status: z.enum(['current', 'upcoming', 'repealed', 'repealing']), kind: z.enum(['fi_consolidated', 'self_consolidated', 'original']),
  effectiveFrom: nullableText, repealedOn: nullableText, asOf: dateSchema,
  sourceUrl: nullableText, originalPdfUrl: nullableText, pdfUrl: nullableText, markdownUrl: nullableText, pageUrl: nullableText, canonicalUrl: nullableText,
  categories: z.array(z.string()).optional(), institutions: z.array(z.string()).optional(),
  applicability: z.object({ text: z.string(), sourceUrl: z.string(), sectionId: z.string().optional(), note: z.string().optional() }).optional(),
  tagsEvidence: z.array(z.object({ tag: z.string(), type: z.enum(['category', 'institution']), evidence: z.string(), sourceUrl: z.string(), sectionId: z.string().optional(), confidence: z.enum(['explicit', 'editorial']) })).optional(),
  amendments: z.array(amendmentSchema), notes: z.array(z.string()), textQuality: z.string().optional(), pageCount: z.number().int().optional()
}).passthrough();
const catalogSchema = z.object({ asOf: dateSchema, documents: z.array(catalogDocumentSchema) });
const corpusSchema = z.object({ asOf: dateSchema, documents: z.array(documentSchema) });

/** Public, fixed GitHub Pages root supplied by deployment configuration, never a tool argument. */
export function canonicalDataBase(input: string): URL {
  const url = new URL(input.endsWith('/') ? input : `${input}/`);
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.github\.io$/i.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash) throw new Error('DATA_BASE_URL måste vara en fast HTTPS-adress på GitHub Pages.');
  return url;
}

export class GitHubPagesLoader implements LibraryLoader {
  readonly base: URL;
  get publicBaseUrl() { return this.base.href; }
  private readonly cache = new Map<string, { expires: number; value: Promise<unknown> }>();
  constructor(baseUrl: string, private readonly fetcher: typeof fetch = fetch, private readonly ttlMs = 300_000) { this.base = canonicalDataBase(baseUrl); }
  private async load<T>(path: string, maxBytes: number, parse: (value: unknown) => T): Promise<T> {
    const now = Date.now();
    const cached = this.cache.get(path);
    if (cached && cached.expires > now) { this.cache.delete(path); this.cache.set(path, cached); return cached.value as Promise<T>; }
    this.cache.delete(path);
    const value = (async () => {
      const response = await this.fetcher(new URL(path, this.base), { redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`Källdatan kunde inte hämtas (HTTP ${response.status}).`);
      if (Number(response.headers.get('content-length') ?? 0) > maxBytes) throw new Error('Källfilen överskrider storleksgränsen.');
      if (!response.body) throw new Error('Källfilen är tom.');
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
      try {
        while (true) { const { done, value: chunk } = await reader.read(); if (done) break; bytes += chunk.byteLength; if (bytes > maxBytes) { await reader.cancel(); throw new Error('Källfilen överskrider storleksgränsen.'); } chunks.push(chunk); }
      } finally { reader.releaseLock(); }
      const buffer = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
      return parse(JSON.parse(new TextDecoder().decode(buffer)));
    })();
    this.cache.set(path, { expires: now + this.ttlMs, value });
    // Two bulk files plus at most 32 recent individual documents per isolate.
    while (this.cache.size > 34) this.cache.delete(this.cache.keys().next().value!);
    try { return await value; } catch (error) { this.cache.delete(path); throw error; }
  }
  async catalog(): Promise<Catalog> { return this.load('data/catalog.json', 4_000_000, value => catalogSchema.parse(value)); }
  async corpus(): Promise<Corpus> { return this.load('data/search.json', 32_000_000, value => corpusSchema.parse(value)); }
  async document(id: string): Promise<DocumentContent> {
    const canonical = canonicalId(id);
    const result = await this.load(`data/documents/${canonical}.json`, 4_000_000, value => documentSchema.parse(value));
    if (result.id !== canonical) throw new Error('Dokumentets id matchar inte källfilen.');
    return result;
  }
}
