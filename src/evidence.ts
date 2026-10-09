import { z } from 'zod';

/** Browser-local, explicitly saved research material. No provider payloads or credentials. */
export const EVIDENCE_LIMITS = Object.freeze({ records: 200, title: 300, sourceId: 200, url: 2_048, section: 300, excerpt: 8_000, note: 4_000, version: 200, importChars: 2_000_000 });
export const EVIDENCE_STORAGE_KEY = 'fffs-library:evidence:v1';
export type EvidenceType = 'fffs' | 'eurlex' | 'source' | 'screening-candidate';
export type ReviewDecision = 'unreviewed' | 'relevant' | 'not-relevant';
export interface EvidenceRecord {
  id: string; type: EvidenceType; sourceId: string; title: string; url: string;
  section?: string; excerpt?: string; retrievedAt: string; version?: string; hash?: string;
  note: string; decision: ReviewDecision;
}
export interface EvidenceCase {
  schemaVersion: 1; id: string; title: string; createdAt: string; updatedAt: string; records: EvidenceRecord[];
}
export type EvidenceResult<T> = { ok: true; value: T } | { ok: false; code: 'validation' | 'conflict' | 'consent' | 'storage'; error: string };
export type EvidenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export class EvidenceValidationError extends Error {
  constructor(message: string, readonly code: 'validation' | 'conflict' = 'validation') { super(message); this.name = 'EvidenceValidationError'; }
}

const unsafeControls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/;
const text = (max: number, multiline = false) => z.string().max(max).refine(value => !unsafeControls.test(value), 'Otillåtna kontrolltecken.').transform(value => {
  const normalized = value.replace(/\r\n?/g, '\n').normalize('NFC').trim();
  return multiline ? normalized : normalized.replace(/\s+/g, ' ');
});
const requiredText = (max: number) => text(max).refine(value => value.length > 0, 'Fältet får inte vara tomt.');
const idSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const dateSchema = z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString());

export function normalizeEvidenceUrl(input: string): string {
  if (input.length > EVIDENCE_LIMITS.url || /[\u0000-\u0020\u007F\\]/.test(input)) throw new EvidenceValidationError('Källänken har ogiltiga tecken eller är för lång.');
  let url: URL;
  try { url = new URL(input); } catch { throw new EvidenceValidationError('Källänken måste vara en fullständig HTTPS-adress.'); }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !host.includes('.') || !host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) || /^\d+(?:\.\d+){3}$/.test(host) || /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host)) {
    throw new EvidenceValidationError('Använd en offentlig HTTPS-källa utan inloggningsuppgifter eller lokal adress.');
  }
  for (const key of url.searchParams.keys()) {
    if (/(?:token|secret|password|passwd|credential|signature|authorization|apikey|accesskey|sessionid)/i.test(key.replace(/[^a-z0-9]/gi, ''))) throw new EvidenceValidationError('Källänken får inte innehålla autentiserings- eller sessionsparametrar.');
  }
  let fragment: string;
  try { fragment = decodeURIComponent(url.hash); } catch { throw new EvidenceValidationError('Källänken har ogiltig kodning.'); }
  if (/(?:token|secret|password|credential|signature|authorization|api[_-]?key|session[_-]?id)=/i.test(fragment)) throw new EvidenceValidationError('Källänken får inte innehålla autentiseringsuppgifter i fragmentet.');
  let path: string;
  try { path = decodeURIComponent(url.pathname); } catch { throw new EvidenceValidationError('Källänken har ogiltig kodning.'); }
  if (/\.(?:exe|msi|dmg|pkg|bat|cmd|ps1|sh|js|mjs|cjs|vbs|scr|jar|apk)$/i.test(path)) throw new EvidenceValidationError('Källänken får inte peka på körbara filer.');
  url.hostname = host;
  return url.href;
}

const recordSchema = z.object({
  id: idSchema.optional(), type: z.enum(['fffs', 'eurlex', 'source', 'screening-candidate']),
  sourceId: requiredText(EVIDENCE_LIMITS.sourceId), title: requiredText(EVIDENCE_LIMITS.title),
  url: z.string().max(EVIDENCE_LIMITS.url), section: text(EVIDENCE_LIMITS.section).optional(), excerpt: text(EVIDENCE_LIMITS.excerpt, true).optional(),
  retrievedAt: dateSchema, version: text(EVIDENCE_LIMITS.version).optional(),
  hash: z.string().regex(/^(?:sha256:)?[a-fA-F0-9]{64}$/).transform(value => `sha256:${value.replace(/^sha256:/, '').toLowerCase()}`).optional(),
  note: text(EVIDENCE_LIMITS.note, true).default(''), decision: z.enum(['unreviewed', 'relevant', 'not-relevant']).default('unreviewed'),
}).strict();
const caseSchema = z.object({
  schemaVersion: z.literal(1), id: idSchema, title: requiredText(EVIDENCE_LIMITS.title), createdAt: dateSchema, updatedAt: dateSchema,
  records: z.array(z.unknown()).max(EVIDENCE_LIMITS.records),
}).strict();

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new EvidenceValidationError(`Ogiltigt underlag: ${result.error.issues.slice(0, 3).map(issue => `${issue.path.join('.') || 'objekt'}: ${issue.message}`).join('; ')}`);
  return result.data;
}

// Stable UI identity only; this is not a content-integrity hash. Imported hash is separate.
function stableId(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const char of value) { hash ^= BigInt(char.codePointAt(0)!); hash = BigInt.asUintN(64, hash * 0x100000001b3n); }
  return hash.toString(16).padStart(16, '0');
}
function identity(record: Omit<EvidenceRecord, 'id'> | EvidenceRecord): string {
  return JSON.stringify([record.type, record.sourceId, record.url, record.section ?? '', record.excerpt ?? '', record.version ?? '', record.hash ?? '']);
}

export function normalizeEvidenceRecord(input: unknown): EvidenceRecord {
  const parsed = parse(recordSchema, input);
  const record = { ...parsed, url: normalizeEvidenceUrl(parsed.url) };
  for (const key of ['section', 'excerpt', 'version'] as const) if (record[key] === '') delete record[key];
  return { ...record, id: record.id ?? `ev-${stableId(identity(record))}` };
}

/** Repeated provenance is collapsed only when manual notes/decisions agree. */
export function dedupeEvidenceRecords(input: readonly unknown[]): EvidenceRecord[] {
  if (input.length > EVIDENCE_LIMITS.records) throw new EvidenceValidationError(`Högst ${EVIDENCE_LIMITS.records} poster tillåts.`);
  const byIdentity = new Map<string, EvidenceRecord>(); const byId = new Map<string, string>();
  for (const raw of input) {
    const record = normalizeEvidenceRecord(raw); const key = identity(record); const existing = byIdentity.get(key);
    if (byId.has(record.id) && byId.get(record.id) !== key) throw new EvidenceValidationError('Samma post-id förekommer för olika källunderlag.', 'conflict');
    byId.set(record.id, key);
    if (existing) {
      if (existing.note !== record.note || existing.decision !== record.decision) throw new EvidenceValidationError('Dubbletter har olika anteckningar eller granskningsbeslut. Sammanfoga dem manuellt.', 'conflict');
    } else byIdentity.set(key, record);
  }
  return [...byIdentity.values()];
}

export function normalizeEvidenceCase(input: unknown): EvidenceCase {
  const parsed = parse(caseSchema, input);
  if (parsed.updatedAt < parsed.createdAt) throw new EvidenceValidationError('Ändringsdatum ligger före skapandedatum.');
  const normalized: EvidenceCase = { ...parsed, records: dedupeEvidenceRecords(parsed.records) };
  if (JSON.stringify(normalized, null, 2).length > EVIDENCE_LIMITS.importChars) throw new EvidenceValidationError('Underlaget är för stort.');
  return normalized;
}
export function createEvidenceCase(input: { title: string; now: string; id?: string }): EvidenceCase {
  const now = parse(dateSchema, input.now);
  return normalizeEvidenceCase({ schemaVersion: 1, id: input.id ?? `case-${stableId(`${input.title}\n${now}`)}`, title: input.title, createdAt: now, updatedAt: now, records: [] });
}
function updatedCase(value: EvidenceCase, records: EvidenceRecord[], now: string): EvidenceCase {
  const updatedAt = parse(dateSchema, now);
  if (updatedAt < value.updatedAt) throw new EvidenceValidationError('Ändringen får inte dateras före den senaste ändringen.');
  return normalizeEvidenceCase({ ...value, records, updatedAt });
}
export function addEvidenceRecord(value: EvidenceCase, input: unknown, now: string): EvidenceCase {
  const current = normalizeEvidenceCase(value); const record = normalizeEvidenceRecord(input);
  // A repeated Save click keeps the existing manually reviewed record unchanged.
  const existing = current.records.find(existing => identity(existing) === identity(record));
  if (existing) {
    if ((record.note && record.note !== existing.note) || (record.decision !== 'unreviewed' && record.decision !== existing.decision)) throw new EvidenceValidationError('Posten finns redan med en annan anteckning eller bedömning. Ändra den befintliga posten.', 'conflict');
    return current;
  }
  return updatedCase(current, [...current.records, record], now);
}
export function updateEvidenceRecord(value: EvidenceCase, id: string, patch: { note?: string; decision?: ReviewDecision }, now: string): EvidenceCase {
  const current = normalizeEvidenceCase(value);
  const changes = parse(z.object({ note: text(EVIDENCE_LIMITS.note, true).optional(), decision: z.enum(['unreviewed', 'relevant', 'not-relevant']).optional() }).strict(), patch);
  if (changes.note === undefined) delete changes.note;
  if (changes.decision === undefined) delete changes.decision;
  if (!current.records.some(record => record.id === id)) throw new EvidenceValidationError('Posten finns inte i underlaget.');
  return updatedCase(current, current.records.map(record => record.id === id ? normalizeEvidenceRecord({ ...record, ...changes }) : record), now);
}
export function removeEvidenceRecord(value: EvidenceCase, id: string, now: string): EvidenceCase {
  const current = normalizeEvidenceCase(value);
  if (!current.records.some(record => record.id === id)) throw new EvidenceValidationError('Posten finns inte i underlaget.');
  return updatedCase(current, current.records.filter(record => record.id !== id), now);
}
export function importEvidenceCase(json: string): EvidenceCase {
  if (typeof json !== 'string' || json.length > EVIDENCE_LIMITS.importChars) throw new EvidenceValidationError('Importfilen är för stor eller saknar text.');
  let input: unknown;
  try { input = JSON.parse(json); } catch { throw new EvidenceValidationError('Importfilen är inte giltig JSON.'); }
  return normalizeEvidenceCase(input);
}
export function exportEvidenceJson(value: EvidenceCase): string { return JSON.stringify(normalizeEvidenceCase(value), null, 2); }

function markdownText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_[\]{}()#+.!|~-]/g, '\\$&');
}
export function exportEvidenceMarkdown(value: EvidenceCase): string {
  const current = normalizeEvidenceCase(value);
  const decisions: Record<ReviewDecision, string> = { unreviewed: 'Ej granskad', relevant: 'Relevant', 'not-relevant': 'Ej relevant' };
  const lines = [`# ${markdownText(current.title)}`, '', `Skapad: ${current.createdAt} · Uppdaterad: ${current.updatedAt}`, '', 'Lokalt sammanställt underlag. Granskningsbeslut är användarens bedömningar; screeningkandidater är inte fastställda träffar.', ''];
  for (const record of current.records) {
    const url = record.url.replace(/[<>()\\]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    lines.push(`## ${markdownText(record.title)}`, '', `- Typ: ${record.type}`, `- Käll-id: ${markdownText(record.sourceId)}`, `- Källa: [Öppna källan](<${url}>)`, `- Hämtad: ${record.retrievedAt}`, `- Manuell bedömning: ${decisions[record.decision]}`);
    if (record.section) lines.push(`- Bestämmelse/avsnitt: ${markdownText(record.section)}`);
    if (record.version) lines.push(`- Version: ${markdownText(record.version)}`);
    if (record.hash) lines.push(`- Angivet SHA-256: ${record.hash}`);
    if (record.excerpt) lines.push('', '### Källutdrag', '', ...markdownText(record.excerpt).split('\n').map(line => `> ${line}`));
    if (record.note) lines.push('', '### Användarens anteckning', '', markdownText(record.note));
    lines.push('');
  }
  return lines.join('\n');
}

function failure<T>(error: unknown, fallback: string): EvidenceResult<T> {
  return error instanceof EvidenceValidationError ? { ok: false, code: error.code, error: error.message } : { ok: false, code: 'storage', error: fallback };
}
/** Call only from an explicit Save action. Screening persistence needs its own opt-in. */
export function saveEvidenceCase(storage: EvidenceStorage, value: EvidenceCase, options: { explicit: true; allowScreeningCandidates?: true }): EvidenceResult<EvidenceCase> {
  if (options?.explicit !== true) return { ok: false, code: 'consent', error: 'Lokal lagring kräver en uttrycklig sparåtgärd.' };
  try {
    const current = normalizeEvidenceCase(value);
    if (current.records.some(record => record.type === 'screening-candidate') && options.allowScreeningCandidates !== true) return { ok: false, code: 'consent', error: 'Screeningkandidater kräver ett separat uttryckligt godkännande för lokal lagring.' };
    storage.setItem(EVIDENCE_STORAGE_KEY, exportEvidenceJson(current));
    return { ok: true, value: current };
  } catch (error) { return failure(error, 'Underlaget kunde inte sparas lokalt. Webbläsarens lagring kan vara blockerad eller full.'); }
}
export function loadEvidenceCase(storage: EvidenceStorage): EvidenceResult<EvidenceCase | null> {
  try { const json = storage.getItem(EVIDENCE_STORAGE_KEY); return { ok: true, value: json === null ? null : importEvidenceCase(json) }; }
  catch (error) { return failure(error, 'Underlaget kunde inte läsas från webbläsarens lagring.'); }
}
export function clearEvidenceCase(storage: EvidenceStorage, options: { explicit: true }): EvidenceResult<null> {
  if (options?.explicit !== true) return { ok: false, code: 'consent', error: 'Radering kräver en uttrycklig åtgärd.' };
  try { storage.removeItem(EVIDENCE_STORAGE_KEY); return { ok: true, value: null }; }
  catch (error) { return failure(error, 'Underlaget kunde inte raderas från webbläsarens lagring.'); }
}
