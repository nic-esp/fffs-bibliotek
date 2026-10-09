import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateBuild } from '../scripts/validate-build';

const base = 'https://example.github.io/fffs-bibliotek/';
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fffs-build-test-'));
  const write = async (relative: string, text: string) => { await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true }); await fs.writeFile(path.join(root, relative), text); };
  const markdown = '<a id="section-0001"></a>\n\n## 1 §\n\nExakt källtext.\n\n![Bild](/fffs-bibliotek/images/test.png)';
  const content = { id: '2014-04', markdown, sections: [{ id: 'section-0001', title: '1 §', text: 'Exakt källtext.' }] };
  const document = { id: '2014-04', number: 'FFFS 2014:4', title: 'Testförfattning', year: 2014, status: 'current', kind: 'original', asOf: '2026-10-09', canonicalUrl: base + 'fffs/2014-04/', pdfUrl: 'pdf/2014-04.pdf', markdownUrl: 'documents/2014-04.md', amendments: [], notes: [] };
  const html = (route: string, body: string, ld?: object) => `<html><head><title>FFFS-bibliotek</title><meta name="description" content="Beskrivning"><link rel="canonical" href="${base}${route}"><link rel="stylesheet" href="/fffs-bibliotek/assets/app.css"><script type="module" src="/fffs-bibliotek/assets/app.js"></script>${ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : ''}</head><body>${body}</body></html>`;
  for (const route of ['', 'mcp/', 'om/']) await write(route + 'index.html', html(route, 'Static page'));
  await write('fffs/2014-04/index.html', html('fffs/2014-04/', '<main data-document="2014-04">FFFS 2014:4 · 2026-10-09<div class="prose"><a id="section-0001"></a><h2>1 §</h2>Exakt källtext.<img src="/fffs-bibliotek/images/test.png"></div><a href="/fffs-bibliotek/pdf/2014-04.pdf">PDF</a></main>', { '@type': 'DigitalDocument', identifier: document.number, url: document.canonicalUrl }));
  await write('data/catalog.json', JSON.stringify({ asOf: document.asOf, documents: [document] }));
  await write('data/search.json', JSON.stringify({ asOf: document.asOf, documents: [content] }));
  await write('data/documents/2014-04.json', JSON.stringify(content));
  await write('documents/2014-04.md', markdown); await write('pdf/2014-04.pdf', '%PDF-1.7\nfixture');
  await write('images/test.png', 'fixture'); await write('assets/app.js', 'export {};'); await write('assets/app.css', 'body {}');
  await write('sitemap.xml', `<loc>${document.canonicalUrl}</loc>`); await write('robots.txt', 'User-agent: *'); await write('llms.txt', '# Library'); await write('.nojekyll', '');
  return { root, write, cleanup: () => fs.rm(root, { recursive: true, force: true }), options: { distDir: root, siteUrl: base, expectedCount: 1 } };
}
test('static validator accepts self-contained generated artifact without network or local audit paths', async () => {
  const f = await fixture(); try { const result = await validateBuild(f.options); assert.deepEqual(result.errors, []); assert.equal(result.ok, true); assert.equal(result.documentCount, 1); assert.equal(result.htmlCount, 4); assert.equal(result.sectionCount, 1); } finally { await f.cleanup(); }
});
test('static validator catches broken nested script/stylesheet URLs and missing section anchors', async () => {
  const f = await fixture(); try {
    const filename = path.join(f.root, 'fffs/2014-04/index.html');
    const html = (await fs.readFile(filename, 'utf8')).replace('/fffs-bibliotek/assets/app.js', './assets/app.js').replace('/fffs-bibliotek/assets/app.css', './assets/app.css').replace('id="section-0001"', 'id="wrong"');
    await fs.writeFile(filename, html); const result = await validateBuild(f.options);
    assert.equal(result.ok, false); assert.ok(result.errors.some(error => error.includes('missing script'))); assert.ok(result.errors.some(error => error.includes('missing stylesheet'))); assert.ok(result.errors.some(error => error.includes('section anchor section-0001')));
  } finally { await f.cleanup(); }
});
test('static validator catches Markdown root-path images and missing PDF downloads', async () => {
  const f = await fixture(); try {
    const jsonPath = path.join(f.root, 'data/documents/2014-04.json'); const doc = JSON.parse(await fs.readFile(jsonPath, 'utf8')); doc.markdown = doc.markdown.replace('/fffs-bibliotek/images/', '/images/');
    await f.write('data/documents/2014-04.json', JSON.stringify(doc)); await f.write('documents/2014-04.md', doc.markdown); await fs.unlink(path.join(f.root, 'pdf/2014-04.pdf'));
    const result = await validateBuild(f.options); assert.ok(result.errors.some(error => error.includes('escapes the Pages base'))); assert.ok(result.errors.some(error => error.includes('PDF download missing'))); assert.ok(result.errors.some(error => error.includes('corpus and document JSON disagree')));
  } finally { await f.cleanup(); }
});
test('static validator catches canonical metadata and downloadable Markdown drift', async () => {
  const f = await fixture(); try {
    const filename = path.join(f.root, 'fffs/2014-04/index.html'); const html = (await fs.readFile(filename, 'utf8')).replace(`<link rel="canonical" href="${base}fffs/2014-04/">`, '<link rel="canonical" href="https://wrong.example/">');
    await fs.writeFile(filename, html); await f.write('documents/2014-04.md', 'wrong edition');
    const result = await validateBuild(f.options); assert.ok(result.errors.some(error => error.includes('canonical must equal'))); assert.ok(result.errors.some(error => error.includes('downloadable Markdown differs')));
  } finally { await f.cleanup(); }
});
