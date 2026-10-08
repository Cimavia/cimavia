#!/usr/bin/env node
/**
 * Vérifie le journal de dette (`docs/dette/*.md`) et liste les dettes sans issue (#624).
 *
 * POURQUOI ce script existe : l'en-tête du journal tenait à la main la liste des dettes « sans
 * issue ». Elle a dérivé sans que rien ne casse — une dette résolue y restait citée, une autre sans
 * issue n'y entrait jamais — et deux sections avaient chacune leur R-1 et leur R-2, si bien qu'un
 * commentaire de code « dette R-2 » ne désignait plus rien de sûr. Une liste se calcule ; une règle
 * se vérifie.
 *
 * CE QU'IL VÉRIFIE, sur chaque ligne d'un tableau de dette (en-tête `| # | Dette | Statut | Suivi |`) :
 *   A. Identifiant défini une seule fois dans tout le journal, archive comprise. Une cellule à
 *      plusieurs identifiants (`~~P2-1~~ / ~~P3-2~~`, un « nouveau cas » d'une dette existante) ne
 *      définit rien : chacun de ses identifiants doit exister ailleurs.
 *   B. Statut parmi 🟢 🟡 🔴 ✅.
 *   C. Une dette ouverte a un suivi : soit `— *(…)*`, qui dit pourquoi elle n'a pas d'issue, soit
 *      une cellule qui ne commence pas ainsi et porte un lien d'issue. Un lien cité DANS le `— *(…)*`
 *      ne vaut pas suivi.
 *   D. Aucune ligne de dette hors tableau : sans en-tête (écrite sous un encadré), dans un encadré
 *      (`> | X-1 | …`) ou indentée, elle s'affiche comme un paragraphe de barres verticales et
 *      échapperait au reste du script. Les autres tableaux (en-tête différent) sont ignorés.
 *   E. L'archive : `archive.md` ne porte que des ✅, un domaine n'en porte aucune, et chaque dette
 *      archivée est nommée par la ligne « *Résolues, à l'archive : …* » d'un domaine — et
 *      réciproquement.
 *   F. Un plancher : moins de LIGNES_MIN lignes lues, c'est le script qui ne lit plus le journal
 *      (format changé, dossier déplacé), pas un journal vide — il échoue au lieu de se taire.
 *
 * Il affiche ensuite les dettes ouvertes sans issue, par domaine : c'est la liste que l'en-tête
 * tenait à la main.
 *
 * Usage : `pnpm check:dette`
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "docs/dette");
const ARCHIVE = "archive.md";
const LIGNES_MIN = 50;
const HEADER = "| # | Dette | Statut | Suivi |";
const STATUTS = new Set(["🟢", "🟡", "🔴", "✅"]);
const ID = /^~*([A-Z][A-Z0-9]*-\d+)~*$/;
const SANS_ISSUE = "— *(";
const POINTER = /^\*Résolues, à l'\[archive\]\(archive\.md\) : (.+)\.\*$/;

// Une barre échappée (`\|`) appartient à sa cellule, comme le veut GFM.
const cells = (row) =>
  row
    .split(/(?<!\\)\|/)
    .slice(1, -1)
    .map((c) => c.trim());
const looksLikeDebt = (row) => ID.test(cells(row)[0]?.split("/")[0]?.trim() ?? "");
const keyOf = (ids) => ids.map((s) => s.replaceAll("~", "")).join(" / ");

const rows = [];
const pointers = []; // { where, key }
const errors = [];

// Hors de tout tableau : une ligne « Résolues, à l'archive », ou une ligne de dette égarée.
function readOutsideTable(line, where) {
  const pointer = POINTER.exec(line);
  if (pointer) {
    for (const key of pointer[1].split(", ")) pointers.push({ where, key });
  }
  const quoted = line.replace(/^[\s>]+/, "");
  if (quoted !== line && quoted.startsWith("|") && looksLikeDebt(quoted)) {
    errors.push(`${where} — ligne de dette dans un encadré ou indentée, hors de tout tableau`);
  }
}

function readDebtRow(line, where, file) {
  const c = cells(line);
  if (c.length !== 4) {
    errors.push(`${where} — ${c.length} cellules au lieu de 4`);
    return;
  }
  const ids = c[0].split("/").map((s) => s.trim());
  rows.push({ where, file, ids, key: keyOf(ids), status: c[2], suivi: c[3] });
}

for (const file of readdirSync(DIR)
  .filter((f) => f.endsWith(".md"))
  .sort()) {
  const path = relative(ROOT, join(DIR, file));
  const lines = readFileSync(join(DIR, file), "utf8").split("\n");
  let table = null; // null hors tableau, sinon "dette" ou "autre"
  lines.forEach((line, i) => {
    const where = `${path}:${i + 1}`;
    if (!line.startsWith("|")) {
      table = null;
      readOutsideTable(line, where);
      return;
    }
    if (table === null && lines[i + 1]?.startsWith("|---")) {
      table = line === HEADER ? "dette" : "autre";
      return;
    }
    if (line.startsWith("|---") || table === "autre") return;
    if (table === null) {
      errors.push(`${where} — ligne de tableau sans en-tête (« ${HEADER} » manquant)`);
      if (!looksLikeDebt(line)) return;
    }
    readDebtRow(line, where, file);
  });
}

if (rows.length < LIGNES_MIN) {
  errors.push(
    `${rows.length} lignes de dette lues dans ${relative(ROOT, DIR)}, moins de ${LIGNES_MIN} : le script ne lit plus le journal`,
  );
}

// A — un identifiant, une définition.
const defined = new Map();
for (const r of rows) {
  if (r.ids.length !== 1) continue;
  const m = ID.exec(r.ids[0]);
  if (!m) {
    errors.push(`${r.where} — identifiant illisible : « ${r.ids[0]} »`);
    continue;
  }
  r.id = m[1];
  if (defined.has(r.id))
    errors.push(`${r.where} — ${r.id} déjà défini en ${defined.get(r.id).where}`);
  else defined.set(r.id, r);
}
for (const r of rows) {
  if (r.ids.length === 1) continue;
  for (const raw of r.ids) {
    const m = ID.exec(raw);
    if (!m) errors.push(`${r.where} — identifiant illisible : « ${raw} »`);
    else if (!defined.has(m[1]))
      errors.push(`${r.where} — ${m[1]} cité comme nouveau cas, mais défini nulle part`);
  }
}

// B, C — statut et suivi.
const sansIssue = [];
for (const r of rows) {
  if (!STATUTS.has(r.status)) {
    errors.push(`${r.where} — statut « ${r.status} » hors de 🟢 🟡 🔴 ✅`);
    continue;
  }
  if (r.status === "✅") continue;
  if (r.suivi.startsWith(SANS_ISSUE)) sansIssue.push(r);
  else if (!/issues\/\d+/.test(r.suivi))
    errors.push(`${r.where} — dette ouverte sans issue ni « — *(…)* » en suivi`);
}

// E — l'archive et les lignes qui la nomment.
const archived = new Set();
for (const r of rows) {
  const inArchive = r.file === ARCHIVE;
  if (inArchive && r.status !== "✅")
    errors.push(`${r.where} — dette ${r.status} dans l'archive : elle n'y entre que résolue (✅)`);
  if (!inArchive && r.status === "✅")
    errors.push(`${r.where} — dette ✅ restée dans son domaine : elle part dans ${ARCHIVE}`);
  if (inArchive) archived.add(r.key);
}
const named = new Set(pointers.map((p) => p.key));
for (const key of archived) {
  if (!named.has(key))
    errors.push(`${key} est archivée, mais aucune ligne « Résolues, à l'archive » ne la nomme`);
}
for (const p of pointers) {
  if (!archived.has(p.key))
    errors.push(`${p.where} — ${p.key} annoncée à l'archive, absente de ${ARCHIVE}`);
}

console.log(
  `${rows.length} lignes de dette, ${defined.size} identifiants, ${archived.size} archivées.`,
);
console.log(`\nDettes ouvertes sans issue (${sansIssue.length}) :`);
let current = null;
for (const r of sansIssue) {
  if (r.file !== current) {
    current = r.file;
    console.log(`  ${current}`);
  }
  const why = [...r.suivi.replace(/^— \*\(/, "").replace(/\)\*.*$/, "")];
  const short = why.length > 90 ? `${why.slice(0, 89).join("")}…` : why.join("");
  console.log(`    ${r.key.padEnd(7)} ${r.status} ${short}`);
}

if (errors.length) {
  console.error(`\n✗ ${errors.length} erreur(s) :`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log("\n✓ journal de dette cohérent");
