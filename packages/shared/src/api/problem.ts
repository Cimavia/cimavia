import { z } from "zod";

/**
 * Les erreurs de l'API suivent la RFC 9457 (Problem Details for HTTP APIs, #698) : un corps
 * `application/problem+json`. Le type de contenu EST le signal « l'API a écrit ce message » — ni
 * la page d'un proxy ni celle d'un portail captif ne le portent.
 *
 * Better Auth fait exception : ses routes répondent avant Nest, dans `{ code, message }`, que son
 * propre client lit (`docs/dette/livraison-et-deploiement.md`).
 */
export const PROBLEM_CONTENT_TYPE = "application/problem+json";

/** Le `type` d'un refus sans code : le statut HTTP dit déjà tout (RFC 9457, § 4.2.1). */
export const ABOUT_BLANK = "about:blank";

/**
 * Les codes de refus que les clients reconnaissent, en URN : la RFC admet un `type` non résoluble,
 * et c'est son rôle de dire de quel refus il s'agit. Chaque client les traduit — l'API n'envoie
 * pas de phrase à afficher pour eux.
 */
export const ProblemType = {
  /** 409 : l'élément a changé depuis que l'auteur l'a lu (#440). */
  STALE_WRITE: "urn:cimavia:problem:stale-write",
  /** 409 : on ne retire pas `isCoach` à qui a des athlètes rattachés. */
  ACTIVE_ATHLETES: "urn:cimavia:problem:active-athletes",
  /** 409 : on ne retire pas `isAthlete` à qui est rattaché à un coach. */
  ACTIVE_COACH: "urn:cimavia:problem:active-coach",
} as const;

export type ProblemType = (typeof ProblemType)[keyof typeof ProblemType];

/** Une erreur de champ : `pointer` est un JSON Pointer (RFC 6901) vers la valeur refusée. */
export const problemFieldErrorSchema = z.object({
  detail: z.string(),
  pointer: z.string(),
});

export type ProblemFieldError = z.infer<typeof problemFieldErrorSchema>;

export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  /** Extension : les refus d'une validation, un par champ. */
  errors: z.array(problemFieldErrorSchema).optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

/**
 * Le JSON Pointer d'un chemin de validation (`["blocks", 0, "name"]` → `#/blocks/0/name`). La racine
 * est `#`. `~` et `/` s'échappent en `~0` et `~1`.
 */
export function toJsonPointer(path: readonly PropertyKey[]): string {
  return path.reduce<string>(
    (pointer, key) => `${pointer}/${String(key).replaceAll("~", "~0").replaceAll("/", "~1")}`,
    "#",
  );
}
