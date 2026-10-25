/**
 * Une phrase à rendre : une clé i18next et ses paramètres. Le TEXTE reste dans les catalogues des
 * apps, la règle qui choisit la clé reste ici (#715).
 *
 * Un paramètre peut être lui-même une phrase — « un bip chaque minute » se compose de « un bip »
 * et de « chaque minute » — ou une liste de noms, que la langue du lecteur assemble (« A, B et C »).
 * Sans ces deux formes, chaque combinaison demandait sa propre clé, et le catalogue aurait porté
 * la combinatoire des réglages.
 *
 * ⚠️ Une phrase s'écrit en littéral, `{ key: "block.…", params }`, jamais par une fabrique :
 * `check:i18n` ne vérifie une clé contre les catalogues qu'à la position `key: "…"`.
 */
export type PhraseParam = string | number | readonly string[] | Phrase;

export type Phrase = {
  readonly key: string;
  readonly params: Readonly<Record<string, PhraseParam>>;
};

/**
 * Ce que l'app fournit pour rendre une phrase. INJECTÉ : `@cmv/shared` ne connaît pas i18next, et
 * chaque app a son instance (même dispositif que `metricLabel`).
 */
export type PhraseTools = {
  translate: (key: string, params: Readonly<Record<string, string | number>>) => string;
  formatList: (items: readonly string[]) => string;
};

/** La phrase, ses paramètres rendus d'abord. `count` reste un nombre : i18next en tire le pluriel. */
export function translatePhrase(phrase: Phrase, tools: PhraseTools): string {
  const params = Object.fromEntries(
    Object.entries(phrase.params).map(([name, value]) => [name, renderParam(value, tools)]),
  );
  return tools.translate(phrase.key, params);
}

/**
 * Des morceaux mis bout à bout, sans rien entre eux : la ponctuation est elle-même une phrase du
 * catalogue (« , », « à »), parce qu'elle change d'une langue à l'autre.
 */
export function translatePhrases(phrases: readonly Phrase[], tools: PhraseTools): string {
  return phrases.map((phrase) => translatePhrase(phrase, tools)).join("");
}

function renderParam(value: PhraseParam, tools: PhraseTools): string | number {
  if (typeof value === "string" || typeof value === "number") return value;
  if (isPhrase(value)) return translatePhrase(value, tools);
  return tools.formatList(value);
}

function isPhrase(value: Phrase | readonly string[]): value is Phrase {
  return !Array.isArray(value);
}
