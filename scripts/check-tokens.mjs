#!/usr/bin/env node
/**
 * Refuse une classe `*-cmv-*` que Tailwind ne génère pas (#178).
 *
 * POURQUOI ce script existe : une classe qui désigne un token inexistant — `text-cmv-text-low`
 * quand le token est `lo`, `rounded-cmv-2xl` quand les rayons s'arrêtent à `xl` — est ignorée en
 * silence. Tailwind ne génère pas la règle, le texte sort sans couleur ou sans taille. `tsc` n'y
 * lit qu'une chaîne, Biome aussi, et ni `vite build` ni `expo export` ne s'en plaignent.
 *
 * CE QU'IL FAIT : il relève dans les sources de chaque app tout jeton qui contient `-cmv-`, et
 * demande à Tailwind, monté avec la VRAIE config de l'app (preset `@cmv/tokens`, et celui de
 * NativeWind côté mobile), si chacun produit une règle. Tailwind juge lui-même : un préfixe
 * inconnu, un token pris dans la mauvaise échelle (`p-cmv-pill`), une variante ou un modificateur
 * d'opacité, sans table recopiée à tenir à jour. Chaque classe est jugée seule
 * (`context.getClassOrder`, `null` quand rien n'est généré) : une classe citée dans la variante
 * arbitraire d'une autre ne passe pas pour générée.
 *
 * Les sources sont celles du `content` de la config — ce que Tailwind lit est ce qu'on vérifie —,
 * plus les e2e web, dont les sélecteurs Playwright visent des classes. Les tests en font partie :
 * un `toHaveClass("text-cmv-h3")` resterait vert sur une classe qui n'existe pas.
 *
 * Avant cela, il passe le banc `scripts/tokens/fixtures/<app>/` : une ligne qui porte
 * `✗ <classe>` doit être signalée pour cette classe, et rien d'autre ne doit l'être. Sans lui, un
 * changement de Tailwind rendrait la garde muette.
 *
 * Le relevé lit le TEXTE, commentaires compris. Ce qui n'est pas une classe s'écarte par sa forme :
 * un token nu (`cmv-chrono`), un motif (`bg-cmv-*`), une variable CSS (`--cmv-week-rows`). Un
 * sélecteur (`span.text-cmv-body`, `.bg-cmv-accent.text-cmv-text-hi:not(…)`) est lu comme les
 * classes qu'il vise. Une classe fausse citée exprès dans un commentaire sera signalée : la
 * reformuler.
 *
 * Une classe assemblée (`` `text-cmv-${variant}` ``) sort tronquée (`text-cmv-$`) et échoue aussi,
 * à raison : Tailwind ne la génère pas sans `safelist`.
 *
 * Tailwind 3 seulement : `getClassOrder` est l'API du contexte qu'utilise le plugin Prettier de
 * Tailwind, hors de ses exports publics. La 4 (#852) se pilote par `compile().build(candidates)`.
 *
 * Usage : `pnpm check:tokens` — sous GitHub Actions, chaque signalement devient une annotation.
 */

import { globSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { benchHolds } from "./fixture-bench.mjs";
import { escapeData, escapeProperty } from "./github-annotation.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(ROOT, "scripts/tokens/fixtures");
const MARKER = /✗ (\S*-cmv-\S*)/g;

/**
 * Les apps, et ce qu'on lit en plus du `content` de leur config : les e2e web visent des classes
 * dans leurs sélecteurs, sans que Tailwind ait à les lire.
 */
const APPS = { web: ["e2e/**/*.ts"], mobile: [] };

// Ce qui sépare deux jetons dans du TS, du JSX ou de la prose. Pas les crochets : ils portent les
// variantes arbitraires (`[&::-webkit-progress-value]:bg-cmv-accent`).
const SEPARATOR = /[\s"'`{}(),;]+/;
// `span.text-cmv-body`, `.a.b:not` : un sélecteur CSS, balise facultative en tête.
const SELECTOR = /^[a-z\d]*\./;

// Ce par quoi une classe peut finir : un mot, un crochet, un modificateur d'opacité.
const CLASS_END = /[\w\]/%$]/;

/** Le jeton sans la ponctuation de la prose qui le suit (« … `bg-cmv-accent`. »). */
function withoutTail(name) {
  let end = name.length;
  while (end > 0 && !CLASS_END.test(name[end - 1])) end -= 1;
  return name.slice(0, end);
}

/**
 * Les classes que désigne un jeton — aucune, une, ou plusieurs pour un sélecteur composé.
 *
 * @param {string} token - un jeton du texte.
 * @returns {string[]}
 */
function classesOf(token) {
  if (!token.includes("-cmv-") || token.startsWith("--") || token.includes("*")) return [];
  const names = SELECTOR.test(token) ? token.split(".").map((part) => part.split(":")[0]) : [token];
  return names.map(withoutTail).filter((name) => name.includes("-cmv-"));
}

/** Chaque classe candidate d'un fichier, avec son `chemin:ligne` relatif au dépôt. */
function* classesIn(file) {
  const lines = readFileSync(file, "utf8").split("\n");
  for (const [index, line] of lines.entries()) {
    for (const token of line.split(SEPARATOR)) {
      for (const name of classesOf(token)) yield [name, `${relative(ROOT, file)}:${index + 1}`];
    }
  }
}

/**
 * Où apparaît chaque classe candidate.
 *
 * @param {string[]} files - chemins absolus.
 * @returns {Map<string, string[]>} classe → `chemin:ligne`.
 */
function candidatesIn(files) {
  const where = new Map();
  for (const file of files) {
    for (const [name, place] of classesIn(file)) {
      if (!where.has(name)) where.set(name, []);
      where.get(name).push(place);
    }
  }
  return where;
}

/**
 * Tailwind monté avec la config de l'app, chargée comme Tailwind la charge (TS, ESM ou CJS) : son
 * contexte, et les fichiers à lire.
 */
function tailwindOf(app) {
  const appDir = join(ROOT, "apps", app);
  const fromApp = createRequire(join(appDir, "package.json"));
  const loaded = fromApp("tailwindcss/loadConfig")(join(appDir, "tailwind.config.js"));
  const config = loaded.default ?? loaded;
  const { createContext } = fromApp("tailwindcss/lib/lib/setupContextUtils");
  const globs = [...config.content, ...APPS[app]].map((glob) => {
    if (typeof glob !== "string") throw new Error(`${app} : content non pris en charge, ${glob}`);
    return glob;
  });
  return {
    context: createContext(fromApp("tailwindcss/resolveConfig")(config)),
    files: globs.flatMap((glob) => globSync(glob, { cwd: appDir }).map((f) => join(appDir, f))),
  };
}

/** Classe → `chemin:ligne` de chaque classe des fichiers que Tailwind ne génère pas. */
function missingIn(context, files) {
  const where = candidatesIn(files);
  // Des fichiers qui ne se trouvent plus rendraient la garde verte sans qu'elle ait rien lu.
  if (where.size === 0) throw new Error("aucune classe cmv relevée : le relevé est cassé.");
  const rejected = context
    .getClassOrder([...where.keys()])
    .filter(([, order]) => order === null)
    .map(([name]) => name);
  return new Map(rejected.map((name) => [name, where.get(name)]));
}

/** Le banc : marques `✗ <classe>` contre signalements, sous la forme `chemin:ligne classe`. */
function benchHoldsFor(app, context) {
  const files = globSync("**/*", { cwd: join(FIXTURES, app), withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
  const expected = new Set();
  for (const file of files) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        for (const [, name] of line.matchAll(MARKER)) {
          expected.add(`${relative(ROOT, file)}:${index + 1} ${name}`);
        }
      });
  }
  const reported = new Set();
  for (const [name, places] of missingIn(context, files)) {
    for (const place of places) reported.add(`${place} ${name}`);
  }
  return benchHolds({
    name: `Banc des classes (${app})`,
    expected,
    reported,
    culprit: "la garde ne fait plus ce qu'elle dit (scripts/check-tokens.mjs).",
  });
}

function report(app, missing) {
  for (const [name, places] of missing) {
    console.error(`✗ ${name} — Tailwind n'en génère aucune règle (${app})`);
    for (const place of places) console.error(`    ${place}`);
    if (process.env.GITHUB_ACTIONS !== "true") continue;
    for (const place of places) {
      const [file, line] = place.split(":");
      const title = escapeProperty(`Classe inexistante : ${name}`);
      console.log(
        `::error file=${escapeProperty(file)},line=${line},title=${title}::${escapeData(
          "Aucun token @cmv/tokens ne lui correspond dans cette échelle.",
        )}`,
      );
    }
  }
}

function main() {
  const apps = Object.keys(APPS).map((app) => ({ app, ...tailwindOf(app) }));
  if (!apps.every(({ app, context }) => benchHoldsFor(app, context))) return 1;
  let failed = 0;
  for (const { app, context, files } of apps) {
    const missing = missingIn(context, files);
    report(app, missing);
    failed += missing.size;
  }
  if (failed > 0) {
    console.error(`\n${failed} classe(s) sans règle : corriger le token (@cmv/tokens).`);
    return 1;
  }
  console.log("Classes cmv : toutes générées par Tailwind, web et mobile.");
  return 0;
}

// La pile entière : si Tailwind déplace un module, c'est elle qui dit lequel et d'où.
try {
  process.exitCode = main();
} catch (error) {
  console.error(error.stack ?? error.message);
  process.exitCode = 2;
}
