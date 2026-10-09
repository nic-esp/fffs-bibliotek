import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { canonicalId, findSections, MAX_PAGE_CHARS, pageText, searchDocuments } from './search.js';
import type { Catalog, CatalogDocument, LibraryLoader } from './types.js';

const filters = {
  status: z.enum(['current', 'upcoming', 'repealed', 'repealing', 'all']).default('current').describe('Standardvärdet current utesluter upphävda, framtida och rena upphävningsakter.'),
  kind: z.enum(['fi_consolidated', 'self_consolidated', 'original', 'all']).optional(),
  category: z.string().max(100).optional().describe('Exakt kategorietikett från get_library_status.'),
  institution: z.string().max(100).optional().describe('Exakt institutstyp från get_library_status.'),
  year: z.number().int().min(1900).max(2200).optional(),
  limit: z.number().int().min(1).max(50).default(20), offset: z.number().int().min(0).max(10_000).default(0)
};
const id = z.string().max(40).describe('FFFS-nummer eller id, t.ex. FFFS 2014:12 eller 2014-12.');
const paging = { cursor: z.string().max(500).optional(), maxChars: z.number().int().min(2).max(MAX_PAGE_CHARS).default(MAX_PAGE_CHARS) };
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const jsonResult = (value: Record<string, unknown>) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value });
async function guarded(fn: () => Promise<Record<string, unknown>>) { try { return jsonResult(await fn()); } catch (error) { return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : 'Källdatan kunde inte läsas.' }], isError: true }; } }

export function createFffsServer(loader: LibraryLoader) {
  const publicUrl = (value: string | null | undefined) => value && loader.publicBaseUrl ? new URL(value, loader.publicBaseUrl).href : value;
  const withPageUrl = (document: CatalogDocument): CatalogDocument => ({ ...document, pdfUrl: publicUrl(document.pdfUrl), markdownUrl: publicUrl(document.markdownUrl), amendments: document.amendments.map(amendment => ({ ...amendment, pdfUrl: publicUrl(amendment.pdfUrl) })), canonicalUrl: document.canonicalUrl ?? document.pageUrl ?? (loader.publicBaseUrl ? new URL(`fffs/${document.id}/`, loader.publicBaseUrl).href : undefined), pageUrl: document.pageUrl ?? document.canonicalUrl ?? (loader.publicBaseUrl ? new URL(`fffs/${document.id}/`, loader.publicBaseUrl).href : undefined) });
  const getCatalog = async (): Promise<Catalog> => { const catalog = await loader.catalog(); return { ...catalog, documents: catalog.documents.map(withPageUrl) }; };
  const server = new McpServer({ name: 'fffs-library', version: '1.0.0' }, {
    instructions: 'Sökbart FFFS-bibliotek. Alla resultat avser angivet asOf/snapshotdatum. Läs och citera källans kapitel/paragraf, status, versionsdatum och FI-länk. Egenkonsolideringar är inte officiella. notes och textQuality följer varje dokument; inga påståenden om fullständig rättslig verifiering. Framtida lydelser kan ingå med ikraftträdandemarkörer. Dra inga slutsatser om gällande rätt enbart från en träff.'
  });
  async function getDocument(number: string) {
    const catalog = await getCatalog(); const documentId = canonicalId(number);
    const metadata = catalog.documents.find(doc => doc.id === documentId);
    if (!metadata) throw new Error('Författningen finns inte i denna ögonblicksbild.');
    const content = await loader.document(documentId);
    return { asOf: catalog.asOf, document: metadata, content };
  }
  async function documentPage(number: string, cursor?: string, maxChars?: number) {
    const { asOf, document, content } = await getDocument(number);
    const page = pageText(content.markdown, `${document.id}@${asOf}`, cursor, maxChars);
    return { asOf, document, ...page, format: 'markdown', sections: content.sections.map(({ id, title, page }) => ({ id, title, page })), sectionCount: content.sections.length };
  }
  server.registerTool('search_fffs', { description: 'Sök i fulltext och rubriker. Tom sökning ger en lista. Träffar innehåller källor, status, snapshotdatum och kapitel-/paragrafreferens där den finns.', inputSchema: { query: z.string().max(240).default(''), ...filters }, annotations }, args => guarded(async () => searchDocuments(await getCatalog(), await loader.corpus(), args)));
  server.registerTool('list_fffs', { description: 'Lista författningar med status-, år- och typfilter. Som standard endast gällande författningar i snapshoten.', inputSchema: filters, annotations }, args => guarded(async () => { const catalog = await getCatalog(); return searchDocuments(catalog, { asOf: catalog.asOf, documents: [] }, args); }));
  server.registerTool('get_fffs', { description: 'Läs författningens markdown, högst 20 000 tecken per anrop. Följ nextCursor tills den är null. Metadata och sektionsreferenser följer med.', inputSchema: { id, ...paging }, annotations }, args => guarded(() => documentPage(args.id, args.cursor, args.maxChars)));
  server.registerTool('get_section', { description: 'Hämta exakt sektions-id från en träff, eller sök bestämmelse med chapter och paragraph (exempel 2 och 13 a). Referenser inne i andra paragrafer räknas inte som rubrikträffar. Flera daterade lydelser returneras tillsammans; läs ikraftträdandemarkörerna.', inputSchema: { id, sectionId: z.string().max(200).optional(), chapter: z.string().max(30).optional(), paragraph: z.string().max(30).optional(), ...paging }, annotations }, args => guarded(async () => {
    const { asOf, document, content } = await getDocument(args.id);
    const matches = findSections(content, args);
    if (!matches.length) return { asOf, document, matches: [], content: '', nextCursor: null, message: 'Ingen matchande bestämmelserubrik hittades. Använd sökning eller get_fffs; frånvaro i textuttaget bevisar inte att bestämmelsen saknas.' };
    const text = matches.map(section => `## ${section.title}\n\n${section.text}`).join('\n\n');
    return { asOf, document, matches: matches.map(({ id, title, page }) => ({ id, title, page })), matchCount: matches.length, ...pageText(text, `${document.id}@${asOf}#${args.sectionId ?? `${args.chapter ?? ''}/${args.paragraph ?? ''}`}`, args.cursor, args.maxChars) };
  }));
  server.registerTool('get_amendments', { description: 'Lista registrerade ändringar med källor och datum. Markeringen future jämför ikraftträdandedatum med snapshotens asOf, inte med dagens datum. Delvisa ikraftträdanden kräver läsning av källtexten.', inputSchema: { id }, annotations }, args => guarded(async () => {
    const catalog = await getCatalog(); const document = catalog.documents.find(doc => doc.id === canonicalId(args.id));
    if (!document) throw new Error('Författningen finns inte i denna ögonblicksbild.');
    return { asOf: catalog.asOf, document, amendments: document.amendments.map(amendment => ({ ...amendment, future: amendment.effectiveFrom ? amendment.effectiveFrom > catalog.asOf : null })) };
  }));
  server.registerTool('get_library_status', { description: 'Visa snapshotdatum, antal dokument per status och typ samt dokument med kvalitetsnoteringar. Detta är en samlingsöversikt, inte ett intyg om fullständig rättslig verifiering.', inputSchema: {}, annotations }, () => guarded(async () => {
    const catalog = await getCatalog(); const byStatus: Record<string, number> = {}; const byKind: Record<string, number> = {}; const categories: Record<string, number> = {}; const institutions: Record<string, number> = {};
    for (const document of catalog.documents) { byStatus[document.status] = (byStatus[document.status] ?? 0) + 1; byKind[document.kind] = (byKind[document.kind] ?? 0) + 1; for (const tag of new Set(document.categories ?? [])) categories[tag] = (categories[tag] ?? 0) + 1; for (const tag of new Set(document.institutions ?? [])) institutions[tag] = (institutions[tag] ?? 0) + 1; }
    return { asOf: catalog.asOf, documentCount: catalog.documents.length, byStatus, byKind, taxonomies: { categories, institutions }, documentsWithNotes: catalog.documents.filter(doc => doc.notes.length > 0).map(doc => ({ id: doc.id, number: doc.number, status: doc.status, textQuality: doc.textQuality, notes: doc.notes })), verification: 'Snapshot av samlade källor; ingen utfästelse om fullständig rättslig verifiering.' };
  }));
  server.registerResource('fffs-catalog', 'fffs://catalog', { title: 'FFFS-katalog', description: 'Källor och metadata inklusive asOf för hela ögonblicksbilden.', mimeType: 'application/json' }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await getCatalog()) }] }));
  server.registerResource('fffs-document', new ResourceTemplate('fffs://{id}', { list: async () => { const catalog = await getCatalog(); return { resources: catalog.documents.map(document => ({ uri: `fffs://${document.id}`, name: document.number, title: document.title, description: `${document.status}; snapshot ${catalog.asOf}`, mimeType: 'application/json' })) }; } }), { description: 'Dokumentets första textsida med metadata och nextCursor. Fortsätt via get_fffs för längre dokument.', mimeType: 'application/json' }, async (uri, variables) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await documentPage(String(variables.id))) }] }));
  return server;
}
