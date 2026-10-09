import test from 'node:test';
import assert from 'node:assert/strict';
import { marked } from 'marked';
import {
  EVIDENCE_LIMITS, EVIDENCE_STORAGE_KEY, EvidenceValidationError,
  addEvidenceRecord, clearEvidenceCase, createEvidenceCase, dedupeEvidenceRecords,
  exportEvidenceJson, exportEvidenceMarkdown, importEvidenceCase, loadEvidenceCase,
  normalizeEvidenceRecord, normalizeEvidenceUrl, removeEvidenceRecord,
  saveEvidenceCase, updateEvidenceRecord, type EvidenceStorage,
} from '../src/evidence.js';

const now = '2026-10-09T12:00:00.000Z';
const later = '2026-10-09T13:00:00.000Z';
const rawRecord = {
  type: 'fffs', sourceId: 'FFFS 2014:4', title: 'Hantering av operativa risker',
  url: 'https://www.fi.se/sv/vara-register/fffs/sok-fffs/2014/20144/',
  section: '2 kap. 1 §', excerpt: 'Ett företag ska hantera sina operativa risker.', retrievedAt: now, version: '2026-10-09',
};
const newCase = () => createEvidenceCase({ title: '  Granskningsunderlag  ', now });
function memoryStorage() {
  const values = new Map<string, string>(); let writes = 0;
  const storage: EvidenceStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { writes++; values.set(key, value); },
    removeItem: key => { values.delete(key); },
  };
  return { storage, values, writes: () => writes };
}

test('normalization is deterministic, preserves provenance and supports all four evidence types', () => {
  const record = normalizeEvidenceRecord({ ...rawRecord, title: '  Hantering\n av risker  ', retrievedAt: '2026-10-09T14:00:00+02:00', hash: 'A'.repeat(64), note: 'a\r\nb' });
  assert.equal(record.title, 'Hantering av risker'); assert.equal(record.retrievedAt, now);
  assert.equal(record.hash, `sha256:${'a'.repeat(64)}`); assert.equal(record.note, 'a\nb');
  assert.equal(record.decision, 'unreviewed'); assert.match(record.id, /^ev-[a-f0-9]{16}$/);
  assert.deepEqual(normalizeEvidenceRecord(record), record);
  assert.equal(normalizeEvidenceRecord(rawRecord).id, normalizeEvidenceRecord({ ...rawRecord, retrievedAt: later }).id);
  for (const type of ['fffs', 'eurlex', 'source', 'screening-candidate']) assert.equal(normalizeEvidenceRecord({ ...rawRecord, type }).type, type);
  assert.equal(newCase().title, 'Granskningsunderlag'); assert.equal(newCase().schemaVersion, 1);
  assert.equal(rawRecord.title, 'Hantering av operativa risker');
});

test('source URLs reject executable schemes, local destinations, credentials and executable downloads', () => {
  const unsafe = [
    'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///tmp/x',
    'http://www.fi.se/fffs', 'https://user:password@www.fi.se/', 'https://localhost/',
    'https://127.0.0.1/', 'https://2130706433/', 'https://[::1]/', 'https://service.internal/', 'https://localhost./', 'https://service.internal./',
    'https://www.fi.se:8443/', 'https://www.fi.se/a\\b', 'https://www.fi.se/\nscript',
    'https://www.fi.se/?api_key=secret', 'https://www.fi.se/?X-Amz-Signature=secret',
    'https://www.fi.se/#access_token=secret', 'https://www.fi.se/#%61ccess_token=secret', 'https://www.fi.se/file.EXE',
    'https://www.fi.se/file.%6djs', 'https://www.fi.se/%zz',
  ];
  for (const url of unsafe) assert.throws(() => normalizeEvidenceUrl(url), EvidenceValidationError, url);
  assert.equal(normalizeEvidenceUrl('https://WWW.FI.SE:443/fffs.pdf#page=5'), 'https://www.fi.se/fffs.pdf#page=5');
  assert.equal(normalizeEvidenceUrl('https://www.fi.se./'), 'https://www.fi.se/');
  const eurlex = 'https://eur-lex.europa.eu/legal-content/SV/TXT/?uri=CELEX%3A32022R2554';
  assert.equal(normalizeEvidenceUrl(eurlex), eurlex);
});

test('strict import rejects unknown fields, raw provider data, invalid dates and oversized content', () => {
  for (const input of [
    { ...rawRecord, apiKey: 'never-store' }, { ...rawRecord, rawProvider: { anything: 'private' } },
    { ...rawRecord, decision: 'confirmed-match' }, { ...rawRecord, retrievedAt: '2026-02-30T12:00:00Z' },
    { ...rawRecord, hash: 'not-a-hash' }, { ...rawRecord, title: 'x\u0000y' },
    { ...rawRecord, excerpt: 'x'.repeat(EVIDENCE_LIMITS.excerpt + 1) },
    { ...rawRecord, note: 'x'.repeat(EVIDENCE_LIMITS.note + 1) },
  ]) assert.throws(() => normalizeEvidenceRecord(input), EvidenceValidationError);
  const evidence = newCase();
  for (const input of [
    { ...evidence, schemaVersion: 2 }, { ...evidence, providerCredentials: {} },
    { ...evidence, updatedAt: '2026-10-08T12:00:00.000Z' },
    { ...evidence, records: Array.from({ length: EVIDENCE_LIMITS.records + 1 }, () => rawRecord) },
  ]) assert.throws(() => importEvidenceCase(JSON.stringify(input)), EvidenceValidationError);
  assert.throws(() => importEvidenceCase('{'), /JSON/);
  assert.throws(() => importEvidenceCase(' '.repeat(EVIDENCE_LIMITS.importChars + 1)), /stor/);
  assert.throws(() => importEvidenceCase(JSON.stringify({ ...evidence, records: Array.from({ length: 190 }, (_, index) => ({ ...rawRecord, sourceId: String(index), excerpt: 'a'.repeat(8_000), note: 'b'.repeat(4_000) })) })), /stor/);
  assert.throws(() => importEvidenceCase(exportEvidenceJson(evidence).replace('"schemaVersion": 1', '"__proto__": {}, "schemaVersion": 1')), EvidenceValidationError);
});

test('deduplication preserves distinct passages and versions and refuses conflicting manual reviews', () => {
  const first = normalizeEvidenceRecord(rawRecord);
  assert.equal(dedupeEvidenceRecords([first, { ...first, id: 'second-id', retrievedAt: later }]).length, 1);
  assert.equal(dedupeEvidenceRecords([first, { ...rawRecord, excerpt: 'Annan bestämmelse.' }, { ...rawRecord, version: '2025-01-01' }]).length, 3);
  assert.throws(() => dedupeEvidenceRecords([first, { ...first, note: 'Annan anteckning' }]), error => error instanceof EvidenceValidationError && error.code === 'conflict');
  assert.throws(() => dedupeEvidenceRecords([first, { ...first, decision: 'relevant' }]), /granskningsbeslut/);
  assert.throws(() => dedupeEvidenceRecords([first, { ...first, excerpt: 'Olika källa med samma id' }]), /post-id/);
});

test('case edits are immutable and a repeated Save never erases existing manual decisions', () => {
  const empty = newCase(); const added = addEvidenceRecord(empty, rawRecord, now);
  assert.equal(empty.records.length, 0); assert.equal(added.records.length, 1);
  const reviewed = updateEvidenceRecord(added, added.records[0].id, { note: 'Granskad mot PDF', decision: 'relevant' }, later);
  assert.equal(added.records[0].decision, 'unreviewed'); assert.equal(reviewed.updatedAt, later);
  assert.deepEqual(addEvidenceRecord(reviewed, { ...rawRecord, retrievedAt: later }, later), reviewed);
  assert.deepEqual(updateEvidenceRecord(reviewed, reviewed.records[0].id, { note: undefined, decision: undefined }, later), reviewed);
  assert.throws(() => addEvidenceRecord(reviewed, { ...rawRecord, note: 'Motstridig anteckning' }, later), /annan anteckning/);
  assert.throws(() => updateEvidenceRecord(reviewed, 'missing', { note: 'x' }, later), /finns inte/);
  assert.throws(() => updateEvidenceRecord(reviewed, reviewed.records[0].id, { note: 'x' }, now), /senaste/);
  assert.throws(() => updateEvidenceRecord(reviewed, reviewed.records[0].id, { url: 'https://www.fi.se/' } as any, later), /Ogiltigt/);
  assert.equal(removeEvidenceRecord(reviewed, reviewed.records[0].id, later).records.length, 0);
  assert.equal(reviewed.records.length, 1);
});

test('JSON round-trips every allowed field and Markdown quotes evidence without HTML/script links', async () => {
  let evidence = addEvidenceRecord(newCase(), {
    ...rawRecord, title: '<img src=x onerror=alert(1)> [name]',
    excerpt: '<script>alert(1)</script>\n# Fake heading\n[click](javascript:alert(1))',
    hash: 'b'.repeat(64), url: 'https://www.fi.se/path(1)?q=%3Cscript%3E',
  }, now);
  evidence = updateEvidenceRecord(evidence, evidence.records[0].id, { note: '**Note** <iframe src=x>', decision: 'not-relevant' }, later);
  assert.deepEqual(importEvidenceCase(exportEvidenceJson(evidence)), evidence);
  const markdown = exportEvidenceMarkdown(evidence); const html = await marked.parse(markdown);
  assert.ok(markdown.includes('Manuell bedömning: Ej relevant'));
  assert.ok(markdown.includes('Källutdrag')); assert.ok(markdown.includes('Användarens anteckning'));
  assert.ok(markdown.includes('2026-10-09T12:00:00.000Z')); assert.ok(markdown.includes('Angivet SHA-256'));
  assert.doesNotMatch(html, /<script|<iframe|<img|href="javascript:/i);
  assert.ok(html.includes('https://www.fi.se/path%281%29?q=%3Cscript%3E'));
});

test('storage never writes without explicit consent and screening requires separate approval', () => {
  const memory = memoryStorage();
  const regular = addEvidenceRecord(newCase(), rawRecord, now);
  assert.equal(memory.writes(), 0); assert.deepEqual(loadEvidenceCase(memory.storage), { ok: true, value: null });
  const denied = saveEvidenceCase(memory.storage, regular, {} as any);
  assert.equal(denied.ok, false); assert.equal(memory.writes(), 0);
  assert.deepEqual(saveEvidenceCase(memory.storage, regular, { explicit: true }), { ok: true, value: regular });
  assert.deepEqual(loadEvidenceCase(memory.storage), { ok: true, value: regular });
  const screening = addEvidenceRecord(regular, { ...rawRecord, type: 'screening-candidate', sourceId: 'candidate-123' }, now);
  const blocked = saveEvidenceCase(memory.storage, screening, { explicit: true });
  assert.equal(blocked.ok, false); assert.equal(memory.writes(), 1);
  if (!blocked.ok) assert.equal(blocked.code, 'consent');
  assert.equal(saveEvidenceCase(memory.storage, screening, { explicit: true, allowScreeningCandidates: true }).ok, true);
  assert.equal(memory.writes(), 2);
  assert.equal(clearEvidenceCase(memory.storage, {} as any).ok, false);
  assert.ok(memory.values.has(EVIDENCE_STORAGE_KEY));
  assert.deepEqual(clearEvidenceCase(memory.storage, { explicit: true }), { ok: true, value: null });
  assert.equal(memory.values.has(EVIDENCE_STORAGE_KEY), false);
});

test('storage failures and corrupt imports are explicit and do not overwrite or leak provider errors', () => {
  const blocked: EvidenceStorage = {
    getItem() { throw new Error('private-token=do-not-leak'); },
    setItem() { throw new Error('private-token=do-not-leak'); },
    removeItem() { throw new Error('private-token=do-not-leak'); },
  };
  for (const result of [loadEvidenceCase(blocked), saveEvidenceCase(blocked, newCase(), { explicit: true }), clearEvidenceCase(blocked, { explicit: true })]) {
    assert.equal(result.ok, false);
    if (!result.ok) { assert.equal(result.code, 'storage'); assert.doesNotMatch(result.error, /private-token/); }
  }
  const memory = memoryStorage(); memory.values.set(EVIDENCE_STORAGE_KEY, '{');
  const corrupt = loadEvidenceCase(memory.storage); assert.equal(corrupt.ok, false);
  if (!corrupt.ok) assert.equal(corrupt.code, 'validation');
  assert.equal(memory.values.get(EVIDENCE_STORAGE_KEY), '{'); assert.equal(memory.writes(), 0);
});
