import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { validateToolbox } from '../scripts/validate-toolbox.js';

const base = 'https://example.github.io/fffs-bibliotek/';
const id = '02022R2554-20250117';
const sourceUrl = `https://eur-lex.europa.eu/legal-content/SV/TXT/?uri=CELEX:${id}`;
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'toolbox-validation-'));
  const write = async (relative: string, value: string) => { const file = path.join(root, relative); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, value); };
  const json = (relative: string, value: unknown) => write(relative, JSON.stringify(value));
  const html = (route: string, body: string, ld?: object) => `<html><head><title>Toolbox</title><meta name="description" content="Synthetic validation fixture"><link rel="canonical" href="${base}${route}"><link rel="stylesheet" href="${base}assets/app.css"><script src="${base}assets/app.js"></script>${ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : ''}</head><body>${body}</body></html>`;
  const section = { id: 'article-1', kind: 'article', number: '1', title: 'Artikel 1 — Test', text: 'Artikel 1\n\nExakt syntetisk artikeltext.', markdown: 'Artikel 1\n\nExakt syntetisk artikeltext.', sourceUrl: sourceUrl + '#art_1' };
  const markdown = `# Syntetisk EU-text\n\n<a id="article-1"></a>\n\n## Artikel 1 — Test\n\nExakt syntetisk artikeltext.\n`;
  const sourceHtml = '<html lang="sv"><body><p>Exakt syntetisk artikeltext.</p></body></html>';
  const summary = { id, celex: id, baseCelex: '32022R2554', title: 'Syntetisk EU-text', label: 'TEST', language: 'SV', requestedLanguage: 'SV',
    versionKind: 'consolidated', consolidationDate: '2025-01-17', documentDate: '2022-12-14', inForce: true,
    inForceReportedAt: '2026-10-09T12:00:00Z', asOf: '2026-10-09', retrievedAt: '2026-10-09T12:00:00Z', sourceUrl,
    contentSourceUrl: 'https://publications.europa.eu/resource/cellar/example/DOC_1', sourceSha256: createHash('sha256').update(sourceHtml).digest('hex'),
    documentUrl: `data/eu/documents/${id}.json`, markdownUrl: `eu-documents/${id}.md`, sourceHtmlUrl: `data/eu/sources/${id}.html.txt`,
    articleCount: 1, sectionCount: 1, textCharacters: section.text.length, linkedFffs: ['2024-20'], articleTitles: [section.title], notes: ['Synthetic fixture'], versionSelection: 'latest_consolidated_as_of' };
  const doc = { ...summary, markdown, text: section.text, articles: [section], sections: [section] };
  const index = { schemaVersion: 1, asOf: summary.asOf, retrievedAt: summary.retrievedAt, documents: [summary], failures: [],
    coverage: { linkedActCount: 1, importedActCount: 1, missingBaseCelex: [], note: 'Syntetiskt urval' } };
  const corpus = { schemaVersion: 1, asOf: summary.asOf, documents: [{ id, baseCelex: summary.baseCelex, title: summary.title, label: summary.label,
    linkedFffs: summary.linkedFffs, text: doc.text, articles: [{ id: section.id, number: section.number, title: section.title, text: section.text, sourceUrl: section.sourceUrl }] }] };
  const body = `<main data-route="eu-document" data-eu-document="${id}"><button data-save-eu="${id}">Spara</button><a href="#article-1">Artikel 1</a><div class="prose"><a id="article-1"></a><button data-save-eu="${id}" data-article="article-1">Spara artikel</button><p>Exakt syntetisk artikeltext.</p></div><a href="${sourceUrl}">Källa</a><a href="${base}${summary.documentUrl}">JSON</a><a href="${base}${summary.markdownUrl}">Markdown</a></main>`;
  await write(`eu/${id}/index.html`, html(`eu/${id}/`, body, { '@type': 'DigitalDocument', name: summary.title, identifier: id, url: `${base}eu/${id}/`, inLanguage: 'sv', isBasedOn: sourceUrl, dateModified: summary.retrievedAt }));
  for (const [route, marker] of [['verktyg/', 'toolbox'], ['eu/', 'eu'], ['aktorer/', 'actors'], ['underlag/', 'evidence']]) await write(`${route}index.html`, html(route, `<main data-route="${marker}"><a href="${base}eu/${id}/#article-1">Läs</a></main>`));
  await write('assets/app.js', 'export {};'); await write('assets/app.css', 'body {}');
  await json('data/catalog.json', { asOf: summary.asOf, documents: [{ id: '2024-20', euRelations: [{ celex: summary.baseCelex }] }] });
  await json('data/eu/index.json', index); await json('data/eu/search.json', corpus); await json(summary.documentUrl, doc);
  await write(summary.markdownUrl, markdown); await write(summary.sourceHtmlUrl, sourceHtml);
  const binding = (celex: string, date: string) => ({ baseCelex: { value: summary.baseCelex }, date: { value: summary.documentDate }, inForce: { value: 'true' }, versionCelex: { value: celex }, versionDate: { value: date } });
  const metadata = { sourceUrl: 'https://publications.europa.eu/webapi/rdf/sparql', retrievedAt: summary.retrievedAt,
    results: [binding(id, '2025-01-17'), binding('02022R2554-20270101', '2027-01-01')] };
  await json('data/eu/metadata-1.json', metadata);
  await write('sitemap.xml', ['', 'verktyg/', 'aktorer/', 'underlag/', 'eu/', `eu/${id}/`].map(route => `<loc>${base}${route}</loc>`).join('\n'));
  return { root, write, json, doc, index, corpus, metadata, summary,
    options: { distDir: root, siteUrl: base, expectedCount: 1 }, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

test('valid emitted artifact passes and future CELLAR versions do not supersede the snapshot', async () => {
  const f = await fixture(); try {
    const result = await validateToolbox(f.options);
    assert.deepEqual(result.errors, []); assert.equal(result.ok, true); assert.equal(result.htmlCount, 5);
    assert.equal(result.articleCount, 1); assert.equal(result.sectionCount, 1); assert.equal(result.sourceHashesChecked, 1);
  } finally { await f.cleanup(); }
});

test('a missing reader anchor and save-article button fail independently of JSON correctness', async () => {
  const f = await fixture(); try {
    const file = path.join(f.root, `eu/${id}/index.html`);
    await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace('id="article-1"', 'id="missing-article"').replace('data-article="article-1"', 'data-article="wrong"'));
    const result = await validateToolbox(f.options);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('static HTML lacks section anchor article-1')));
    assert.ok(result.errors.some(e => e.includes('save-article button article-1')));
  } finally { await f.cleanup(); }
});

test('tampered corpus text/title and downloadable Markdown are detected', async () => {
  const f = await fixture(); try {
    f.corpus.documents[0].title = 'Fel rättsakt'; f.corpus.documents[0].articles[0].text = 'En annan lydelse';
    await f.json('data/eu/search.json', f.corpus); await f.write(f.summary.markdownUrl, 'Fel utgåva');
    const result = await validateToolbox(f.options);
    assert.ok(result.errors.some(e => e.includes('corpus metadata/text/articles differ')));
    assert.ok(result.errors.some(e => e.includes('downloadable Markdown differs')));
  } finally { await f.cleanup(); }
});

test('mutually copied but invalid future/date/version metadata and wrong source URLs fail', async () => {
  const f = await fixture(); try {
    for (const entry of [f.summary, f.doc]) { entry.consolidationDate = '2027-02-30'; entry.sourceUrl = 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2554'; }
    await f.json('data/eu/index.json', f.index); await f.json(f.summary.documentUrl, f.doc);
    const result = await validateToolbox(f.options);
    assert.ok(result.errors.some(e => e.includes('invalid/future consolidated version')));
    assert.ok(result.errors.some(e => e.includes('exact Swedish CELEX version')));
  } finally { await f.cleanup(); }
});

test('newer eligible saved version, source hash drift, and inaccurate coverage fail', async () => {
  const f = await fixture(); try {
    f.metadata.results.push({ ...f.metadata.results[0], versionCelex: { value: '02022R2554-20260601' }, versionDate: { value: '2026-06-01' } });
    await f.json('data/eu/metadata-1.json', f.metadata); await f.write(f.summary.sourceHtmlUrl, '<html>Altered source</html>');
    f.index.coverage.importedActCount = 2; await f.json('data/eu/index.json', f.index);
    const result = await validateToolbox(f.options);
    assert.ok(result.errors.some(e => e.includes('not latest saved metadata')));
    assert.ok(result.errors.some(e => e.includes('source HTML SHA-256 mismatch')));
    assert.ok(result.errors.some(e => e.includes('coverage counts/sets disagree')));
  } finally { await f.cleanup(); }
});

test('missing toolbox page, nested script URL, incorrect canonical and source JSON link fail', async () => {
  const f = await fixture(); try {
    await fs.unlink(path.join(f.root, 'aktorer/index.html'));
    const file = path.join(f.root, `eu/${id}/index.html`);
    await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace(`${base}assets/app.js`, './assets/app.js')
      .replace(`rel="canonical" href="${base}eu/${id}/"`, 'rel="canonical" href="https://wrong.example/"')
      .replace(`${base}${f.summary.documentUrl}`, `${base}data/eu/not-found.json`));
    const result = await validateToolbox(f.options);
    assert.ok(result.errors.some(e => e.includes('Missing static HTML: aktorer/')));
    assert.ok(result.errors.some(e => e.includes('missing script')));
    assert.ok(result.errors.some(e => e.includes('canonical must equal')));
    assert.ok(result.errors.some(e => e.includes('missing source/JSON/Markdown link')));
  } finally { await f.cleanup(); }
});

test('error cap retains total count and prevents unreadable floods', async () => {
  const f = await fixture(); try {
    for (const route of ['verktyg', 'eu', 'aktorer', 'underlag']) await fs.unlink(path.join(f.root, route, 'index.html'));
    const result = await validateToolbox({ ...f.options, maxErrors: 2 });
    assert.equal(result.errors.length, 2); assert.equal(result.errorCount, 4); assert.equal(result.omittedErrors, 2);
  } finally { await f.cleanup(); }
});

test('raw provider HTML is hashed as text but an executable same-origin copy fails', async () => {
  const f = await fixture(); try {
    await f.write(`data/eu/sources/${id}.html`, '<script>untrustedSource()</script>');
    const result = await validateToolbox(f.options);
    assert.equal(result.sourceHashesChecked, 1);
    assert.ok(result.errors.some(e => e.includes('executable raw source HTML')));
  } finally { await f.cleanup(); }
});
