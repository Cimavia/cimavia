import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Phrase, PhraseTools } from "../src/util/phrase.util";
import { translatePhrase, translatePhrases } from "../src/util/phrase.util";

// Un i18next minimal branché sur le VRAI catalogue français : les règles de blocs (#715) rendent
// des clés, et c'est la phrase lue par l'athlète que la maquette décrit. Tester les clés seules
// laisserait passer une clé juste et un texte faux. Le catalogue web suffit : le nœud `block` est
// le même sur mobile, et `check:i18n` vérifie que chaque clé citée existe des deux côtés.

type Catalog = { [key: string]: string | Catalog };

const CATALOG_PATH = join("apps", "web", "src", "shared", "locale", "fr.json");

/**
 * Le catalogue se cherche en REMONTANT, pas par un chemin relatif fixe : Stryker (#626) rejoue les
 * tests depuis une copie du paquet, `.stryker-tmp/sandbox-…/`, deux dossiers plus bas. Le chemin
 * fixe y manquait le catalogue, et chaque test qui le lit y échouait : leurs mutants passaient
 * pour non couverts.
 */
function findCatalog(from: string): string {
  const candidate = join(from, CATALOG_PATH);
  if (existsSync(candidate)) return candidate;
  const parent = dirname(from);
  if (parent === from) throw new Error(`catalogue introuvable : ${CATALOG_PATH}`);
  return findCatalog(parent);
}

const catalog = JSON.parse(
  readFileSync(findCatalog(dirname(fileURLToPath(import.meta.url))), "utf8"),
) as Catalog;

function lookup(key: string): string | undefined {
  let node: string | Catalog | undefined = catalog;
  for (const part of key.split(".")) {
    node = typeof node === "object" ? node[part] : undefined;
  }
  return typeof node === "string" ? node : undefined;
}

/** Le pluriel français d'i18next : `_other` à partir de 2, la clé nue pour 0 et 1. */
function template(key: string, count: unknown): string {
  const plural = typeof count === "number" && count > 1 ? lookup(`${key}_other`) : undefined;
  const text = plural ?? lookup(key);
  if (text == null) throw new Error(`clé absente du catalogue : ${key}`);
  return text;
}

export const french: PhraseTools = {
  translate: (key, params) =>
    template(key, params.count).replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
      const value = params[name];
      if (value == null) throw new Error(`paramètre absent : ${name} (${key})`);
      return String(value);
    }),
  formatList: (items) => new Intl.ListFormat("fr", { type: "conjunction" }).format(items),
};

/** Ce qu'on lit : une phrase, ou des morceaux bout à bout. `null` reste `null`. */
export function say(phrase: Phrase | readonly Phrase[] | null): string | null {
  if (phrase == null) return null;
  return isList(phrase) ? translatePhrases(phrase, french) : translatePhrase(phrase, french);
}

function isList(phrase: Phrase | readonly Phrase[]): phrase is readonly Phrase[] {
  return Array.isArray(phrase);
}
