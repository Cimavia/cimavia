#!/usr/bin/env node
/**
 * Vérifie les clés i18n contre les catalogues (#115).
 *
 * POURQUOI ce script existe : une clé écrite en dur est vue par TypeScript et par i18next. Une clé
 * ASSEMBLÉE ne l'est par personne.
 *
 *     t(`reminder.toast.${reminder.status}`)
 *
 * Renommer `reminder.toast.DONE`, ou ajouter une valeur à `ReminderStatus` sans clé correspondante :
 * typecheck vert, tests verts, lint vert — et l'UI affiche `reminder.toast.ARCHIVED` en clair, en
 * production. Ce script est le seul filet sous cette famille de bugs.
 *
 * CE QU'IL VÉRIFIE
 *   A. Clés littérales — `t("a.b")`, `labelKey: "a.b"`, `toast.onSuccess("a.b")`, et les tables
 *      partagées `const X_KEY = { … }` de @cmv/shared.
 *   B. Préfixes dynamiques — t(`a.b.${x}`) : le nœud `a.b` doit exister et porter des enfants.
 *   C. Motifs à trou — t(`a.b.${x}.title`) : CHAQUE enfant de `a.b` doit porter `title`.
 *   D. Suffixes sur préfixe variable — t(`${labelPrefix}.remove`) : le suffixe doit exister sous
 *      chaque valeur littérale affectée à cette variable (elles sont passées en dur, cf.
 *      `SessionBuilder` / `ScheduledSessionPanel`).
 *   E. Clés mortes — présentes au catalogue, mentionnées nulle part (non bloquant sans `--strict`).
 *
 * CE QU'IL NE PEUT PAS VÉRIFIER : les valeurs derrière `${x}` en B, qui viennent d'un enum au
 * runtime. B garantit que le nœud parent existe ; C et D vont plus loin quand la forme le permet.
 * Les préfixes dynamiques sont donc listés en fin de rapport, pour relecture humaine.
 *
 * Chaque app a son catalogue ; `packages/shared` est analysé avec LES DEUX, puisque ses tables
 * (`NOTIFICATION_LABEL_KEY`…) sont rendues par les deux clients.
 *
 * Usage : `pnpm check:i18n` — ajouter `--strict` pour que les clés mortes fassent échouer aussi.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHARED = "packages/shared/src";

const TARGETS = [
  { app: "web", catalog: "apps/web/src/shared/locale/fr.json", sources: ["apps/web/src", SHARED] },
  {
    app: "mobile",
    catalog: "apps/mobile/shared/locale/fr.json",
    sources: ["apps/mobile/app", "apps/mobile/feature", "apps/mobile/shared", SHARED],
  },
];

// i18next résout `key_other` depuis `key` : ces variantes ne sont jamais citées par le code, et ne
// sont pas mortes pour autant.
const PLURAL_SUFFIXES = ["_zero", "_one", "_two", "_few", "_many", "_other"];

// Une chaîne qui a la FORME d'une clé. Ne dit pas que c'en est une — cf. l'asymétrie ci-dessous.
const KEY_SHAPE = /^[a-z]\w*(?:\.\w+)+$/;
const QUOTED = /["'`]([\w.]+)["'`]/g;
const TEMPLATE = /`([^`]*)`/g;

// ── Extraction ───────────────────────────────────────────────────────────────

function sourceFiles(dirs) {
  return dirs
    .flatMap((dir) => {
      const out = execSync(
        String.raw`find ${resolve(ROOT, dir)} -type f \( -name '*.ts' -o -name '*.tsx' \)`,
        { encoding: "utf8" },
      );
      return out.trim().split("\n").filter(Boolean);
    })
    .filter((file) => !/\.test\.tsx?$/.test(file));
}

// Toute chaîne en forme de clé, où qu'elle soit. Sert UNIQUEMENT au contrôle E.
function collectMentions(src, mentioned) {
  for (const [, value] of src.matchAll(QUOTED)) {
    if (KEY_SHAPE.test(value)) mentioned.add(value);
  }
}

/**
 * Clés lues à une position qui ne laisse aucun doute : argument direct de `t()`, champ `*Key`,
 * argument de toast, valeur d'une table `X_KEY` / `X_BADGE` partagée. Une clé absente du catalogue
 * y est une ERREUR.
 */
function collectLiterals(src, literals) {
  const add = (value) => {
    if (KEY_SHAPE.test(value)) literals.add(value);
  };
  for (const [, v] of src.matchAll(/\bt\(\s*"([\w.]+)"/g)) add(v);
  for (const [, v] of src.matchAll(/\b\w*[Kk]ey\s*:\s*"([\w.]+)"/g)) add(v);
  for (const [, v] of src.matchAll(/\bon(?:Success|Info)\(\s*"([\w.]+)"/g)) add(v);
  for (const [, body] of src.matchAll(/const\s+[A-Z0-9_]*(?:KEY|BADGE)\s*=\s*\{([\s\S]*?)\n\}/g)) {
    for (const [, v] of body.matchAll(/"([\w.]+)"/g)) add(v);
  }
}

const PREFIX_NAME = /[Pp]refix$/;

/**
 * Les valeurs attendues derrière un trou, DÉCLARÉES à côté de leur usage :
 *
 *     // i18n-values reminder.toast: ReminderStatus, created
 *     toast.onSuccess(`reminder.toast.${reminder.status}`)
 *
 * Sans elles, ce script ne vérifiait que l'existence du NŒUD parent — et laissait donc passer
 * exactement le bug qu'il existe pour attraper : renommer `reminder.toast.DONE` en `ARCHIVED` garde
 * un nœud à quatre enfants, et rien ne bronchait.
 *
 * Chaque terme est soit un enum (`export const X = {…} as const`, résolu par le registre), soit une
 * valeur littérale — `messages.preview` n'accepte que trois des quatre `MessageType`, un message
 * TEXTE portant son propre aperçu.
 *
 * Déclarer plutôt que deviner : inférer l'enum depuis `${reminder.status}` demanderait le typage
 * complet, et une heuristique se tromperait en silence — soit le défaut qu'on corrige ici.
 */
const ANNOTATION = /i18n-values\s+([\w.]+)\s*:\s*([^\n*]+)/g;

// `export const X = { A: "A" } as const` et `const Y = ["a", "b"] as const` : les deux formes qui
// portent un ensemble de valeurs dans ce dépôt.
const CONST_ENUM = /(?:export\s+)?const\s+(\w+)\s*=\s*([{[])([\s\S]*?)[}\]]\s*as const/g;

// Les littéraux affectés à une variable de préfixe (`labelPrefix="library.session"`), qui rendent
// le contrôle D possible : sans eux, `${labelPrefix}` serait indéchiffrable.
function collectPrefixLiterals(src, prefixLiterals) {
  for (const [, name, value] of src.matchAll(/(\w+)\s*=\s*"([\w.]+)"/g)) {
    if (!PREFIX_NAME.test(name) || !KEY_SHAPE.test(value)) continue;
    if (!prefixLiterals.has(name)) prefixLiterals.set(name, new Set());
    prefixLiterals.get(name).add(value);
  }
}

/**
 * À quelle forme de clé ce gabarit correspond-il, s'il en est une ? Le tri se fait sur la FORME,
 * pas sur l'appelant — un gabarit d'URL ou de classe CSS ne ressemble pas à une clé.
 */
function classifyTemplate(template) {
  if (!template.includes("${")) return null;

  const head = template.slice(0, template.indexOf("${"));
  const suffix = template.slice(template.lastIndexOf("}") + 1).replace(/^\./, "");
  if (!/^[\w.]*$/.test(suffix)) return null;

  if (head === "") {
    // `${var}.suffix` — seule une variable NOMMÉE « …Prefix » est retenue : sinon `${count}px`
    // passerait pour une clé.
    const name = /^\$\{\s*(\w+)\s*\}/.exec(template)?.[1];
    if (name == null || suffix === "" || !PREFIX_NAME.test(name)) return null;
    return { kind: "variable", name, suffix };
  }

  if (!/^[a-z]\w*(?:\.\w+)*\.$/.test(head)) return null;
  return { kind: "prefix", name: head.slice(0, -1), suffix };
}

/**
 * On lit TOUS les gabarits, pas seulement ceux passés à `t()` :
 * ``toast.onSuccess(`reminder.toast.${status}`)`` en est un, et c'est précisément celui qui cassait
 * en silence.
 */
function collectTemplates(src, dynamicPrefixes, variablePrefixes) {
  for (const [, template] of src.matchAll(TEMPLATE)) {
    const found = classifyTemplate(template);
    if (found == null) continue;

    const into = found.kind === "variable" ? variablePrefixes : dynamicPrefixes;
    if (!into.has(found.name)) into.set(found.name, new Set());
    if (found.suffix !== "") into.get(found.name).add(found.suffix);
  }
}

/**
 * Deux niveaux de certitude, et c'est délibéré : strict pour ACCUSER (`literals`), permissif pour
 * DISCULPER (`mentioned`). L'inverse produirait soit des faux positifs bloquants, soit un contrôle
 * qui ne trouve rien. `mentioned` rattrape les chemins que ce script ne sait pas lire — ternaire
 * (`isEditing ? "a.submitEdit" : "a.submitCreate"`), helper local (`done("a.b")`), clé portée par
 * une erreur (`new MediaRejectedError("messages.media.imageTooBig")`).
 */
// Registre des ensembles de valeurs : `nom → {valeurs}`.
function collectEnums(src, enums) {
  for (const [, name, , body] of src.matchAll(CONST_ENUM)) {
    const values = [...body.matchAll(/"([^"]+)"/g)].map(([, value]) => value);
    // Un objet porte des VALEURS (`A: "A"`), un tableau des éléments : dans les deux cas ce sont
    // les chaînes entre guillemets, les clés d'objet du dépôt n'en portant pas.
    // Objet (`A: "A"`) comme tableau (`["a"]`) : ce sont les chaînes entre guillemets dans les deux
    // cas — les clés d'objet du dépôt n'en portent pas.
    // Union plutôt qu'écrasement si deux fichiers déclarent le même nom : une union peut exiger une
    // clé de trop (erreur VISIBLE), un écrasement en oublierait une en silence.
    if (values.length === 0) continue;
    const known = enums.get(name) ?? new Set();
    for (const value of values) known.add(value);
    enums.set(name, known);
  }
}

function collectAnnotations(src, annotations) {
  for (const [, prefix, list] of src.matchAll(ANNOTATION)) {
    const terms = list
      .split(",")
      .map((term) => term.trim())
      .filter(Boolean);
    if (terms.length > 0) annotations.set(prefix, terms);
  }
}

function extract(files) {
  const literals = new Set();
  const mentioned = new Set();
  const dynamicPrefixes = new Map();
  const variablePrefixes = new Map();
  const prefixLiterals = new Map();
  const enums = new Map();
  const annotations = new Map();

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    collectMentions(src, mentioned);
    collectLiterals(src, literals);
    collectPrefixLiterals(src, prefixLiterals);
    collectTemplates(src, dynamicPrefixes, variablePrefixes);
    collectEnums(src, enums);
    collectAnnotations(src, annotations);
  }

  return {
    literals,
    mentioned,
    dynamicPrefixes,
    variablePrefixes,
    prefixLiterals,
    enums,
    annotations,
  };
}

// Un terme d'annotation est soit un enum du registre, soit une valeur littérale.
function resolveExpected(terms, enums) {
  const values = new Set();
  for (const term of terms) {
    const fromEnum = enums.get(term);
    if (fromEnum == null) values.add(term);
    else for (const value of fromEnum) values.add(value);
  }
  return values;
}

// ── Catalogue ────────────────────────────────────────────────────────────────

function nodeAt(catalog, key) {
  return key.split(".").reduce((node, part) => (node == null ? undefined : node[part]), catalog);
}

function isLeaf(catalog, key) {
  return typeof nodeAt(catalog, key) === "string";
}

function leafKeys(node, prefix = "") {
  if (typeof node === "string") return [prefix];
  return Object.entries(node).flatMap(([part, child]) =>
    leafKeys(child, prefix === "" ? part : `${prefix}.${part}`),
  );
}

// ── Contrôles ────────────────────────────────────────────────────────────────

function checkLiterals(catalog, literals, errors) {
  for (const key of literals) {
    if (!isLeaf(catalog, key)) errors.push(`[A] clé absente : ${key}`);
  }
}

/**
 * Les enfants d'un nœud à trou : les valeurs ANNONCÉES par l'annotation quand il y en a une — c'est
 * elle qui rend le contrôle réel — sinon les enfants présents au catalogue, ce qui ne vérifie plus
 * que la forme des sous-clés.
 */
function expectedChildren(node, prefix, annotations, enums, unverified) {
  const terms = annotations.get(prefix);
  if (terms == null) {
    unverified.push(prefix);
    return Object.keys(node);
  }
  return [...resolveExpected(terms, enums)];
}

// Une valeur attendue derrière le trou : soit une feuille (`a.b.VALEUR`), soit un sous-arbre dont
// on vérifie chaque suffixe (`a.b.VALEUR.title`).
function checkChild(catalog, prefix, child, suffixes, errors, reachable) {
  if (suffixes.size === 0) {
    const key = `${prefix}.${child}`;
    reachable.add(key);
    if (!isLeaf(catalog, key)) errors.push(`[B] clé absente : ${key}`);
    return;
  }
  for (const suffix of suffixes) {
    const key = `${prefix}.${child}.${suffix}`;
    reachable.add(key);
    if (!isLeaf(catalog, key)) errors.push(`[C] clé absente : ${key}`);
  }
}

function checkDynamicPrefixes(catalog, found, errors, reachable, unverified) {
  for (const [prefix, suffixes] of found.dynamicPrefixes) {
    const node = nodeAt(catalog, prefix);
    if (node == null || typeof node !== "object") {
      errors.push(`[B] préfixe dynamique absent : ${prefix}.\${…}`);
      continue;
    }
    const children = expectedChildren(node, prefix, found.annotations, found.enums, unverified);
    for (const child of children) {
      checkChild(catalog, prefix, child, suffixes, errors, reachable);
    }
  }
}

function checkSuffixesUnder(catalog, prefix, suffixes, errors, reachable) {
  for (const suffix of suffixes) {
    const key = `${prefix}.${suffix}`;
    reachable.add(key);
    if (!isLeaf(catalog, key)) errors.push(`[D] clé absente : ${key}`);
  }
}

function checkVariablePrefixes(catalog, variablePrefixes, prefixLiterals, errors, reachable) {
  for (const [name, suffixes] of variablePrefixes) {
    const prefixes = prefixLiterals.get(name);
    if (prefixes == null) {
      errors.push(`[D] préfixe variable non résolu : \${${name}} (aucun littéral trouvé)`);
      continue;
    }
    for (const prefix of prefixes) {
      checkSuffixesUnder(catalog, prefix, suffixes, errors, reachable);
    }
  }
}

function findDeadKeys(catalog, reachable) {
  return leafKeys(catalog).filter((key) => {
    if (reachable.has(key)) return false;
    const plural = PLURAL_SUFFIXES.find((suffix) => key.endsWith(suffix));
    return plural == null || !reachable.has(key.slice(0, -plural.length));
  });
}

function check({ app, catalog: catalogPath, sources }) {
  const catalog = JSON.parse(readFileSync(resolve(ROOT, catalogPath), "utf8"));
  const found = extract(sourceFiles(sources));
  const errors = [];
  const reachable = new Set([...found.literals, ...found.mentioned]);

  const unverified = [];

  checkLiterals(catalog, found.literals, errors);
  checkDynamicPrefixes(catalog, found, errors, reachable, unverified);
  checkVariablePrefixes(catalog, found.variablePrefixes, found.prefixLiterals, errors, reachable);

  return { app, errors, dead: findDeadKeys(catalog, reachable), unverified };
}

// ── Rapport ──────────────────────────────────────────────────────────────────

const strict = process.argv.includes("--strict");
let failed = false;

for (const target of TARGETS) {
  const { app, errors, dead, unverified } = check(target);
  console.log(`\n=== ${app} ===`);

  if (errors.length === 0) {
    console.log("clés référencées : toutes présentes ✅");
  } else {
    failed = true;
    for (const error of errors) console.log(`❌ ${error}`);
  }

  if (dead.length > 0) {
    if (strict) failed = true;
    console.log(`\n${strict ? "❌" : "⚠️ "} clés jamais mentionnées (${dead.length}) :`);
    for (const key of dead) console.log(`   ${key}`);
  }

  if (unverified.length > 0) {
    if (strict) failed = true;
    const names = [...new Set(unverified)].sort((a, b) => a.localeCompare(b));
    console.log(
      `\n${strict ? "❌" : "⚠️ "} préfixes sans annotation \`i18n-values\` (valeurs non vérifiées) :`,
    );
    for (const name of names) console.log(`   ${name}.\${…}`);
  }
}

process.exit(failed ? 1 : 0);
