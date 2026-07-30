#!/usr/bin/env node
/**
 * Dataset validator for the Tyagaraja kriti collection.
 *
 * Zero dependencies, on purpose: this repo has no build step and CI should not
 * need `npm install` to check a data file. It implements the slice of JSON
 * Schema 2020-12 the schemas in ./schema actually use, then layers on the
 * domain checks a generic validator cannot know about:
 *
 *   - catalog numbering is contiguous and follows alphabetical title order
 *   - every raga_slug / tala / group reference resolves
 *   - melakarta scales are DERIVED from the mela number and compared, so a
 *     wrong arohana cannot be committed
 *   - janya scales stay inside their parent mela's swara set (bhashanga aside)
 *   - Telugu-script fields really contain Telugu codepoints
 *   - the manifest's per-file counts and sha256 hashes are current
 *
 * Usage:
 *   node validate.mjs            # validate, exit 1 on errors
 *   node validate.mjs --strict   # warnings are errors too
 *   node validate.mjs --update   # rewrite dataset.json counts + hashes
 *   node validate.mjs --quiet    # only print problems and the summary
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = new Set(process.argv.slice(2));
const STRICT = argv.has('--strict');
const UPDATE = argv.has('--update');
const QUIET = argv.has('--quiet');

const errors = [];
const warnings = [];
const infos = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
const info = (msg) => infos.push(msg);

/* ------------------------------------------------------------------ *
 * Minimal JSON Schema 2020-12 validator (the keywords we actually use)
 * ------------------------------------------------------------------ */

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  if (typeof value === 'number') return 'number';
  return typeof value;
}

function typeMatches(value, expected) {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  return actual === expected;
}

function deref(schema, root) {
  if (!schema || typeof schema.$ref !== 'string') return schema;
  const ref = schema.$ref;
  if (!ref.startsWith('#/')) throw new Error(`unsupported $ref: ${ref}`);
  let node = root;
  for (const rawPart of ref.slice(2).split('/')) {
    const part = rawPart.replace(/~1/g, '/').replace(/~0/g, '~');
    node = node?.[part];
    if (node === undefined) throw new Error(`unresolvable $ref: ${ref}`);
  }
  return deref(node, root);
}

/** Validate `value` against `schema`, pushing messages into `out`. */
function checkSchema(value, schema, root, path, out) {
  const s = deref(schema, root);
  if (!s || typeof s !== 'object') return;

  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.some((t) => typeMatches(value, t))) {
      out.push(`${path} should be ${types.join(' | ')}, got ${typeOf(value)}`);
      return; // further keywords would just add noise
    }
  }

  if (s.enum !== undefined) {
    const ok = s.enum.some((allowed) => allowed === value);
    if (!ok) out.push(`${path} = ${JSON.stringify(value)} is not one of ${JSON.stringify(s.enum)}`);
  }
  if (s.const !== undefined && value !== s.const) {
    out.push(`${path} must equal ${JSON.stringify(s.const)}`);
  }

  if (typeof value === 'string') {
    // A `null`-able field's length/pattern rules only apply when it is a string.
    if (s.pattern !== undefined && !new RegExp(s.pattern, 'u').test(value)) {
      out.push(`${path} = ${JSON.stringify(clip(value))} does not match /${s.pattern}/`);
    }
    if (s.minLength !== undefined && [...value].length < s.minLength) {
      out.push(`${path} is shorter than ${s.minLength} chars`);
    }
    if (s.maxLength !== undefined && [...value].length > s.maxLength) {
      out.push(`${path} is longer than ${s.maxLength} chars (${[...value].length})`);
    }
  }

  if (typeof value === 'number') {
    if (s.minimum !== undefined && value < s.minimum) out.push(`${path} = ${value} < minimum ${s.minimum}`);
    if (s.maximum !== undefined && value > s.maximum) out.push(`${path} = ${value} > maximum ${s.maximum}`);
  }

  if (Array.isArray(value)) {
    if (s.minItems !== undefined && value.length < s.minItems) out.push(`${path} needs at least ${s.minItems} items`);
    if (s.maxItems !== undefined && value.length > s.maxItems) out.push(`${path} allows at most ${s.maxItems} items`);
    if (s.uniqueItems) {
      const seen = new Set();
      value.forEach((item, i) => {
        const key = JSON.stringify(item);
        if (seen.has(key)) out.push(`${path}[${i}] duplicates an earlier item (${key})`);
        seen.add(key);
      });
    }
    if (s.items) value.forEach((item, i) => checkSchema(item, s.items, root, `${path}[${i}]`, out));
  }

  if (typeOf(value) === 'object') {
    for (const key of s.required ?? []) {
      if (!(key in value)) out.push(`${path}.${key} is required but missing`);
    }
    const props = s.properties ?? {};
    for (const [key, sub] of Object.entries(props)) {
      if (key in value) checkSchema(value[key], sub, root, `${path}.${key}`, out);
    }
    if (s.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) out.push(`${path}.${key} is not an allowed property`);
      }
    }
  }
}

const clip = (str, n = 48) => (str.length > n ? `${str.slice(0, n)}…` : str);

/* ------------------------------------------------------------------ *
 * Carnatic theory: derive a melakarta's scale from its number
 * ------------------------------------------------------------------ */

const CHAKRAS = ['Indu', 'Netra', 'Agni', 'Veda', 'Bana', 'Rutu', 'Rishi', 'Vasu', 'Brahma', 'Disi', 'Rudra', 'Aditya'];
// Position within a chakra fixes dhaivata/nishada; the chakra fixes rishabha/gandhara.
const PURVANGA = [['R1', 'G1'], ['R1', 'G2'], ['R1', 'G3'], ['R2', 'G2'], ['R2', 'G3'], ['R3', 'G3']];
const UTTARANGA = [['D1', 'N1'], ['D1', 'N2'], ['D1', 'N3'], ['D2', 'N2'], ['D2', 'N3'], ['D3', 'N3']];

function melakartaScale(mela) {
  if (!Number.isInteger(mela) || mela < 1 || mela > 72) return null;
  const index = mela - 1;
  const chakraIndex = Math.floor(index / 6); // 0..11
  const position = index % 6; // 0..5
  const [ri, ga] = PURVANGA[chakraIndex % 6];
  const [dha, ni] = UTTARANGA[position];
  const ma = mela <= 36 ? 'M1' : 'M2';
  return {
    chakra: CHAKRAS[chakraIndex],
    arohana: ['S', ri, ga, ma, 'P', dha, ni, 'S'].join(' '),
    swaras: new Set(['S', ri, ga, ma, 'P', dha, ni]),
  };
}

const reverse = (line) => line.split(' ').reverse().join(' ');

/* ------------------------------------------------------------------ *
 * Load
 * ------------------------------------------------------------------ */

function readJson(relPath) {
  const abs = resolve(HERE, relPath);
  if (!existsSync(abs)) {
    err(relPath, 'file does not exist');
    return null;
  }
  const raw = readFileSync(abs, 'utf8');
  try {
    return { data: JSON.parse(raw), raw, abs };
  } catch (e) {
    err(relPath, `is not valid JSON — ${e.message}`);
    return null;
  }
}

const sha256 = (raw) => createHash('sha256').update(raw, 'utf8').digest('hex');

const manifestFile = readJson('data/dataset.json');
if (!manifestFile) {
  report();
  process.exit(1);
}
const manifest = manifestFile.data;

const manifestSchema = readJson('schema/dataset.schema.json');
if (manifestSchema) {
  const out = [];
  checkSchema(manifest, manifestSchema.data, manifestSchema.data, 'dataset', out);
  out.forEach((m) => err('data/dataset.json', m));
}

/* ------------------------------------------------------------------ *
 * Per-file schema validation + manifest integrity
 * ------------------------------------------------------------------ */

const loaded = {};

for (const [key, entry] of Object.entries(manifest.files ?? {})) {
  const dataPath = join('data', entry.path);
  const file = readJson(dataPath);
  const schemaFile = readJson(join('schema', entry.schema));
  if (!file || !schemaFile) continue;

  const out = [];
  checkSchema(file.data, schemaFile.data, schemaFile.data, key, out);
  out.forEach((m) => err(dataPath, m));

  const records = Array.isArray(file.data?.records) ? file.data.records : [];
  loaded[key] = { records, file, entry, dataPath };

  if (!UPDATE) {
    if (entry.count !== records.length) {
      err('data/dataset.json', `files.${key}.count is ${entry.count} but ${dataPath} holds ${records.length} records — run \`node validate.mjs --update\``);
    }
    const actual = sha256(file.raw);
    if (entry.sha256 !== actual) {
      err('data/dataset.json', `files.${key}.sha256 is stale for ${dataPath} — run \`node validate.mjs --update\``);
    }
  }
}

if (UPDATE) {
  for (const [key, { records, file, entry }] of Object.entries(loaded)) {
    entry.count = records.length;
    entry.sha256 = sha256(file.raw);
  }
  writeFileSync(manifestFile.abs, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  info(`manifest rewritten with fresh counts and hashes`);
}

const kritis = loaded.kritis?.records ?? [];
const ragas = loaded.ragas?.records ?? [];
const talas = loaded.talas?.records ?? [];
const groups = loaded.groups?.records ?? [];

/* ------------------------------------------------------------------ *
 * Referential integrity + domain rules
 * ------------------------------------------------------------------ */

const uniqueSlugs = (records, where) => {
  const seen = new Map();
  records.forEach((r, i) => {
    if (typeof r?.slug !== 'string') return;
    if (seen.has(r.slug)) err(where, `duplicate slug "${r.slug}" at records[${i}] (first seen at records[${seen.get(r.slug)}])`);
    else seen.set(r.slug, i);
  });
  return new Set(seen.keys());
};

const ragaSlugs = uniqueSlugs(ragas, 'data/ragas.json');
const groupSlugs = uniqueSlugs(groups, 'data/groups.json');
uniqueSlugs(talas, 'data/talas.json');
uniqueSlugs(kritis, 'data/kritis.json');

const ragaBySlug = new Map(ragas.map((r) => [r.slug, r]));
const talaLabels = new Set(talas.map((t) => t.label));

// --- talas -----------------------------------------------------------
const labelSeen = new Set();
talas.forEach((t, i) => {
  if (labelSeen.has(t.label)) err('data/talas.json', `records[${i}] repeats label "${t.label}"`);
  labelSeen.add(t.label);
});

// --- ragas -----------------------------------------------------------
ragas.forEach((r, i) => {
  const at = `records[${i}] (${r.slug})`;
  const W = 'data/ragas.json';

  if (r.type === 'melakarta') {
    if (r.parent !== r.slug) err(W, `${at} is a melakarta so parent should be its own slug, got "${r.parent}"`);
    if (r.mela === null) {
      err(W, `${at} is a melakarta but has no mela number`);
    } else {
      const derived = melakartaScale(r.mela);
      if (derived) {
        if (r.arohana !== derived.arohana) {
          err(W, `${at} mela ${r.mela} implies arohana "${derived.arohana}" but file says "${r.arohana}"`);
        }
        const expectedAva = reverse(derived.arohana);
        if (r.avarohana !== expectedAva) {
          err(W, `${at} mela ${r.mela} implies avarohana "${expectedAva}" but file says "${r.avarohana}"`);
        }
        if (r.chakra !== derived.chakra) {
          err(W, `${at} mela ${r.mela} belongs to chakra ${derived.chakra}, file says ${r.chakra}`);
        }
      }
    }
    if (r.scale_type !== 'sampurna') {
      warn(W, `${at} is a melakarta — scale_type is normally "sampurna", got "${r.scale_type}"`);
    }
  } else {
    if (!ragaSlugs.has(r.parent)) {
      err(W, `${at} parent "${r.parent}" is not a raga in this file`);
    } else {
      const parent = ragaBySlug.get(r.parent);
      if (parent.type !== 'melakarta') err(W, `${at} parent "${r.parent}" is itself a janya raga`);
      if (r.mela !== null && parent.mela !== null && r.mela !== parent.mela) {
        err(W, `${at} claims mela ${r.mela} but its parent ${parent.slug} is mela ${parent.mela}`);
      }
      const derived = melakartaScale(parent.mela);
      if (derived && r.scale_type !== 'bhashanga') {
        const used = new Set([...r.arohana.split(' '), ...r.avarohana.split(' ')]);
        const foreign = [...used].filter((sw) => !derived.swaras.has(sw));
        if (foreign.length) {
          warn(W, `${at} uses ${foreign.join(', ')} which are outside mela ${parent.mela} (${parent.slug}) — mark it bhashanga or fix the parent`);
        }
      }
    }
    if (r.chakra !== null) warn(W, `${at} is a janya raga — chakra should be null`);
  }

  for (const field of ['arohana', 'avarohana']) {
    const line = r[field];
    if (typeof line !== 'string') continue;
    const swaras = line.split(' ');
    if (swaras[0] !== 'S') err(W, `${at} ${field} must start on S`);
    if (swaras[swaras.length - 1] !== 'S') err(W, `${at} ${field} must end on S`);
    if (swaras.length < 4) err(W, `${at} ${field} has only ${swaras.length} swaras`);
    for (let k = 1; k < swaras.length; k += 1) {
      if (swaras[k] === swaras[k - 1]) err(W, `${at} ${field} repeats ${swaras[k]} back to back`);
    }
  }
});

// --- groups ----------------------------------------------------------
const groupCounts = new Map([...groupSlugs].map((s) => [s, 0]));

// --- kritis ----------------------------------------------------------
const TELUGU = /[ఀ-౿]/;
const LATIN_LETTER = /[A-Za-z]/;

/** Sort key for catalog numbering: diacritics folded, non-letters dropped. */
function sortKey(title) {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const titleSeen = new Map();

kritis.forEach((k, i) => {
  const at = `records[${i}] (${k.slug ?? '?'})`;
  const W = 'data/kritis.json';

  if (k.id !== i + 1) err(W, `${at} has id ${k.id} but sits at position ${i + 1} — ids must be contiguous from 1 in file order`);

  if (!ragaSlugs.has(k.raga_slug)) err(W, `${at} raga_slug "${k.raga_slug}" is not in ragas.json`);
  if (!talaLabels.has(k.tala)) err(W, `${at} tala "${k.tala}" is not in talas.json`);
  for (const g of k.groups ?? []) {
    if (!groupSlugs.has(g)) err(W, `${at} group "${g}" is not in groups.json`);
    else groupCounts.set(g, groupCounts.get(g) + 1);
  }

  const key = `${sortKey(k.title ?? '')}|${k.raga_slug}`;
  if (titleSeen.has(key)) {
    err(W, `${at} duplicates records[${titleSeen.get(key)}] — same title and raga`);
  } else {
    titleSeen.set(key, i);
  }

  for (const field of ['title_telugu', 'pallavi_telugu']) {
    const value = k[field];
    if (value === null || value === undefined) continue;
    if (!TELUGU.test(value)) err(W, `${at} ${field} contains no Telugu characters — use null if the script is unknown`);
    else if (LATIN_LETTER.test(value)) warn(W, `${at} ${field} mixes Latin letters into Telugu script`);
  }

  if (typeof k.pallavi === 'string' && TELUGU.test(k.pallavi)) {
    err(W, `${at} pallavi holds Telugu script — that belongs in pallavi_telugu`);
  }
  if (typeof k.raga === 'string' && ragaBySlug.has(k.raga_slug)) {
    // Display names should agree between the kriti row and the raga reference.
    const refName = ragaBySlug.get(k.raga_slug).name;
    if (sortKey(k.raga) !== sortKey(refName)) {
      warn(W, `${at} raga display name "${k.raga}" differs from ragas.json "${refName}"`);
    }
  }
  if ((k.groups ?? []).length === 0 && k.kshetra) {
    infos.length; // kshetra without a group set is fine — many travel kritis stand alone
  }
});

// Catalog order: ids follow alphabetical title order.
const ordered = [...kritis].sort((a, b) => sortKey(a.title ?? '').localeCompare(sortKey(b.title ?? ''), 'en'));
for (let i = 0; i < kritis.length; i += 1) {
  if (kritis[i]?.slug !== ordered[i]?.slug) {
    err('data/kritis.json', `catalog order broken at position ${i + 1}: file has "${kritis[i]?.title}" where alphabetical order expects "${ordered[i]?.title}" — run \`node renumber.mjs\``);
    break;
  }
}

for (const g of groups) {
  const actual = groupCounts.get(g.slug) ?? 0;
  if (actual === 0) warn('data/groups.json', `group "${g.slug}" has no kritis pointing at it`);
  else if (g.expected_count !== null && actual !== g.expected_count) {
    warn('data/groups.json', `group "${g.slug}" expects ${g.expected_count} kritis, dataset has ${actual}`);
  }
}

const unusedRagas = [...ragaSlugs].filter((slug) => !kritis.some((k) => k.raga_slug === slug));
if (unusedRagas.length) info(`${unusedRagas.length} ragas in the reference have no kriti yet (fine — the reference is broader than the catalog)`);

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

function distribution(records, field) {
  const counts = new Map();
  for (const r of records) counts.set(r[field], (counts.get(r[field]) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function report() {
  if (!QUIET) {
    console.log('\n  Tyagaraja kriti dataset');
    console.log(`  manifest ${manifest?.version ?? '?'} · schema ${manifest?.schema_version ?? '?'} · updated ${manifest?.updated ?? '?'}`);
    console.log(`  ${kritis.length} kritis · ${ragas.length} ragas · ${talas.length} talas · ${groups.length} groups`);
    if (kritis.length) {
      const ragasUsed = new Set(kritis.map((k) => k.raga_slug)).size;
      console.log(`  ${ragasUsed} distinct ragas in the catalog`);
      console.log(`  language  ${distribution(kritis, 'language').map(([k, v]) => `${k} ${v}`).join(' · ')}`);
      console.log(`  tala      ${distribution(kritis, 'tala').map(([k, v]) => `${k} ${v}`).join(' · ')}`);
      const withTelugu = kritis.filter((k) => k.pallavi_telugu).length;
      console.log(`  telugu script for ${withTelugu}/${kritis.length} pallavis`);
    }
  }

  for (const line of infos) console.log(`  · ${line}`);
  if (warnings.length) {
    console.log(`\n  ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`);
    for (const line of warnings) console.log(`    ! ${line}`);
  }
  if (errors.length) {
    console.log(`\n  ${errors.length} error${errors.length === 1 ? '' : 's'}`);
    for (const line of errors) console.log(`    x ${line}`);
  }
  const failed = errors.length > 0 || (STRICT && warnings.length > 0);
  console.log(failed ? '\n  FAILED\n' : '\n  OK\n');
  return failed;
}

process.exit(report() ? 1 : 0);
