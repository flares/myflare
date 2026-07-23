#!/usr/bin/env node
/* verify.cjs — run the chandassu engine over every poem in data/ and report.
 *
 *   node padyaalu/verify.cjs            # verify all
 *   node padyaalu/verify.cjs -v         # also print per-paada gana breakdown
 *
 * Exit code is non-zero if any poem fails to scan for its declared metre, so
 * this doubles as a CI/pre-commit check on the corpus.
 */
const fs = require("fs");
const path = require("path");
const C = require("./chandassu.js");

const dir = path.join(__dirname, "data");
const verbose = process.argv.includes("-v") || process.argv.includes("--verbose");
const meta = JSON.parse(fs.readFileSync(path.join(dir, "satakams.json"), "utf8"));

let total = 0, passed = 0, failed = 0;
const failures = [];

for (const key of meta.order) {
  const s = meta.satakams[key];
  const file = path.join(__dirname, s.file);
  if (!fs.existsSync(file)) continue;
  const poems = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!poems.length) continue;
  console.log(`\n\x1b[1m${s.name}\x1b[0m  (${s.meter})  —  ${poems.length} పద్యాలు`);
  let pending = 0;
  for (const poem of poems) {
    // verses whose metre isn't pinned yet (generic "వృత్తం") are pending, not failures
    if (poem.meter === "వృత్తం" || poem.chandassuVerified === false) { pending++; continue; }
    total++;
    const r = C.analyze(poem.padyam, poem.meter);
    const mark = r.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`  ${mark} #${poem.number} ${poem.id}`);
    if (r.ok) passed++;
    else { failed++; failures.push(poem.id); }
    if (verbose || !r.ok) {
      r.paadas.forEach((p, i) => {
        const pm = p.ok ? " " : "\x1b[31m!\x1b[0m";
        const ganas = p.ganas ? p.ganas.map((g) => `${g.name}(${g.gl})`).join(" ") : `[సరిపోలలేదు] ${p.gl}`;
        console.log(`     ${pm} పా.${i + 1}: ${ganas}${p.ruleNote ? "  \x1b[33m<" + p.ruleNote + ">\x1b[0m" : ""}`);
      });
    }
  }
  if (pending) console.log(`  \x1b[33m·\x1b[0m ${pending} పద్యాలు గణ నిర్ధారణ కోసం వేచి ఉన్నాయి (pending)`);
}

console.log(`\n${"─".repeat(48)}`);
console.log(`మొత్తం ${total} · సరిపోయినవి \x1b[32m${passed}\x1b[0m · తప్పినవి ${failed ? "\x1b[31m" + failed + "\x1b[0m" : "0"}`);
if (failed) {
  console.log(`\nతప్పిన పద్యాలు: ${failures.join(", ")}`);
  console.log(`(వీటి పాఠ్యం (text) సరిచూసుకోండి — గణ/మాత్ర లెక్క సరిపోవడం లేదు.)`);
  process.exit(1);
}
