#!/usr/bin/env node
/**
 * Passe squawk sur les migrations Prisma qu'apporte la branche (#628).
 *
 * POURQUOI ce script existe : une migration qui supprime une colonne passait la CI sans aucun
 * signal, et preview la jouait au démarrage, sur les données réelles du Coach bêta. La revue lit
 * le schéma Prisma plus souvent que le SQL qu'il génère.
 *
 * CE QU'IL FAIT, dans l'ordre :
 *   1. il passe le banc `scripts/migration-lint/fixtures/` : une règle gardée par `.squawk.toml`
 *      qui ne signalerait plus rien (renommée ou retirée par une montée de squawk) se tairait sans
 *      faire échouer quoi que ce soit. Dans chaque fixture, une ligne `-- ✗ <règle>` dit que la
 *      ligne SUIVANTE doit être signalée par cette règle, et rien d'autre ne doit l'être ;
 *   2. il passe squawk sur les `migration.sql` ajoutés, modifiés ou renommés depuis la base
 *      commune avec `main` — fichiers non suivis compris, pour relire une migration à peine
 *      générée. Les migrations déjà jouées ne se modifient plus : les relire ne servirait à rien.
 *
 * Deux règles s'ajoutent à celles de squawk, qui accepte une exception sans raison :
 *   - `exception-sans-raison` : `-- squawk-ignore <règle> -- <raison>`, la raison est exigée ;
 *   - `exception-sans-regle` : un `squawk-ignore-file` doit nommer ses règles, sans quoi il tait
 *     tout le fichier, destructif compris.
 *
 * Usage : `pnpm check:migrations [--base <réf>]` — `origin/main` par défaut ; la CI passe la base
 * de la PR. Sous GitHub Actions, chaque signalement devient une annotation sur le diff.
 */

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { benchHolds } from "./fixture-bench.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = join(ROOT, ".squawk.toml");
const FIXTURES = join(ROOT, "scripts/migration-lint/fixtures");
const MIGRATIONS = "apps/api/prisma/migrations";
const MARKER = /^\s*-- ✗ ([a-z-]+)\s*$/;
// Partout où squawk la lit : en tête de ligne, après une instruction, ou dans un `/* … */`.
const IGNORE = /(?:--|\/\*)\s*squawk-ignore(-file)?\b(.*)$/;

/** Ce que squawk ne dit pas lui-même : quoi faire d'une règle qui mord. */
const HINTS = {
  "prefer-robust-stmts":
    "migration non atomique : l'envelopper dans `BEGIN;` … `COMMIT;`, ou rendre chaque instruction rejouable (CONTRIBUTING.md, « Migrations »).",
  "unused-ignore":
    "nom de règle inconnu de squawk : l'exception ne tait rien (https://squawkhq.com/docs/rules).",
  "transaction-nesting":
    "Prisma enveloppe déjà le retrait d'une valeur d'enum dans `BEGIN;` … `COMMIT;` : retirer ce bloc intérieur, la migration a déjà sa transaction.",
};
const HINT_DESTRUCTIVE =
  "opération voulue ? La déclarer au-dessus de l'instruction : `-- squawk-ignore <règle> -- <raison>`.";

/** Sortie séparée par NUL (`-z`) : un dossier au nom accentué reviendrait sinon entre
 * guillemets, échappé en octal, et ne finirait plus par `/migration.sql`. */
function git(...args) {
  const run = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`git ${args.join(" ")} : ${run.stderr.trim()}`);
  return run.stdout.split(/\0|\n/).filter(Boolean);
}

/** Les `migration.sql` que la branche apporte, chemins relatifs à la racine. */
function changedMigrations(base) {
  const [mergeBase] = git("merge-base", base, "HEAD");
  const files = [
    ...git("diff", "-z", "--name-only", "--diff-filter=AMR", mergeBase, "--", MIGRATIONS),
    ...git("ls-files", "-z", "--others", "--exclude-standard", "--", MIGRATIONS),
  ];
  return [...new Set(files)].filter((file) => file.endsWith("/migration.sql")).sort();
}

/** Les exceptions qui ne disent pas pourquoi, ou qui taisent tout un fichier. */
function exceptionFindings(file) {
  const findings = [];
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((text, index) => {
      const match = IGNORE.exec(text);
      if (match == null) return;
      // Les règles, puis la raison après le premier `--` : aucun nom de règle n'en contient.
      const body = match[2].replace(/\*\/.*$/, "");
      const cut = body.indexOf("--");
      const rules = cut === -1 ? body : body.slice(0, cut);
      const reason = cut === -1 ? "" : body.slice(cut + 2);
      if (match[1] != null && rules.trim() === "") {
        findings.push({
          file,
          line: index + 1,
          column: 0,
          rule: "exception-sans-regle",
          message: "un `squawk-ignore-file` doit nommer les règles qu'il tait.",
        });
      } else if (reason.trim() === "") {
        findings.push({
          file,
          line: index + 1,
          column: 0,
          rule: "exception-sans-raison",
          message: "une exception dit pourquoi : `-- squawk-ignore <règle> -- <raison>`.",
        });
      }
    });
  return findings;
}

/** Les signalements de squawk et les nôtres, lignes comptées à partir de 1. */
function lint(files) {
  if (files.length === 0) return [];
  const squawk = join(
    dirname(createRequire(join(ROOT, "package.json")).resolve("squawk-cli/package.json")),
    "js/bin/squawk",
  );
  const run = spawnSync(
    process.execPath,
    [squawk, `--config=${CONFIG}`, "--reporter=json", ...files],
    {
      cwd: ROOT,
      encoding: "utf8",
    },
  );
  let reported;
  try {
    reported = JSON.parse(run.stdout);
  } catch {
    throw new Error(`squawk n'a pas rendu de rapport JSON :\n${run.stderr || run.stdout}`);
  }
  return [
    ...reported.map((d) => ({
      file: d.file,
      line: d.line + 1,
      column: d.column,
      rule: d.rule_name,
      message: d.message,
    })),
    ...files.flatMap(exceptionFindings),
  ];
}

/** `fichier:ligne règle` de chaque marque du banc : la marque vise la ligne qui la suit. */
function expectedMarks(files) {
  const expected = new Set();
  for (const file of files) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((text, index) => {
        const rule = MARKER.exec(text)?.[1];
        if (rule != null) expected.add(`${relative(ROOT, file)}:${index + 2} ${rule}`);
      });
  }
  return expected;
}

/** Le banc tient-il ? Ses écarts sont rapportés au passage. */
function fixturesHold() {
  const files = readdirSync(FIXTURES)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => join(FIXTURES, name));
  return benchHolds({
    name: "Banc squawk",
    expected: expectedMarks(files),
    reported: new Set(
      lint(files).map((f) => `${relative(ROOT, resolve(ROOT, f.file))}:${f.line} ${f.rule}`),
    ),
    culprit: ".squawk.toml ne fait plus ce qu'il dit (scripts/migration-lint/).",
  });
}

/** Le conseil d'une règle, ou `null` : nos règles d'exception disent déjà quoi faire. */
function hintFor(rule) {
  if (rule in HINTS) return HINTS[rule];
  return rule.startsWith("exception-") ? null : HINT_DESTRUCTIVE;
}

/** L'échappement des commandes de workflow GitHub : `%`, retours de ligne, et dans une propriété
 * `:` et `,`, qui la couperaient. */
function escapeData(text) {
  return text.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function escapeProperty(text) {
  return escapeData(text).replaceAll(":", "%3A").replaceAll(",", "%2C");
}

/** Le conseil n'est donné qu'une fois par fichier et par règle : une migration non atomique en
 * aurait sinon un par instruction. */
function report(findings) {
  const annotate = process.env.GITHUB_ACTIONS === "true";
  const advised = new Set();
  for (const f of findings) {
    const file = relative(ROOT, resolve(ROOT, f.file));
    const key = `${file} ${f.rule}`;
    const hint = advised.has(key) ? null : hintFor(f.rule);
    advised.add(key);
    console.error(`✗ ${file}:${f.line}:${f.column + 1} ${f.rule} — ${f.message}`);
    if (hint != null) console.error(`    ${hint}`);
    if (annotate) {
      const text = escapeData(`${f.message}${hint == null ? "" : ` ${hint}`}`);
      const where = `file=${escapeProperty(file)},line=${f.line},col=${f.column + 1}`;
      console.log(`::error ${where},title=${escapeProperty(`squawk ${f.rule}`)}::${text}`);
    }
  }
}

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (value == null || value === "" || value.startsWith("--")) {
    throw new Error(`${name} attend une référence git : \`pnpm check:migrations ${name} <réf>\``);
  }
  return value;
}

try {
  if (!fixturesHold()) {
    process.exitCode = 1;
  } else {
    const files = changedMigrations(argument("--base", "origin/main"));
    const findings = lint(files);
    report(findings);
    if (findings.length > 0) {
      console.error(`\n${findings.length} signalement(s) sur ${files.length} migration(s).`);
      process.exitCode = 1;
    } else {
      console.log(`Migrations : ${files.length} relue(s), rien à signaler.`);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
