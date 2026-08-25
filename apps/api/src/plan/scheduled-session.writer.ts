import type { ExerciseBlocks, ScheduledSessionExerciseInput } from "@cmv/shared";
import type { Prisma, ScheduledSessionExerciseDocument } from "@prisma/client";
import type { TenantTx } from "../tenancy/tenancy.extension";
import { toAdjustmentsInput, toBlocksInput, toInstructionsInput } from "../util/exercise-json.util";

/**
 * Écriture de la composition d'une séance planifiée — le pendant du `scheduled-session.mapper`,
 * qui fait le trajet inverse (lignes → DTO).
 *
 * Les documents arrivent **déjà résolus** par l'appelant, et c'est tout l'intérêt de ce module :
 * il y a DEUX sources possibles, et confondre les deux perdrait des données.
 *  - créer une séance depuis un modèle → les documents viennent de la **bibliothèque**
 *    (`ExerciseDocument`, retrouvés par `sourceExerciseId`) ;
 *  - copier une semaine (#4) → ils viennent de l'**instance source**
 *    (`ScheduledSessionExerciseDocument`), car `sourceExerciseId` peut être passé à `null`
 *    (`SetNull`) si le coach a supprimé l'exercice de sa bibliothèque entre-temps. Repasser par
 *    la bibliothèque perdrait alors des documents que l'instance porte pourtant encore.
 *
 * L'écriture, elle, est identique dans les deux cas — d'où ce point unique.
 */

/**
 * Une copie de document : la **même clé objet** que l'original, jamais un binaire dupliqué
 * (CONTEXT, « ScheduledSessionExercise — la copie, pas la référence »).
 *
 * Dérivé de la LIGNE de destination, pas de son `UncheckedCreateInput` : ce dernier rend les
 * colonnes nullables *optionnelles*, ce qui sous `exactOptionalPropertyTypes` laisserait passer
 * un `undefined` là où la table attend `null`. Les deux sources (`ExerciseDocument` et
 * `ScheduledSessionExerciseDocument`) satisfont cette forme telles quelles.
 */
export type ScheduledSessionDocumentDraft = Pick<
  ScheduledSessionExerciseDocument,
  "type" | "usage" | "storagePath" | "url" | "fileName" | "mimeType"
>;

// Un exercice à écrire, avec les documents que l'appelant lui a rattachés.
export type ScheduledSessionExerciseDraft = {
  exercise: ScheduledSessionExerciseInput;
  /** Absente = la référence est le dosage diffusé lui-même (cas d'un exercice ajouté ad hoc). */
  baseline?: ExerciseBlocks;
  documents: readonly ScheduledSessionDocumentDraft[];
};

/**
 * Écrit la composition : un exercice par ligne, `position` = ordre du tableau (l'ordre DÉFINIT
 * les positions, comme pour la séance modèle), et ses documents recopiés.
 *
 * `athleteId` est passé explicitement : l'extension tenant n'injecte que le champ de l'ACTEUR
 * (ici `coachId`). Une copie inter-planification doit donc atterrir avec l'athlète du plan
 * CIBLE — le renseigner depuis la source ferait fuir une ligne dans le mauvais tenant.
 */
export async function insertScheduledSessionExercises(
  tx: TenantTx,
  scheduledSessionId: string,
  athleteId: string,
  drafts: readonly ScheduledSessionExerciseDraft[],
): Promise<void> {
  for (const [position, draft] of drafts.entries()) {
    const created = await tx.scheduledSessionExercise.create({
      data: {
        athleteId,
        scheduledSessionId,
        sourceExerciseId: draft.exercise.sourceExerciseId ?? null,
        title: draft.exercise.title,
        description: draft.exercise.description ?? null,
        // Le snapshot porte la consigne et la structure, sinon une planif diffusée se dégrade :
        // l'athlète garderait le titre et perdrait ce qu'il doit faire.
        instructions: toInstructionsInput(draft.exercise.instructions ?? null),
        blocks: toBlocksInput(draft.exercise.blocks ?? []),
        // La référence du niveau 3 est ce que la SÉANCE a diffusé, pas le contenu actuel de la
        // bibliothèque : « Tout réinitialiser » chez l'athlète doit revenir à ce qu'il a reçu.
        baseline: toBlocksInput(draft.baseline ?? draft.exercise.blocks ?? []),
        adjustments: toAdjustmentsInput(draft.exercise.adjustments ?? []),
        note: draft.exercise.note ?? null,
        position,
      } satisfies Omit<
        Prisma.ScheduledSessionExerciseUncheckedCreateInput,
        "coachId"
      > as Prisma.ScheduledSessionExerciseUncheckedCreateInput,
    });

    const tags = draft.exercise.tags ?? [];
    if (tags.length > 0) {
      await tx.scheduledSessionExerciseTag.createMany({
        data: tags.map((name) => ({
          athleteId,
          scheduledSessionExerciseId: created.id,
          name,
        })) satisfies Omit<
          Prisma.ScheduledSessionExerciseTagUncheckedCreateInput,
          "coachId"
        >[] as Prisma.ScheduledSessionExerciseTagUncheckedCreateInput[],
      });
    }

    if (draft.documents.length === 0) continue;

    await tx.scheduledSessionExerciseDocument.createMany({
      data: draft.documents.map((document) => ({
        athleteId,
        scheduledSessionExerciseId: created.id,
        type: document.type,
        // Copié : sans lui, la planif diffusée listerait les images de consigne parmi les pièces
        // jointes de l'athlète.
        usage: document.usage,
        storagePath: document.storagePath,
        url: document.url,
        fileName: document.fileName,
        mimeType: document.mimeType,
      })) satisfies Omit<
        Prisma.ScheduledSessionExerciseDocumentUncheckedCreateInput,
        "coachId"
      >[] as Prisma.ScheduledSessionExerciseDocumentUncheckedCreateInput[],
    });
  }
}
