import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { findSections } from '../lib/search.js';
import type { DocumentContent } from '../lib/types.js';
const dataRoot = process.env.FFFS_CORPUS_DIR;
const fallback = new URL('../public/data/documents/', import.meta.url);
const file = (id: string) => dataRoot ? `${dataRoot}/${id}.json` : new URL(`${id}.json`, fallback);
const available = existsSync(file('2013-09'));
const document = (id: string): DocumentContent => JSON.parse(readFileSync(file(id), 'utf8'));
test('actual corpus: chapter 33 stops before appendices and chapter 6 before commencement', {skip:!available}, () => {
  const fund = findSections(document('2013-09'), {chapter:'33'});
  assert.ok(fund.length>1); assert.ok(fund.length<100);
  assert.ok(fund.every(section=>!/^Bilaga|^Ikraftträdande/.test(section.title)));
  const bank = findSections(document('2014-04'), {chapter:'6'});
  assert.ok(bank.length>1); assert.ok(bank.every(section=>!/^Ikraftträdande/.test(section.title)));
});
test('actual corpus: appendix prose reference is not a duplicate provision; future alternatives retained', {skip:!available}, () => {
  const provision = findSections(document('2015-13'), {chapter:'3',paragraph:'2'});
  assert.equal(provision.length,1); assert.equal(provision[0].title,'3 kap. 2 §');
  assert.equal(findSections(document('2013-10'), {chapter:'1',paragraph:'7'}).length,2);
});
