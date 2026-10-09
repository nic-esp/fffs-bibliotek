export type Status = 'current' | 'upcoming' | 'repealed' | 'repealing';
export type Kind = 'fi_consolidated' | 'self_consolidated' | 'original';
export interface Amendment { number: string; effectiveFrom?: string | null; sourceUrl?: string | null; pdfUrl?: string | null }
export interface CatalogDocument {
  id: string; number: string; title: string; year: number; status: Status; kind: Kind;
  effectiveFrom?: string | null; repealedOn?: string | null; asOf: string;
  sourceUrl?: string | null; originalPdfUrl?: string | null; pdfUrl?: string | null;
  markdownUrl?: string | null; pageUrl?: string | null; canonicalUrl?: string | null;
  categories?: string[]; institutions?: string[];
  applicability?: { text: string; sourceUrl: string; sectionId?: string; note?: string };
  tagsEvidence?: { tag: string; type: 'category' | 'institution'; evidence: string; sourceUrl: string; sectionId?: string; confidence: 'explicit' | 'editorial' }[]; amendments: Amendment[]; notes: string[];
  textQuality?: string; pageCount?: number;
}
export interface Catalog { asOf: string; documents: CatalogDocument[] }
export interface Section { id: string; title: string; text: string; page?: number }
export interface DocumentContent { id: string; markdown: string; sections: Section[] }
export interface Corpus { asOf: string; documents: DocumentContent[] }
export interface LibraryLoader {
  readonly publicBaseUrl?: string;
  catalog(): Promise<Catalog>;
  corpus(): Promise<Corpus>;
  document(id: string): Promise<DocumentContent>;
}
