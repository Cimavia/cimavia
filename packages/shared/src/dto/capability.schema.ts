import { z } from "zod";

/**
 * Modification des capacités d'un compte après l'inscription (#13) — un athlète qui se met à
 * coacher, un coach qui cesse de l'être.
 *
 * Les deux drapeaux sont **requis** : c'est l'état visé du compte, pas un delta. Un PATCH partiel
 * obligerait le serveur à fusionner avec l'existant pour vérifier « au moins une », donc à traiter
 * un champ absent comme « inchangé » — et deux clients qui décochent chacun une case en même temps
 * pourraient laisser le compte sans aucune capacité.
 *
 * `refine` plutôt qu'une garde de service : la règle est la même qu'à l'inscription, et
 * `architecture-choice.md` veut les contraintes dans le schéma — appliquées par le pipe (400
 * automatique) et réutilisables par les deux clients.
 */
export const updateCapabilitiesSchema = z
  .object({
    isCoach: z.boolean(),
    isAthlete: z.boolean(),
  })
  .strict()
  .refine((input) => input.isCoach || input.isAthlete, {
    message: "au moins une capacité requise",
    path: ["isCoach"],
  });

export type UpdateCapabilitiesInput = z.infer<typeof updateCapabilitiesSchema>;

/**
 * Ce qui EMPÊCHE de retirer une capacité — la relation, jamais la donnée produite.
 *
 * Un coach sans athlète actif peut redevenir simple athlète même s'il garde une bibliothèque et
 * des cycles : rien n'est supprimé, ils redeviennent visibles s'il réactive la capacité. Bloquer
 * là-dessus coincerait quiconque a seulement essayé l'application. L'avertissement est le rôle de
 * l'UI, pas celui d'un refus.
 */
export const CapabilityBlocker = {
  /** `isCoach` : des athlètes lui sont rattachés. */
  ACTIVE_ATHLETES: "ACTIVE_ATHLETES",
  /** `isAthlete` : il est rattaché à un coach. */
  ACTIVE_COACH: "ACTIVE_COACH",
} as const;

export type CapabilityBlocker = (typeof CapabilityBlocker)[keyof typeof CapabilityBlocker];
