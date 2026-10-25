import { z } from "zod";
import { BLOCK_MAX_EXERCISES } from "./session-block.schema";
import { STRUCTURE_MAX_ROUNDS } from "./structure.schema";

// Le suivi coché d'un bloc de séance (#715). Ce qui est coché remonte au Coach avec le débrief ;
// le temps réalisé et le score d'un bloc ne sont pas enregistrés (#725).

/**
 * Le plus de cases qu'un bloc puisse donner : un tour par exercice, au plus de tours et
 * d'exercices. « Un seul par bip » en donne une par bip, « une seule fois » une par exercice —
 * toujours moins.
 */
export const BLOCK_MAX_CHECKS = STRUCTURE_MAX_ROUNDS * BLOCK_MAX_EXERCISES;

const checkIndexSchema = z.number().int().nonnegative();

/**
 * Les cases cochées, en indices à plat, rangée après rangée (`blockChecks`). `null` en base veut
 * dire NON SUIVI, ce qui n'est pas « rien coché ».
 *
 * C'est le schéma de RELECTURE : il ne borne rien, pour qu'un suivi déjà stocké qui dépasserait
 * une borne posée après coup ne fasse pas échouer la lecture de toute la séance (cf. #297). Pour la
 * même raison il n'est pas strict : un champ ajouté plus tard est retiré de la lecture, pas
 * refusé. Rien ne réécrit le suivi depuis cette lecture : un envoi passe par le schéma d'envoi.
 */
export const sessionBlockTrackingSchema = z.object({ checked: z.array(checkIndexSchema) });
export type SessionBlockTracking = z.infer<typeof sessionBlockTrackingSchema>;

/**
 * Le suivi tel qu'un débrief l'ENVOIE : chaque case une seule fois, dans la borne de tout bloc. La
 * borne du bloc lui-même — son nombre de cases — se vérifie avec ses réglages
 * (`trackingFitsBlock`).
 */
export const sessionBlockTrackingInputSchema = z
  .object({
    checked: z
      .array(checkIndexSchema.max(BLOCK_MAX_CHECKS - 1))
      .max(BLOCK_MAX_CHECKS)
      .refine((checked) => new Set(checked).size === checked.length, {
        message: "Une case ne peut être cochée qu'une fois.",
      }),
  })
  .strict();
