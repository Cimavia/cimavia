import { z } from "zod";
import { PASSWORD_MAX_LENGTH } from "../auth";

/**
 * Supprimer son compte (#256) : le mot de passe, et rien d'autre. Tout compte connecté en a un —
 * l'e-mail et le mot de passe sont le seul moyen de connexion activé —, et une session ouverte ne
 * suffit pas : ce geste ne se rattrape pas, et elle peut avoir été laissée sur un appareil prêté.
 *
 * Borné comme à l'inscription : au-delà, le hachage coûterait pour un mot de passe qui ne peut pas
 * être le bon.
 */
export const eraseAccountSchema = z
  .object({ password: z.string().min(1).max(PASSWORD_MAX_LENGTH) })
  .strict();
export type EraseAccountInput = z.infer<typeof eraseAccountSchema>;
