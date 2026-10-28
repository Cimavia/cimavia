import { z } from "zod";
import { blockGridSchema } from "./block-grid.schema";
import { expectedVersionSchema } from "./expected-version.schema";
import { COMPOSITION_MAX_SESSIONS } from "./scheduled-composition.schema";
import { BLOCK_MAX_EXERCISES, SESSION_MAX_BLOCKS } from "./session-block.schema";
import { structureSettingsSchema } from "./structure.schema";

// Les valeurs d'une séance planifiée, semaine par semaine (#721). Dosage est le seul endroit où le
// Coach les règle : les valeurs du bloc — tours, repos, temps — et la grille de chaque exercice.
// La composition, elle, ne s'y change pas (#720) : chaque copie renvoie ses blocs et ses exercices
// tels qu'elle les a lus, et le serveur refuse toute autre composition.

/** Un exercice de bloc, désigné par sa clé, et sa grille pour CET athlète. */
const dosageExerciseSchema = z.object({ key: z.string().min(1), grid: blockGridSchema }).strict();

/**
 * Un bloc, désigné par son identifiant, avec ses réglages. Seules leurs VALEURS bougent : leur
 * forme est verrouillée contre la référence stockée (`plannedLockIssues`).
 */
const dosageBlockSchema = z
  .object({
    id: z.string().min(1),
    settings: structureSettingsSchema,
    exercises: z.array(dosageExerciseSchema).min(1).max(BLOCK_MAX_EXERCISES),
  })
  .strict();

/** Une copie, sous la version que le Coach a lue (#604), et TOUS ses blocs, dans l'ordre. */
const dosageSessionSchema = z
  .object({
    id: z.string().min(1),
    expectedUpdatedAt: expectedVersionSchema,
    blocks: z.array(dosageBlockSchema).max(SESSION_MAX_BLOCKS),
  })
  .strict();
export type DosageSessionInput = z.infer<typeof dosageSessionSchema>;

/**
 * « Enregistrer » de Dosage : les copies dont une valeur a changé, en une écriture — et une seule
 * annonce à l'athlète si le Plan est diffusé (N-6).
 */
export const scheduledDosageInputSchema = z
  .object({ sessions: z.array(dosageSessionSchema).min(1).max(COMPOSITION_MAX_SESSIONS) })
  .strict()
  .refine(
    (input) => new Set(input.sessions.map((session) => session.id)).size === input.sessions.length,
    { message: "Une séance est citée deux fois." },
  );
export type ScheduledDosageInput = z.infer<typeof scheduledDosageInputSchema>;
