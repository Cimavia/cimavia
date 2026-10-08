#!/usr/bin/env node
/**
 * Vérifie que les règles Biome maison mordent encore (#623).
 *
 * POURQUOI ce script existe : une règle GritQL qui ne trouve plus rien ne casse rien. Un nœud
 * renommé à une montée de Biome, une regex qui ne correspond plus, un `includes` qui exclut trop :
 * `biome ci` reste vert — et la règle dure qu'elle tenait n'est plus tenue que par la relecture,
 * sans que personne le sache. C'est exactement ce que les plugins devaient remplacer.
 *
 * CE QU'IL FAIT : il copie `scripts/lint-rules/fixtures/` dans un dossier temporaire, le passe à
 * `biome lint` avec la config du DÉPÔT, et compare. Dans chaque fixture, une ligne qui porte
 * `✗ <règle>` doit être signalée PAR CETTE RÈGLE, et rien d'autre ne doit l'être. Le nom compte :
 * sans lui, une règle devenue muette passerait inaperçue sur une ligne qu'une autre signale aussi. Les fixtures gardent leur chemin relatif
 * (`apps/mobile/app/…`, `packages/tokens/…`), donc le périmètre de chaque règle est vérifié autant
 * que la règle : un hex dans `theme/` signalé échoue aussi.
 *
 * Seuls comptent les diagnostics des règles maison, de `style/noHexColors` (le pendant CSS de la
 * règle 3) et des suppressions — une exception déclarée qui ne supprime plus rien veut dire que sa
 * règle ne mord plus. Le reste du lint ne regarde pas les fixtures. Biome ne nomme pas le plugin
 * dans son rapport (`category: "plugin"`) : la règle se reconnaît à son message, lu dans le
 * `.grit` lui-même plutôt que recopié ici.
 *
 * Usage : `pnpm check:lint-rules`
 */

import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RULES = join(ROOT, "scripts/lint-rules");
const FIXTURES = join(RULES, "fixtures");
const MARKER = /✗ (\w+)/g;
const LINTED = new Set([".ts", ".tsx", ".css"]);

/** Le message de chaque règle maison → son nom, qui est celui de son fichier. */
function rulesByMessage() {
  const rules = new Map();
  for (const file of readdirSync(RULES).filter((name) => name.endsWith(".grit"))) {
    const message = /message="([^"]+)"/.exec(readFileSync(join(RULES, file), "utf8"))?.[1];
    if (message == null) throw new Error(`${file} : aucun message= à reconnaître`);
    rules.set(message, file.replace(/\.grit$/, ""));
  }
  return rules;
}

/** Le nom de la règle derrière un diagnostic, ou `null` s'il n'est pas de ceux qu'on surveille. */
function ruleOf(diagnostic, rules) {
  if (diagnostic.category === "plugin") return rules.get(diagnostic.message) ?? "plugin inconnu";
  if (diagnostic.category === "lint/style/noHexColors") return "noHexColors";
  if (diagnostic.category.startsWith("suppressions/")) return diagnostic.category;
  return null;
}

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

/** `chemin:ligne règle` de chaque marque, chemin relatif au banc. */
function expectedMarks(dir) {
  const expected = new Set();
  for (const file of filesUnder(dir)) {
    if (!LINTED.has(extname(file))) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        for (const [, rule] of line.matchAll(MARKER)) {
          expected.add(`${relative(dir, file)}:${index + 1} ${rule}`);
        }
      });
  }
  return expected;
}

function lint(dir) {
  const biome = createRequire(join(ROOT, "package.json")).resolve("@biomejs/biome/bin/biome");
  const run = spawnSync(
    process.execPath,
    [biome, "lint", `--config-path=${ROOT}`, "--reporter=json", "--max-diagnostics=none", dir],
    { encoding: "utf8" },
  );
  try {
    return JSON.parse(run.stdout).diagnostics;
  } catch {
    throw new Error(`biome lint n'a pas rendu de rapport JSON :\n${run.stderr}`);
  }
}

/** Les écarts entre ce qui est marqué et ce que Biome signale, vides si le banc tient. */
function compare(workdir) {
  const expected = expectedMarks(workdir);
  const rules = rulesByMessage();
  const reported = new Set();
  for (const diagnostic of lint(workdir)) {
    const rule = ruleOf(diagnostic, rules);
    if (rule == null || diagnostic.location?.path == null) continue;
    const where = `${relative(workdir, diagnostic.location.path)}:${diagnostic.location.start.line}`;
    reported.add(`${where} ${rule}`);
  }
  return {
    expected,
    silent: [...expected].filter((mark) => !reported.has(mark)),
    unexpected: [...reported].filter((mark) => !expected.has(mark)),
  };
}

// `process.exitCode` et non `process.exit()` : ce dernier sort sans passer par `finally`, et
// laisserait la copie du banc dans le dossier temporaire à chaque échec.
const workdir = mkdtempSync(join(tmpdir(), "cmv-lint-rules-"));
try {
  cpSync(FIXTURES, workdir, { recursive: true });
  const { expected, silent, unexpected } = compare(workdir);

  for (const mark of silent) console.error(`✗ attendu, rien de signalé : ${mark}`);
  for (const mark of unexpected) console.error(`✗ signalé sans être attendu : ${mark}`);

  if (silent.length > 0 || unexpected.length > 0) {
    console.error(
      `\n${silent.length} marque(s) muette(s), ${unexpected.length} signalement(s) en trop — une règle maison ne fait plus ce qu'elle dit (scripts/lint-rules/).`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Règles maison : ${expected.size} signalements attendus, tous rendus, rien en trop.`,
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
} finally {
  rmSync(workdir, { recursive: true, force: true });
}
