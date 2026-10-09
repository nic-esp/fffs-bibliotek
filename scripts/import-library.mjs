import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Import only reviewed public artifacts, never the workspace or credentials.
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/import-library.mjs /absolute/path/to/source-collection');
const root = path.resolve(source);
const audit = path.join(root, '_granskning_2026-10-09');
const dataRoot = path.join(audit, 'webdata');
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
for (const folder of ['data', 'documents', 'images']) {
  await fs.cp(path.join(dataRoot, folder), path.join('public', folder), { recursive: true });
}
const catalog = await readJson('public/data/catalog.json');
const eu = await readJson(path.join(audit, 'eu-relations.json'));
const mapping = await readJson(path.join(dataRoot, 'source-map.json'));
await fs.mkdir('public/pdf', { recursive: true });
const manifest = [];
for (const document of catalog.documents) {
  const item = mapping.documents.find(row => row.id === document.id);
  if (!item || !Object.hasOwn(eu, document.id)) throw new Error(`Incomplete import: ${document.id}`);
  const pdf = await fs.readFile(path.join(root, item.sourceRelativePath));
  const hash = createHash('sha256').update(pdf).digest('hex');
  if (hash !== item.pdfSha256) throw new Error(`Source PDF changed after text extraction: ${document.id}`);
  await fs.writeFile(path.join('public', document.pdfUrl), pdf);
  document.euRelations = eu[document.id];
  const contentPath = `public/data/documents/${document.id}.json`;
  const content = await readJson(contentPath);
  // Both the document API and catalog carry the same complete metadata.
  content.metadata = document;
  await fs.writeFile(contentPath, JSON.stringify(content, null, 2) + '\n');
  manifest.push({ id: document.id, sourceUrl: document.sourceUrl, originalPdfUrl: document.originalPdfUrl,
    pdfUrl: document.pdfUrl, pdfSha256: hash, pdfBytes: pdf.length,
    markdownSha256: createHash('sha256').update(content.markdown).digest('hex'),
    kind: document.kind, status: document.status, asOf: catalog.asOf });
}
await fs.writeFile('public/data/catalog.json', JSON.stringify(catalog, null, 2) + '\n');
await fs.writeFile('public/data/provenance.json', JSON.stringify({ asOf: catalog.asOf, documents: manifest }, null, 2) + '\n');
await fs.mkdir('provenance', { recursive: true });
for (const name of ['register.md', 'fi_konsolideringar.md', 'egenkonsolideringar.md', 'rattning_egenkonsolideringar.md', 'eu-relations-report.md', 'eu-relations-summary.json', 'eu-relations-validation.json', 'bilagemanifest.json', 'rattning_verifiering.json']) {
  let body = await fs.readFile(path.join(audit, name), 'utf8');
  body = body.replaceAll(root, '[local-source-collection]').replaceAll(root.replaceAll(' ', '%20'), '[local-source-collection]');
  body = body.replaceAll(path.dirname(root), '[local-source-parent]');
  await fs.writeFile(path.join('provenance', name), body);
}
await fs.copyFile(path.join(audit, 'eu-relations.json'), 'provenance/eu-relations.json');
console.log(`Imported ${manifest.length} reviewed PDFs, Markdown, sections, metadata and EU relations.`);
