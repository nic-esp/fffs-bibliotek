import assert from 'node:assert/strict';
import test from 'node:test';
import {
  screenOpenSanctions, fetchOpenSanctionsEvidence, getIscanAvailability, getScreeningProviderStatus,
  type ScreeningInput,
} from '../lib/screening.js';

const now = () => new Date('2026-10-09T12:00:00Z');
const input: ScreeningInput = { name: 'Example Company', schema: 'Company', country: 'SE', registrationNumber: '123456-7890' };
const fixture = {
  id: 'fixture-entity', caption: 'Example Company', schema: 'Company', score: 0.91, match: true,
  properties: { name: ['Example Company'], country: ['se'], topics: ['sanction'],
    sourceUrl: ['https://authority.example/notice', 'javascript:alert(1)', 'https://user:password@invalid.example/'] },
  datasets: ['fixture_dataset'], first_seen: '2026-01-02T10:00:00', last_seen: '2026-10-08T11:00:00', last_change: '2026-09-01T12:00:00',
};
const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const matches = (results: unknown[] = [fixture]) => ({ responses: { q: { status: 200, results, total: { value: results.length, relation: 'eq' } } } });
const stub = (body: unknown): typeof fetch => async () => jsonResponse(body);

test('account-free provider status is explicit, unavailable is not a zero-hit search', () => {
  const statuses = getScreeningProviderStatus();
  assert.deepEqual(statuses.map(v => v.provider), ['opensanctions', 'iosco-iscan']);
  assert.ok(statuses.every(v => v.apiEnabled === false && v.manualPortalAvailable));
  assert.equal(getIscanAvailability().code, 'api_access_not_verified');
  assert.equal('candidates' in getIscanAvailability(), false);
  assert.equal(getIscanAvailability().sourceUrl, 'https://www.iosco.org/i-scan/');
});

test('no key or invalid input never makes a network request', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return jsonResponse(matches()); };
  const result = await screenOpenSanctions(input, '', { fetcher, now });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.code, 'key_required');
  for (const invalid of [
    { ...input, name: '' }, { ...input, name: 'a'.repeat(385) }, { ...input, country: 'Sweden' },
    { ...input, schema: 'Person' }, { ...input, schema: 'Anything' }, { ...input, endpoint: 'https://other.example/' },
    { ...input, name: 'Name\nInjected' },
  ]) {
    const rejected = await screenOpenSanctions(invalid as ScreeningInput, 'test-key', { fetcher });
    assert.equal(rejected.status, 'error');
    assert.equal(rejected.code, 'invalid_input');
  }
  assert.equal(calls, 0);
});

test('one bounded official match POST preserves limited fields and returns unconfirmed candidates', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.opensanctions.org/match/default?limit=10');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'ApiKey test-key');
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.redirect, 'error');
    assert.deepEqual(JSON.parse(String(init?.body)), { queries: { q: { schema: 'Company', properties: {
      name: ['Example Company'], country: ['se'], registrationNumber: ['123456-7890'],
    } } } });
    return jsonResponse(matches());
  };
  const result = await screenOpenSanctions(input, 'test-key', { fetcher, now });
  assert.equal(calls, 1);
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.equal(result.checkedAt, '2026-10-09T12:00:00.000Z');
  assert.equal(result.query.country, 'se');
  assert.equal(result.candidates[0].identityStatus, 'unconfirmed');
  assert.equal(result.candidates[0].providerMatch, true);
  assert.equal(result.candidates[0].evidenceStatus, 'not_requested');
  assert.deepEqual(result.candidates[0].evidence, []);
  assert.deepEqual(result.candidates[0].sourceUrls, ['https://authority.example/notice']);
  assert.ok(!JSON.stringify(result).includes('test-key'));
});

test('zero candidates keep the limited-coverage notice; errors do not look like no matches', async () => {
  const result = await screenOpenSanctions({ name: 'Example Person', schema: 'Person' }, 'test-key', { fetcher: stub(matches([])) });
  assert.equal(result.status, 'ok');
  if (result.status === 'ok') {
    assert.deepEqual(result.candidates, []);
    assert.match(result.notice, /Ingen träff är inte/);
  }
  for (const bad of [{}, { responses: { q: { results: [] } } }, matches([{}]),
    { responses: { q: { status: 429, results: [], total: { value: 0 } } } },
    { responses: { q: { results: [fixture], total: { value: 0 } } } },
  ]) {
    const invalid = await screenOpenSanctions(input, 'test-key', { fetcher: stub(bad) });
    assert.equal(invalid.status, 'error');
    assert.equal(invalid.code, 'invalid_response');
  }
});

test('HTTP error bodies and thrown messages cannot leak credentials and are never retried', async () => {
  for (const [status, expected] of [[401, 'invalid_key'], [403, 'invalid_key'], [402, 'credits_required'], [429, 'rate_limited'], [500, 'provider_error']] as const) {
    let calls = 0;
    const fetcher: typeof fetch = async () => { calls++; return jsonResponse({ detail: 'private-key-in-echo' }, status); };
    const result = await screenOpenSanctions(input, 'private-key-in-echo', { fetcher });
    assert.equal(calls, 1);
    assert.equal(result.status, 'error');
    assert.equal(result.code, expected);
    assert.ok(!JSON.stringify(result).includes('private-key-in-echo'));
  }
  const result = await screenOpenSanctions(input, 'private-key-in-exception', {
    fetcher: async () => { throw new Error('private-key-in-exception'); },
  });
  assert.equal(result.status, 'error');
  assert.ok(!JSON.stringify(result).includes('private-key-in-exception'));
});

test('malformed JSON and oversized response cannot be treated as an empty search', async () => {
  for (const fetcher of [
    async () => new Response('not JSON'),
    async () => new Response(' '.repeat(2 * 1024 * 1024 + 1)),
    async () => new Response('{}', { headers: { 'Content-Length': '999999999' } }),
  ]) {
    const result = await screenOpenSanctions(input, 'test-key', { fetcher });
    assert.equal(result.status, 'error');
    assert.equal(result.code, 'invalid_response');
  }
});

test('cancelled and malformed key requests do not call provider', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return jsonResponse(matches()); };
  const result = await screenOpenSanctions(input, 'test-key', { fetcher, signal: controller.signal });
  if (result.status !== 'ok') assert.equal(result.code, 'cancelled');
  const invalid = await screenOpenSanctions(input, 'key\r\nInjected: value', { fetcher });
  if (invalid.status !== 'ok') assert.equal(invalid.code, 'invalid_key');
  assert.equal(calls, 0);
});

test('detail evidence preserves issuer and date meanings without assigning related entities sanctions', async () => {
  const sanction = { id: 'fixture-sanction', schema: 'Sanction', properties: {
    authority: ['Example Issuer'], country: ['se'], listingDate: ['2026-01-05'], startDate: ['2026-02-01'], endDate: ['2027'],
    program: ['Example Program'], programId: ['EXAMPLE'], sourceUrl: ['https://authority.example/designation'], status: ['Active'],
  } };
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.opensanctions.org/entities/fixture-entity');
    assert.equal(init?.method, 'GET');
    return jsonResponse({ ...fixture, properties: { ...fixture.properties,
      sanctions: [sanction], ownershipOwner: [{ id: 'other-entity', schema: 'Company', properties: {
        sanctions: [{ ...sanction, id: 'not-this-entity-sanction' }],
      } }],
    } });
  };
  const result = await fetchOpenSanctionsEvidence('fixture-entity', 'test-key', { fetcher });
  assert.equal(calls, 1);
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  const [evidence] = result.candidate.evidence;
  assert.equal(result.candidate.evidence.length, 1);
  assert.equal(result.candidate.evidenceStatus, 'available');
  assert.deepEqual(evidence.issuers, ['Example Issuer']);
  assert.deepEqual(evidence.listingDates, ['2026-01-05']);
  assert.deepEqual(evidence.startDates, ['2026-02-01']);
  assert.deepEqual(evidence.endDates, ['2027']);
  assert.deepEqual(evidence.sourceUrls, ['https://authority.example/designation']);
  assert.ok(!JSON.stringify(evidence).includes('2026-01-02T10:00:00'));
});

test('detail lookup reports missing evidence explicitly and rejects path injection', async () => {
  const result = await fetchOpenSanctionsEvidence('fixture-entity', 'test-key', { fetcher: stub(fixture) });
  assert.equal(result.status, 'ok');
  if (result.status === 'ok') assert.equal(result.candidate.evidenceStatus, 'not_returned');
  let calls = 0;
  for (const id of ['../../other', 'https://other.example', 'fixture?id=anything', '']) {
    const rejected = await fetchOpenSanctionsEvidence(id, 'test-key', { fetcher: async () => { calls++; return jsonResponse(fixture); } });
    assert.equal(rejected.status, 'error');
  }
  assert.equal(calls, 0);
});
