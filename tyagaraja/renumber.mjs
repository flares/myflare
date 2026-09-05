#!/usr/bin/env node
/**
 * Reassigns catalog numbers in data/kritis.json.
 *
 * `id` is the number a student sees ("#142") and it is defined as the record's
 * position in alphabetical title order. That means adding a kriti shifts the
 * numbers after it — which is fine, because nothing keys off `id`: the app's
 * favourites, bookmarks, status and notes all key off the immutable `slug`.
 *
 * Run this after adding or renaming records, then `node validate.mjs --update`
 * to refresh the manifest hashes.
 *
 *   node renumber.mjs           # rewrite ids in alphabetical order
 *   node renumber.mjs --check   # report drift without writing
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK = process.argv.includes('--check');
const path = resolve(HERE, 'data/kritis.json');

/** Must stay identical to sortKey() in validate.mjs. */
function sortKey(title) {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const doc = JSON.parse(readFileSync(path, 'utf8'));
const before = doc.records.map((r) => r.slug);

doc.records.sort((a, b) => sortKey(a.title).localeCompare(sortKey(b.title), 'en'));
doc.records.forEach((record, i) => {
  record.id = i + 1;
});

const moved = doc.records.filter((r, i) => before[i] !== r.slug).length;

if (CHECK) {
  console.log(moved ? `${moved} records are out of catalog order` : 'catalog order is current');
  process.exit(moved ? 1 : 0);
}

writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
console.log(`renumbered ${doc.records.length} kritis (${moved} moved) — now run: node validate.mjs --update`);
