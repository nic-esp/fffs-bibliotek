import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { baseCelexOf, getEuArticle, normalizeCelex, searchEuDocuments, type EuDocument, type EuDocumentSummary, type EuLoader } from './eurlex.js';
import { canonicalId, MAX_PAGE_CHARS, pageText } from './search.js';
import { getScreeningProviderStatus } from './screening.js';
import type { CatalogDocument, LibraryLoader } from './types.js';

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const paging = { cursor: z.string().max(500).optional(), maxChars: z.number().int().min(2).max(MAX_PAGE_CHARS).default(MAX_PAGE_CHARS) };
const listing = { limit: z.number().int().min(1).max(50).default(20), offset: z.number().int().min(0).max(10_000).default(0) };
const celex = z.string().min(1).max(80).describe('Grundaktens CELEX-id eller exakt daterad konsolidering, t.ex. 32022R2554.');
const status = z.enum(['current', 'upcoming', 'repealed', 'repealing', 'all']).default('current');
const result = (value: Record<string, unknown>) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value });
async function guarded(fn: () => Promise<Record<string, unknown>>) {
  try { return result(await fn()); }
  catch (error) { return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : 'Källunderlaget kunde inte läsas.' }], isError: true }; }
}
const sourceUrl = z.string().url().refine(value => { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; });
const relationSchema = z.object({
  celex: z.string(), title: z.string().optional(), label: z.string().optional(), relation: z.enum(['implements', 'supplements', 'references']),
  url: sourceUrl, evidence: z.string().min(1).max(50_000), sourceUrl: sourceUrl.optional(),
  sectionId: z.string().max(200).optional(), sourceSectionTitle: z.string().optional(), page: z.number().int().positive().optional(), evidenceType: z.string().optional(),
});

/** Adds only anonymous read tools. EU data is a versioned imported selection, not a live legal-status service. */
export function registerToolboxTools(server: McpServer, euLoader: EuLoader, catalogLoader: LibraryLoader): void {
  const absolute = (path: string): string => catalogLoader.publicBaseUrl ? new URL(path, catalogLoader.publicBaseUrl).href : path;
  const euMetadata = (doc: EuDocumentSummary) => ({
    id: doc.id, celex: doc.celex, baseCelex: doc.baseCelex, title: doc.title, label: doc.label,
    language: doc.language, requestedLanguage: doc.requestedLanguage, versionKind: doc.versionKind,
    consolidationDate: doc.consolidationDate, documentDate: doc.documentDate, inForce: doc.inForce,
    inForceReportedAt: doc.inForceReportedAt, asOf: doc.asOf, retrievedAt: doc.retrievedAt,
    sourceUrl: doc.sourceUrl, contentSourceUrl: doc.contentSourceUrl, sourceSha256: doc.sourceSha256,
    canonicalUrl: absolute(`eu/${doc.id}/`), documentUrl: absolute(doc.documentUrl), markdownUrl: absolute(doc.markdownUrl), sourceHtmlUrl: absolute(doc.sourceHtmlUrl),
    articleCount: doc.articleCount, sectionCount: doc.sectionCount, textCharacters: doc.textCharacters,
    linkedFffs: doc.linkedFffs, notes: doc.notes, versionSelection: doc.versionSelection,
  });
  const fffsMetadata = (doc: CatalogDocument) => ({
    id: doc.id, number: doc.number, title: doc.title, status: doc.status, kind: doc.kind,
    asOf: doc.asOf, effectiveFrom: doc.effectiveFrom, repealedOn: doc.repealedOn,
    categories: doc.categories ?? [], institutions: doc.institutions ?? [],
    sourceUrl: doc.sourceUrl, canonicalUrl: doc.canonicalUrl ?? doc.pageUrl ?? absolute(`fffs/${doc.id}/`),
    pdfUrl: doc.pdfUrl ? absolute(doc.pdfUrl) : null, notes: doc.notes,
  });
  async function readDocument(input: string): Promise<EuDocument> {
    const id = normalizeCelex(input); const index = await euLoader.index();
    const summary = index.documents.find(doc => doc.id === id || (id[0] === '3' && doc.baseCelex === id));
    if (!summary) throw new Error('Den begärda EU-utgåvan finns inte i det importerade urvalet. Sök på grundaktens CELEX för att se tillgänglig utgåva.');
    const document = await euLoader.document(summary.id);
    if (document.id !== summary.id || document.baseCelex !== summary.baseCelex || document.asOf !== index.asOf || document.asOf !== summary.asOf || document.sourceSha256 !== summary.sourceSha256 || document.language !== 'SV') throw new Error('EU-index och dokument har olika versioner. Försök igen när källdatan är uppdaterad.');
    return document;
  }

  server.registerTool('search_eu', {
    description: 'Sök i svensk EU-fulltext i bibliotekets importerade urval. Resultaten visar vald utgåva, hämtningstid, källa och eventuell artikel. Tom fråga listar urvalet. Ingen träff bevisar inte att EU-regeln saknas.',
    inputSchema: { query: z.string().max(240).default(''), fffsId: z.string().max(40).optional(), celex: celex.optional(), ...listing }, annotations,
  }, args => guarded(async () => {
    const [index, corpus] = await Promise.all([euLoader.index(), euLoader.corpus()]);
    if (index.asOf !== corpus.asOf || index.documents.length !== corpus.documents.length || new Set(index.documents.map(doc => doc.id)).size !== index.documents.length || new Set(corpus.documents.map(doc => doc.id)).size !== corpus.documents.length || corpus.documents.some(doc => !index.documents.some(meta => meta.id === doc.id && meta.baseCelex === doc.baseCelex))) throw new Error('EU-index och fulltextsökning har olika versioner.');
    const selected = args.celex ? normalizeCelex(args.celex) : undefined;
    let exact: string | undefined;
    try { exact = normalizeCelex(args.query); } catch { /* Ordinary text query. */ }
    const matchesId = (doc: { id: string; baseCelex: string }, value?: string) => !value || (value[0] === '0' ? doc.id === value : doc.baseCelex === value);
    const fffsId = args.fffsId ? canonicalId(args.fffsId) : undefined;
    // The shared UI helper caps a result set at 100. Per-document matching keeps
    // totals and pagination correct if the imported selection grows beyond that.
    const hits = corpus.documents.filter(doc => matchesId(doc, selected) && matchesId(doc, exact)).flatMap(doc => searchEuDocuments({ ...corpus, documents: [doc] }, exact ? '' : args.query, { limit: 1, fffsId })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const results = hits.slice(args.offset, args.offset + args.limit).map(hit => {
      const document = euMetadata(index.documents.find(doc => doc.id === hit.id)!);
      return { document, score: hit.score, snippet: hit.snippet, articleId: hit.articleId, articleNumber: hit.articleNumber, sourceUrl: hit.sourceUrl ?? document.sourceUrl, canonicalUrl: document.canonicalUrl + (hit.articleId ? `#${encodeURIComponent(hit.articleId)}` : '') };
    });
    return { asOf: index.asOf, retrievedAt: index.retrievedAt, coverage: index.coverage, total: hits.length, offset: args.offset, limit: args.limit, nextOffset: args.offset + args.limit < hits.length ? args.offset + args.limit : null, results };
  }));
  server.registerTool('get_eu_document', {
    description: 'Läs hela den importerade svenska EU-utgåvan som Markdown, inklusive ingress och bilagor. Följ nextCursor för mer än 20 000 tecken. Ett grund-CELEX väljer indexets utgåva; ett daterat CELEX kräver exakt utgåva.',
    inputSchema: { id: celex, ...paging }, annotations,
  }, args => guarded(async () => {
    const doc = await readDocument(args.id);
    return { asOf: doc.asOf, document: euMetadata(doc), format: 'markdown', ...pageText(doc.markdown, `eu/${doc.id}@${doc.asOf}/${doc.sourceSha256}`, args.cursor, args.maxChars), sections: doc.sections.map(({ id, kind, number, title, sourceUrl }) => ({ id, kind, number, title, sourceUrl })) };
  }));
  server.registerTool('get_eu_article', {
    description: 'Läs en exakt artikel ur vald EU-utgåva. Ange artikelnummer eller artikel-id från sökningen, t.ex. 5 eller article-5. Följ nextCursor för hela långa artikeln. Frånvaro i urvalet avgör inte gällande rätt.',
    inputSchema: { id: celex, article: z.string().min(1).max(100), ...paging }, annotations,
  }, args => guarded(async () => {
    const doc = await readDocument(args.id); const article = getEuArticle(doc, args.article);
    if (!article) throw new Error('Artikeln hittades inte i denna importerade utgåva. Kontrollera dokumentets sektionslista och originalkällan.');
    return { asOf: doc.asOf, document: euMetadata(doc), article: { id: article.id, number: article.number, title: article.title, sourceUrl: article.sourceUrl, canonicalUrl: `${absolute(`eu/${doc.id}/`)}#${encodeURIComponent(article.id)}` }, format: 'markdown', ...pageText(article.markdown, `eu/${doc.id}@${doc.asOf}/${doc.sourceSha256}#${article.id}`, args.cursor, args.maxChars) };
  }));
  server.registerTool('get_regulatory_links', {
    description: 'Visa kartlagda FFFS–EU-kopplingar med relationstyp och källbelägg. Standard endast gällande FFFS i snapshoten; status all inkluderar historiska och kommande akter. Hänvisning, genomförande och komplettering hålls isär. Kartläggningen är inte uttömmande.',
    inputSchema: { fffsId: z.string().max(40).optional(), celex: celex.optional(), status, ...listing }, annotations,
  }, args => guarded(async () => {
    const [catalog, index] = await Promise.all([catalogLoader.catalog(), euLoader.index()]);
    const fffsId = args.fffsId ? canonicalId(args.fffsId) : undefined; const euId = args.celex ? baseCelexOf(args.celex) : undefined;
    const links: Record<string, unknown>[] = []; let unavailableRelationCount = 0;
    for (const doc of catalog.documents) {
      if ((fffsId && doc.id !== fffsId) || (args.status !== 'all' && doc.status !== args.status)) continue;
      const relations = (doc as CatalogDocument & { euRelations?: unknown }).euRelations;
      if (relations !== undefined && !Array.isArray(relations)) { unavailableRelationCount++; continue; }
      for (const raw of (relations ?? []) as unknown[]) {
        const parsed = relationSchema.safeParse(raw);
        if (!parsed.success) { unavailableRelationCount++; continue; }
        const relation = parsed.data; let baseCelex: string;
        try { baseCelex = baseCelexOf(relation.celex); } catch { unavailableRelationCount++; continue; }
        if (euId && euId !== baseCelex) continue;
        const imported = index.documents.find(document => document.baseCelex === baseCelex);
        links.push({
          fffs: fffsMetadata(doc),
          eu: { celex: relation.celex, baseCelex, title: relation.title, label: relation.label, sourceUrl: relation.url, importedDocument: imported ? euMetadata(imported) : null },
          relation: { type: relation.relation, evidence: relation.evidence, sourceUrl: relation.sourceUrl ?? doc.sourceUrl, sectionId: relation.sectionId, sectionTitle: relation.sourceSectionTitle, page: relation.page, evidenceType: relation.evidenceType },
          evidenceUrl: `${fffsMetadata(doc).canonicalUrl}${relation.sectionId ? `#${encodeURIComponent(relation.sectionId)}` : ''}`,
        });
      }
    }
    return { asOf: catalog.asOf, euAsOf: index.asOf, total: links.length, offset: args.offset, limit: args.limit, nextOffset: args.offset + args.limit < links.length ? args.offset + args.limit : null, results: links.slice(args.offset, args.offset + args.limit), unavailableRelationCount, note: 'Endast befintliga källbelagda kopplingar i biblioteket. En hänvisning är inte i sig ett besked om tillämpning eller genomförande.' };
  }));
  server.registerTool('get_toolbox_status', {
    description: 'Visa FFFS- och EU-snapshot, importtäckning och begränsningar samt manuell åtkomst till screeningkällor. Ingen screening utförs; uppgifterna är inte ett intyg om rättslig fullständighet.',
    inputSchema: {}, annotations,
  }, () => guarded(async () => {
    const [catalog, index] = await Promise.all([catalogLoader.catalog(), euLoader.index()]);
    return {
      fffs: { asOf: catalog.asOf, documentCount: catalog.documents.length },
      eu: { asOf: index.asOf, retrievedAt: index.retrievedAt, documentCount: index.documents.length, coverage: index.coverage, failures: index.failures, originalCount: index.documents.filter(doc => doc.versionKind === 'original').length, consolidatedCount: index.documents.filter(doc => doc.versionKind === 'consolidated').length },
      screening: getScreeningProviderStatus(),
      verification: 'Versionerade källuttag och kartlagda samband. Ingen automatisk juridisk bedömning eller screeningkontroll har genomförts.',
    };
  }));
}
