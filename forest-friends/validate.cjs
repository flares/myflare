#!/usr/bin/env node
/* Cross-checks animals.js against the game contracts. Run: node validate.cjs */
const fs = require("fs");
const path = require("path");

const SOUND_VOCAB = new Set(["roar","growl","chirp","tweet","squeak","trumpet","hiss","howl",
  "moo","baa","oink","meow","bark","quack","cluck","ribbit","buzz","neigh","hoot","screech","click","generic"]);

// load animals.js in a minimal window sandbox
const win = {};
const code = fs.readFileSync(path.join(__dirname, "animals.js"), "utf8");
new Function("window", code)(win);

const A = win.ANIMALS;
let errs = [], warns = [];
if (!Array.isArray(A) || !A.length) { console.error("FAIL: window.ANIMALS missing/empty"); process.exit(1); }

const keys = new Set();
A.forEach((a, i) => {
  const where = `#${i} ${a && a.name || "?"}`;
  ["key","name","emoji","telugu","teluguRoman","sound"].forEach(f => {
    if (!a[f]) errs.push(`${where}: missing ${f}`);
  });
  if (!Array.isArray(a.aliases) || !a.aliases.length) errs.push(`${where}: aliases must be non-empty array`);
  if (a.sound && !SOUND_VOCAB.has(a.sound)) errs.push(`${where}: sound "${a.sound}" not in audio vocab`);
  if (a.key && keys.has(a.key)) errs.push(`${where}: duplicate key ${a.key}`);
  keys.add(a.key);
  // aliases should include english name + teluguRoman, lowercase
  const al = (a.aliases || []).map(s => String(s).toLowerCase());
  if (a.name && !al.includes(a.name.toLowerCase())) warns.push(`${where}: aliases missing english name`);
});

// A-Z coverage: every letter >= 2 animals
const byLetter = {};
A.forEach(a => {
  const c = a.name.replace(/[^a-z]/i, "").charAt(0).toUpperCase();
  (byLetter[c] = byLetter[c] || []).push(a.name);
});
"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(L => {
  const n = (byLetter[L] || []).length;
  if (n < 2) errs.push(`Letter ${L}: only ${n} animal(s) — need >=2 [${(byLetter[L]||[]).join(", ")}]`);
});

// helper present?
if (typeof win.animalsByLetter !== "function") errs.push("window.animalsByLetter helper missing");
else if (win.animalsByLetter("B").length === 0) warns.push("animalsByLetter('B') returned 0");

console.log(`Animals: ${A.length}. Letters covered: ${Object.keys(byLetter).length}/26.`);
if (warns.length) console.log("WARN:\n  " + warns.slice(0, 20).join("\n  "));
if (errs.length) { console.error("FAIL (" + errs.length + "):\n  " + errs.join("\n  ")); process.exit(1); }
console.log("PASS ✅  dataset satisfies all contracts.");
