#!/usr/bin/env node
/**
 * Refuse un paquet chargé en deux copies dans le bundle mobile (#760).
 *
 * POURQUOI ce script existe : en 1.16.0, deux copies de `react-native-css-interop` ont effacé tout
 * le style NativeWind, sur Android comme sur iOS — CI verte, build EAS réussi, aucune erreur à
 * l'exécution. Les styles s'enregistraient dans le store d'une copie, les composants lisaient
 * celui de l'autre. Vitest ne passe pas par Metro : seul le bundle porte le graphe réel des modules.
 *
 * CE QU'IL FAIT, dans l'ordre :
 *   1. il passe le banc `scripts/bundle-duplicates/fixtures/` : un changement de format des chemins
 *      dans Metro rendrait sinon la garde muette. Chaque fixture est une sourcemap, augmentée de
 *      champs `x_cmv_*` : `x_cmv_exceptions` les doublons admis (aucun si absent),
 *      `x_cmv_doublons` les paquets qui doivent être refusés, `x_cmv_perimees` les exceptions qui
 *      doivent être signalées périmées (aucune si absent). Rien d'autre ne doit l'être ;
 *   2. il exporte le bundle Android avec ses sourcemaps (ou lit l'export de `--dir`) ;
 *   3. il échoue si un même paquet y vient de deux dossiers `.pnpm`. La clé est le dossier ENTIER,
 *      pas la version : il porte aussi le jeu de pairs, et deux copies de même version ont chacune
 *      leur état.
 *
 * Zéro doublon, exceptions déclarées dans `EXCEPTIONS` avec leur raison (tranché en #760) : une
 * liste de singletons ne protégerait que ce qu'on a pensé à y mettre. Une exception qui ne
 * correspond plus à rien échoue aussi, pour que la liste ne garde que des raisons vraies.
 *
 * Android seul : le graphe JS est le même sur iOS, au code `*.ios.*` près, qui ne change pas
 * quelles copies sont résolues.
 *
 * Usage : `pnpm check:bundle [--dir <dossier d'export>]` — sans `--dir`, il exporte dans un dossier
 * temporaire ; `--dir` se lit depuis le dossier où la commande est tapée. Sous GitHub Actions,
 * chaque signalement devient une annotation.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { benchHolds } from "./fixture-bench.mjs";
import { escapeData, escapeProperty } from "./github-annotation.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MOBILE = join(ROOT, "apps/mobile");
const FIXTURES = join(ROOT, "scripts/bundle-duplicates/fixtures");
// `node_modules/.pnpm/<dossier>/node_modules/<paquet, @scope compris>/…`, en tête de chemin ou
// après un `/` (Metro écrit `/node_modules/…`, Vite `../../node_modules/…`) : le dossier porte la
// version et les pairs, et pnpm le raccourcit en hash quand il est trop long.
const PNPM_SOURCE = /(?:^|\/)node_modules\/\.pnpm\/([^/]+)\/node_modules\/((?:@[^/]+\/)?[^/]+)\//;

/** Les doublons admis, et pourquoi. Une raison dit pourquoi deux copies ne cassent rien. */
const EXCEPTIONS = new Map([
  [
    "nanoid",
    "sans état partagé : deux copies ne font que dupliquer un générateur d'identifiants. Ses dépendants acceptent tous ^3.3.x, mais seul `pnpm dedupe` les réaligne, et il déplace metro, babel et postcss avec.",
  ],
]);

/**
 * Les dossiers `.pnpm` d'où vient chaque paquet des `sources`.
 *
 * @param {string[]} sources - les `sources` d'une ou plusieurs sourcemaps.
 * @returns {Map<string, Set<string>>} paquet → dossiers ; vide si aucun chemin n'est sous `.pnpm`.
 */
function copiesByPackage(sources) {
  const copies = new Map();
  for (const source of sources) {
    const match = PNPM_SOURCE.exec(source);
    if (match == null) continue;
    const [, folder, name] = match;
    if (!copies.has(name)) copies.set(name, new Set());
    copies.get(name).add(folder);
  }
  return copies;
}

/**
 * Ce que la garde refuse.
 *
 * @param {Map<string, Set<string>>} copies - paquet → dossiers.
 * @param {Iterable<string>} exceptions - les paquets dont le doublon est admis.
 * @returns {{ refused: [string, Set<string>][], stale: string[] }} les doublons non admis, et les
 *   exceptions qui ne correspondent plus à aucun doublon.
 */
function judge(copies, exceptions) {
  const admitted = new Set(exceptions);
  const found = [...copies].filter(([, folders]) => folders.size > 1);
  const doubled = new Set(found.map(([name]) => name));
  return {
    refused: found.filter(([name]) => !admitted.has(name)),
    stale: [...admitted].filter((name) => !doubled.has(name)),
  };
}

/** Un champ de fixture : une liste de noms, `[]` seulement si le champ est déclaré optionnel. */
function fixtureList(map, file, field, optional) {
  const value = map[field];
  if (value == null && optional) return [];
  if (!Array.isArray(value)) throw new Error(`fixture ${file} : \`${field}\` doit être une liste.`);
  return value;
}

/** Le banc tient-il ? Ses écarts sont rapportés au passage. */
function fixturesHold() {
  const expected = new Set();
  const reported = new Set();
  for (const file of readdirSync(FIXTURES).filter((name) => name.endsWith(".json"))) {
    const map = JSON.parse(readFileSync(join(FIXTURES, file), "utf8"));
    for (const pkg of fixtureList(map, file, "x_cmv_doublons", false)) {
      expected.add(`${file} doublon ${pkg}`);
    }
    for (const pkg of fixtureList(map, file, "x_cmv_perimees", true)) {
      expected.add(`${file} périmée ${pkg}`);
    }
    const copies = copiesByPackage(fixtureList(map, file, "sources", false));
    const { refused, stale } = judge(copies, fixtureList(map, file, "x_cmv_exceptions", true));
    for (const [pkg] of refused) reported.add(`${file} doublon ${pkg}`);
    for (const pkg of stale) reported.add(`${file} périmée ${pkg}`);
  }
  return benchHolds({
    name: "Banc des doublons du bundle",
    expected,
    reported,
    culprit:
      "les chemins des sourcemaps ont changé de forme, ou le tri des exceptions ne fait plus ce qu'il dit (scripts/check-bundle-duplicates.mjs).",
  });
}

/** Exporte le bundle Android avec ses sourcemaps dans `outDir`. */
function exportBundle(outDir) {
  console.log(`Export du bundle Android dans ${outDir}…`);
  const run = spawnSync(
    "pnpm",
    ["exec", "expo", "export", "--platform", "android", "--source-maps", "--output-dir", outDir],
    { cwd: MOBILE, stdio: "inherit" },
  );
  if (run.error != null) throw new Error(`l'export Expo n'a pas démarré : ${run.error.message}`);
  if (run.signal != null) throw new Error(`l'export Expo a été interrompu (${run.signal}).`);
  if (run.status !== 0) throw new Error(`l'export Expo a échoué (code ${run.status}).`);
}

/** Les `sources` de toutes les sourcemaps de l'export : un doublon peut traverser deux morceaux. */
function exportedSources(outDir) {
  const maps = readdirSync(outDir, { recursive: true })
    .filter((file) => file.endsWith(".map"))
    .map((file) => join(outDir, file));
  if (maps.length === 0) {
    throw new Error(
      `aucune sourcemap dans ${outDir} : l'export a-t-il tourné avec --source-maps ?`,
    );
  }
  return maps.flatMap((file) => JSON.parse(readFileSync(file, "utf8")).sources);
}

function annotate(title, text) {
  if (process.env.GITHUB_ACTIONS !== "true") return;
  console.log(`::error title=${escapeProperty(title)}::${escapeData(text)}`);
}

/** Rapporte les doublons non admis et les exceptions périmées ; `true` si rien n'est à signaler. */
function verdict(copies) {
  const { refused, stale } = judge(copies, EXCEPTIONS.keys());

  for (const [name, folders] of refused) {
    const text = `${name} est chargé en ${folders.size} copies : ${[...folders].sort().join(", ")}`;
    console.error(`✗ ${text}`);
    annotate(`doublon ${name}`, text);
  }
  if (refused.length > 0) {
    console.error(
      "    aligner les déclarations (ou le lockfile) pour qu'une seule copie reste, ou déclarer l'exception dans EXCEPTIONS (scripts/check-bundle-duplicates.mjs) avec sa raison.",
    );
  }
  for (const name of stale) {
    console.error(`✗ exception périmée : ${name} n'est plus en double, la retirer d'EXCEPTIONS.`);
    annotate(`exception ${name}`, `${name} n'est plus en double : retirer son exception.`);
  }
  return refused.length === 0 && stale.length === 0;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (value == null || value === "" || value.startsWith("--")) {
    throw new Error(`${name} attend un dossier : \`pnpm check:bundle ${name} <dossier>\``);
  }
  return value;
}

try {
  if (!fixturesHold()) {
    process.exitCode = 1;
  } else {
    const given = argument("--dir");
    // pnpm lance le script depuis la racine : `INIT_CWD` est le dossier où la commande est tapée.
    const outDir =
      given == null
        ? mkdtempSync(join(tmpdir(), "cmv-bundle-"))
        : resolve(process.env.INIT_CWD ?? process.cwd(), given);
    try {
      if (given == null) exportBundle(outDir);
      const copies = copiesByPackage(exportedSources(outDir));
      // Aucun chemin `.pnpm` : Metro a changé de forme, et la garde ne verrait plus rien.
      if (copies.size === 0) {
        throw new Error(`aucun paquet sous node_modules/.pnpm dans les sourcemaps de ${outDir}.`);
      }
      if (verdict(copies)) {
        const admitted = EXCEPTIONS.size === 0 ? "" : ` hors ${[...EXCEPTIONS.keys()].join(", ")}`;
        console.log(`Bundle mobile : ${copies.size} paquets, aucun en double${admitted}.`);
      } else {
        process.exitCode = 1;
      }
    } finally {
      if (given == null) rmSync(outDir, { recursive: true, force: true });
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
