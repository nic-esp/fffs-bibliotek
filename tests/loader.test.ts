import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalDataBase, GitHubPagesLoader } from '../lib/loader.js';
import { catalog, corpus } from './fixtures.js';

test('loader only fetches fixed GitHub Pages paths, caches and canonicalizes identifiers', async () => {
  const urls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => { urls.push(String(input)); assert.equal(init?.redirect, 'error'); return Response.json(String(input).endsWith('catalog.json') ? catalog : corpus.documents[0]); };
  const loader = new GitHubPagesLoader('https://example.github.io/fffs/', fetcher);
  await loader.catalog(); await loader.catalog(); await loader.document('FFFS 2014:4');
  assert.deepEqual(urls, ['https://example.github.io/fffs/data/catalog.json', 'https://example.github.io/fffs/data/documents/2014-04.json']);
  await assert.rejects(loader.document('../../private'));
  assert.equal(urls.length, 2);
});
test('loader rejects arbitrary hosts, credentials and HTTP origins', () => {
  for (const url of ['http://example.github.io/fffs', 'https://example.com/fffs', 'https://user:secret@example.github.io/fffs', 'https://example.github.io/fffs?url=evil', 'https://example.github.io.evil.test']) assert.throws(() => canonicalDataBase(url));
});
test('failed fetch is not cached; mismatched document identifiers fail', async () => {
  let count = 0;
  const loader = new GitHubPagesLoader('https://example.github.io/fffs/', async () => ++count === 1 ? new Response('unavailable', { status: 503 }) : Response.json(catalog));
  await assert.rejects(loader.catalog()); assert.equal((await loader.catalog()).asOf, catalog.asOf); assert.equal(count, 2);
  const bad = new GitHubPagesLoader('https://example.github.io/fffs/', async () => Response.json({ ...corpus.documents[0], id: '1999-01' }));
  await assert.rejects(bad.document('2014:4'));
});
