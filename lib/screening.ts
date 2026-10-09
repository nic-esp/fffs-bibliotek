/** Server-side provider adapter. No persistence, logging, retries or browser key storage. */
export type ScreeningInput = {
  name: string;
  schema: 'Person' | 'Company' | 'Organization';
  /** General country association, ISO alpha-2; not inferred citizenship/jurisdiction. */
  country?: string;
  registrationNumber?: string;
};

export type ScreeningOptions = {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  now?: () => Date;
};

export type ScreeningEvidence = {
  entityId: string;
  kind: 'sanction';
  issuers: string[];
  countries: string[];
  listingDates: string[];
  startDates: string[];
  endDates: string[];
  dates: string[];
  programs: string[];
  programIds: string[];
  sourceUrls: string[];
  statuses: string[];
};

export type ScreeningCandidate = {
  id: string;
  name: string;
  schema: string;
  score: number | null;
  /** The provider's score-threshold flag, never an identity determination. */
  providerMatch: boolean | null;
  identityStatus: 'unconfirmed';
  topics: string[];
  countries: string[];
  datasets: string[];
  sourceUrls: string[];
  profileUrl: string;
  firstSeen: string | null;
  lastSeen: string | null;
  lastChange: string | null;
  evidence: ScreeningEvidence[];
  evidenceStatus: 'available' | 'not_requested' | 'not_returned';
  evidenceTruncated: boolean;
};

export type ScreeningFailure = {
  status: 'error' | 'unavailable';
  provider: 'opensanctions';
  checkedAt: string;
  code: 'key_required' | 'invalid_input' | 'invalid_key' | 'credits_required' | 'rate_limited'
    | 'provider_error' | 'invalid_response' | 'cancelled' | 'timeout' | 'network_error';
  message: string;
  sourceUrl: string;
};

export type ScreeningResult = ScreeningFailure | {
  status: 'ok';
  provider: 'opensanctions';
  checkedAt: string;
  query: ScreeningInput;
  candidates: ScreeningCandidate[];
  total: { value: number; relation: string };
  notice: string;
  sourceUrl: string;
};

export type ScreeningEvidenceResult = ScreeningFailure | {
  status: 'ok';
  provider: 'opensanctions';
  checkedAt: string;
  candidate: ScreeningCandidate;
  notice: string;
  sourceUrl: string;
};

export type ScreeningProviderStatus = {
  provider: 'opensanctions' | 'iosco-iscan';
  status: 'unavailable';
  code: 'key_required' | 'api_access_not_verified';
  message: string;
  sourceUrl: string;
  documentationUrl: string;
  termsUrl: string;
  manualPortalAvailable: true;
  apiEnabled: false;
  verifiedOn: string;
};

const API_ORIGIN = 'https://api.opensanctions.org';
const DOCS_URL = 'https://www.opensanctions.org/docs/api/matching/';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
export const SCREENING_NOTICE = 'Resultaten är möjliga kandidater, inte bekräftade identiteter eller beslut. '
  + 'Ingen träff är inte ett besked om att personen eller företaget är riskfritt. '
  + 'Granska identifierare och ursprungskällor innan en bedömning görs.';

/** Account-free UI/MCP status only: this function performs no network request. */
export function getScreeningProviderStatus(): ScreeningProviderStatus[] {
  return [{
    provider: 'opensanctions', status: 'unavailable', code: 'key_required',
    message: 'Manuell sökning finns. API-screening är inte aktiverad och kräver en egen OpenSanctions-nyckel och tillämpliga användningsvillkor.',
    sourceUrl: 'https://www.opensanctions.org/search/', documentationUrl: DOCS_URL,
    termsUrl: 'https://www.opensanctions.org/docs/terms/api/202609/',
    manualPortalAvailable: true, apiEnabled: false, verifiedOn: '2026-10-09',
  }, getIscanAvailability()];
}

/** Do not return a fabricated empty result set when API access is unverified. */
export function getIscanAvailability(): ScreeningProviderStatus {
  return {
    provider: 'iosco-iscan', status: 'unavailable', code: 'api_access_not_verified',
    message: 'IOSCO:s I-SCAN-portal kan användas manuellt. API-villkoren förutsätter ett undertecknat avtal och nämner API-credentials. Behörig API-åtkomst och endpoint är inte etablerade här; ingen automatisk sökning utförs.',
    sourceUrl: 'https://www.iosco.org/i-scan/', documentationUrl: 'https://www.iosco.org/i-scan/',
    termsUrl: 'https://www.iosco.org/i-scan/IOSCO_I-SCAN_API_Terms_of_Use_Agreement.pdf',
    manualPortalAvailable: true, apiEnabled: false, verifiedOn: '2026-10-09',
  };
}

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value);
const timestamp = (options: ScreeningOptions) => (options.now?.() ?? new Date()).toISOString();
const strings = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 4096))].slice(0, 100)
  : [];
const nullableString = (value: unknown): string | null => typeof value === 'string' && value.length <= 2048 ? value : null;
const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value);

function safeUrls(value: unknown): string[] {
  return strings(value).filter(url => {
    try {
      const parsed = new URL(url);
      return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
    } catch { return false; }
  });
}

function failure(code: ScreeningFailure['code'], options: ScreeningOptions): ScreeningFailure {
  const messages: Record<ScreeningFailure['code'], string> = {
    key_required: 'API-screening kräver en egen OpenSanctions-nyckel. Inget anrop har gjorts.',
    invalid_input: 'Ange ett namn (högst 384 tecken), en tillåten entitetstyp och vid behov landskod med två bokstäver eller företagsnummer (högst 64 tecken).',
    invalid_key: 'OpenSanctions godkände inte API-nyckeln eller åtkomsten.',
    credits_required: 'OpenSanctions kräver tillgängliga API-krediter för anropet.',
    rate_limited: 'OpenSanctions begränsar anropsfrekvensen. Inget automatiskt nytt försök görs.',
    provider_error: 'OpenSanctions kunde inte behandla anropet. Inget automatiskt nytt försök görs.',
    invalid_response: 'OpenSanctions returnerade ett oväntat eller för stort svar. Det kan inte tolkas som en genomförd sökning.',
    cancelled: 'Anropet avbröts. Ingen screeningbedömning finns.',
    timeout: 'OpenSanctions svarade inte inom tidsgränsen. Ingen screeningbedömning finns.',
    network_error: 'OpenSanctions kunde inte nås. Ingen screeningbedömning finns.',
  };
  return { status: code === 'key_required' ? 'unavailable' : 'error', provider: 'opensanctions',
    checkedAt: timestamp(options), code, message: messages[code], sourceUrl: DOCS_URL };
}

function cleanInput(value: unknown): ScreeningInput | null {
  if (!object(value) || Object.keys(value).some(k => !['name', 'schema', 'country', 'registrationNumber'].includes(k))) return null;
  if (typeof value.name !== 'string' || !['Person', 'Company', 'Organization'].includes(String(value.schema))) return null;
  const name = value.name.trim();
  if (!name || name.length > 384 || /[\u0000-\u001f\u007f]/.test(name)) return null;
  const input: ScreeningInput = { name, schema: value.schema as ScreeningInput['schema'] };
  if (value.country !== undefined) {
    if (typeof value.country !== 'string' || !/^[a-z]{2}$/i.test(value.country)) return null;
    input.country = value.country.toLowerCase();
  }
  if (value.registrationNumber !== undefined) {
    if (input.schema === 'Person' || typeof value.registrationNumber !== 'string') return null;
    const number = value.registrationNumber.trim();
    if (!number || number.length > 64 || /[\u0000-\u001f\u007f]/.test(number)) return null;
    input.registrationNumber = number;
  }
  return input;
}

function sanctionEvidence(properties: ObjectValue): ScreeningEvidence[] {
  if (!Array.isArray(properties.sanctions)) return [];
  // Only direct sanctions of this entity; do not assign an owner's/associate's sanctions to it.
  return properties.sanctions.filter(object).filter(item => item.schema === 'Sanction' && validId(item.id) && object(item.properties)).slice(0, 100).map(item => {
    const p = item.properties as ObjectValue;
    return { entityId: item.id as string, kind: 'sanction', issuers: strings(p.authority), countries: strings(p.country),
      listingDates: strings(p.listingDate), startDates: strings(p.startDate), endDates: strings(p.endDate), dates: strings(p.date),
      programs: strings(p.program), programIds: strings(p.programId), sourceUrls: safeUrls(p.sourceUrl), statuses: strings(p.status) };
  });
}

function candidate(value: unknown, detailed: boolean): ScreeningCandidate | null {
  if (!object(value) || !validId(value.id) || typeof value.schema !== 'string' || !value.schema || !object(value.properties)) return null;
  const p = value.properties;
  const name = nullableString(value.caption) || strings(p.name)[0];
  if (!name) return null;
  const evidence = sanctionEvidence(p);
  return { id: value.id, name, schema: value.schema, score: typeof value.score === 'number' && Number.isFinite(value.score) ? value.score : null,
    providerMatch: typeof value.match === 'boolean' ? value.match : null, identityStatus: 'unconfirmed',
    topics: strings(p.topics), countries: strings(p.country), datasets: strings(value.datasets), sourceUrls: safeUrls(p.sourceUrl),
    profileUrl: `https://www.opensanctions.org/entities/${encodeURIComponent(value.id)}/`,
    firstSeen: nullableString(value.first_seen), lastSeen: nullableString(value.last_seen), lastChange: nullableString(value.last_change),
    evidence, evidenceStatus: evidence.length ? 'available' : detailed ? 'not_returned' : 'not_requested',
    evidenceTruncated: Array.isArray(p.sanctions) && p.sanctions.length > 100 };
}

async function boundedJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES || !response.body) throw new Error('invalid_response');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error('invalid_response'); }
      body += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } finally { reader.releaseLock(); }
}

async function request(path: string, apiKey: string, options: ScreeningOptions, body?: unknown): Promise<{ data: unknown } | ScreeningFailure> {
  if (typeof apiKey !== 'string' || !apiKey.trim()) return failure('key_required', options);
  if (apiKey.length > 2048 || /[\u0000-\u0020\u007f]/.test(apiKey)) return failure('invalid_key', options);
  if (options.signal?.aborted) return failure('cancelled', options);
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);
  try {
    const response = await (options.fetcher ?? fetch)(API_ORIGIN + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `ApiKey ${apiKey}`, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
      redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
    });
    if (!response.ok) {
      // Do not read/return provider error bodies, which may echo names or credentials.
      await response.body?.cancel();
      return failure(response.status === 401 || response.status === 403 ? 'invalid_key'
        : response.status === 402 ? 'credits_required' : response.status === 429 ? 'rate_limited' : 'provider_error', options);
    }
    try { return { data: await boundedJson(response) }; }
    catch { return failure(timedOut ? 'timeout' : options.signal?.aborted ? 'cancelled' : 'invalid_response', options); }
  } catch {
    // Exception messages are intentionally not exposed, logged or persisted.
    return failure(timedOut ? 'timeout' : options.signal?.aborted ? 'cancelled' : 'network_error', options);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}

/** One explicit screening request; caller supplies its own key out of band. */
export async function screenOpenSanctions(input: ScreeningInput, apiKey: string, options: ScreeningOptions = {}): Promise<ScreeningResult> {
  const query = cleanInput(input);
  if (!query) return failure('invalid_input', options);
  const properties: Record<string, string[]> = { name: [query.name] };
  if (query.country) properties.country = [query.country];
  if (query.registrationNumber) properties.registrationNumber = [query.registrationNumber];
  const result = await request('/match/default?limit=10', apiKey, options, { queries: { q: { schema: query.schema, properties } } });
  if (!('data' in result)) return result;
  const root = result.data;
  const response = object(root) && object(root.responses) ? root.responses.q : null;
  if (!object(response) || (response.status !== undefined && response.status !== 200)
    || !Array.isArray(response.results) || response.results.length > 10 || !object(response.total)
    || !Number.isSafeInteger(response.total.value) || Number(response.total.value) < response.results.length
    || (response.total.relation !== undefined && !['eq', 'gte'].includes(String(response.total.relation)))) return failure('invalid_response', options);
  const candidates = response.results.map(value => candidate(value, false));
  if (candidates.some(value => value === null)) return failure('invalid_response', options);
  return { status: 'ok', provider: 'opensanctions', checkedAt: timestamp(options), query, candidates: candidates as ScreeningCandidate[],
    total: { value: response.total.value as number, relation: String(response.total.relation ?? 'eq') }, notice: SCREENING_NOTICE, sourceUrl: DOCS_URL };
}

/** Optional separate, explicit detail lookup; never invoked automatically by screening. */
export async function fetchOpenSanctionsEvidence(entityId: string, apiKey: string, options: ScreeningOptions = {}): Promise<ScreeningEvidenceResult> {
  if (!validId(entityId)) return failure('invalid_input', options);
  const sourceUrl = 'https://www.opensanctions.org/docs/api/entities/';
  const result = await request(`/entities/${encodeURIComponent(entityId)}`, apiKey, options);
  if (!('data' in result)) return result;
  const entity = candidate(result.data, true);
  if (!entity) return failure('invalid_response', options);
  return { status: 'ok', provider: 'opensanctions', checkedAt: timestamp(options), candidate: entity, notice: SCREENING_NOTICE, sourceUrl };
}
