import type { core } from "zod";

/**
 * Les messages des refus de Zod qui n'en portent pas d'écrit par nous (#319).
 *
 * Passée à `safeParse`, cette table ne joue QUE là où le schéma n'a rien dit : un `.refine` ou un
 * `.regex(…, { message })` garde le sien, c'est la précédence de Zod 4. Sans elle, c'est le texte
 * par défaut de la bibliothèque, en anglais, qui remontait jusqu'au toast (« Too big: expected
 * string to have <=200 characters »).
 *
 * Elle vit côté API et non côté client parce que le client ne reçoit que `{ path, message }` : il
 * ne saurait pas distinguer un message écrit par nous d'un message de Zod. Le français suit donc le
 * régime de tous les refus de l'API — et le contrôle [F] de `check:i18n`, qui lit `apps/api/src`.
 *
 * Aucun nom de champ : le message se lit à côté du geste qui l'a produit, et les `maxLength` posés
 * sur les champs empêchent déjà le cas le plus courant.
 */

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

type Bound = { count: string; plural: boolean; inclusive: boolean };

const REQUIRED = "Ce champ est requis.";
const INVALID = "Valeur invalide.";

function elements(bound: Bound): string {
  return `${bound.count} ${bound.plural ? "éléments" : "élément"}`;
}

function characters(bound: Bound): string {
  return `${bound.count} ${bound.plural ? "caractères" : "caractère"}`;
}

// Les bornes d'un texte ou d'une liste sont toujours inclusives sous Zod 4 : seul un nombre connaît
// `lt` / `gt`.
const TOO_BIG: Record<string, (bound: Bound) => string> = {
  string: (bound) => `Ce texte dépasse ${characters(bound)}.`,
  array: (bound) => `Cette liste dépasse ${elements(bound)}.`,
  number: (bound) =>
    bound.inclusive
      ? `Cette valeur ne peut pas dépasser ${bound.count}.`
      : `Cette valeur doit rester sous ${bound.count}.`,
};

const TOO_SMALL: Record<string, (bound: Bound) => string> = {
  string: (bound) => `Ce texte doit faire au moins ${characters(bound)}.`,
  array: (bound) => `Cette liste doit compter au moins ${elements(bound)}.`,
  number: (bound) =>
    bound.inclusive
      ? `Cette valeur doit valoir au moins ${bound.count}.`
      : `Cette valeur doit dépasser ${bound.count}.`,
};

// `int` et `bigint` se disent comme un nombre, `set` comme une liste.
const ORIGIN_FAMILY: Record<string, string> = {
  string: "string",
  array: "array",
  set: "array",
  number: "number",
  int: "number",
  bigint: "number",
};

function bound(limit: number | bigint, inclusive: boolean | undefined): Bound {
  return {
    count: NUMBER_FORMAT.format(limit),
    plural: Number(limit) > 1,
    inclusive: inclusive !== false,
  };
}

function sizeMessage(
  table: Record<string, (bound: Bound) => string>,
  origin: string,
  limit: number | bigint,
  inclusive: boolean | undefined,
): string {
  const family = ORIGIN_FAMILY[origin];
  const message = family === undefined ? undefined : table[family];
  return message === undefined ? INVALID : message(bound(limit, inclusive));
}

export const frenchIssueMessage: core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case "too_big":
      return sizeMessage(TOO_BIG, issue.origin, issue.maximum, issue.inclusive);
    case "too_small":
      // Un texte vide refusé par `.min(1)` est un champ laissé vide, pas un texte « trop court ».
      if (issue.origin === "string" && Number(issue.minimum) === 1) {
        return REQUIRED;
      }
      return sizeMessage(TOO_SMALL, issue.origin, issue.minimum, issue.inclusive);
    case "invalid_type":
      return issue.input === undefined ? REQUIRED : INVALID;
    case "invalid_format":
      return issue.format === "email" ? "Cette adresse e-mail n'est pas valide." : INVALID;
    default:
      return INVALID;
  }
};
