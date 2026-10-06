import {
  type Adjustments,
  type ExerciseBlocks,
  imageMediaIds,
  remapImageMediaIds,
  type ScheduledSessionExerciseInput,
} from "@cmv/shared";
import type { Prisma, ScheduledSessionExerciseDocument } from "@prisma/client";
import type { TenantTx } from "../tenancy/tenancy.extension";
import {
  toAdjustmentsInput,
  toBlocksInput,
  toCustomMetricsInput,
  toInstructionsInput,
} from "../util/exercise-json.util";
import type { ExerciseRows } from "./scheduled-session.rows";

/**
 * Écriture de la composition d'une séance planifiée — le pendant du `scheduled-session.mapper`,
 * qui fait le trajet inverse (lignes → DTO).
 *
 * Les documents d'une ligne CRÉÉE arrivent **déjà résolus** par l'appelant, et c'est tout
 * l'intérêt de ce module : il y a DEUX sources possibles, et confondre les deux perdrait des
 * données.
 *  - créer une séance depuis un modèle, ou y ajouter un exercice → les documents viennent de la
 *    **bibliothèque** (`ExerciseDocument`, retrouvés par `sourceExerciseId`) ;
 *  - copier une semaine (#4) → ils viennent de l'**instance source**
 *    (`ScheduledSessionExerciseDocument`), car `sourceExerciseId` peut être passé à `null`
 *    (`SetNull`) si le coach a supprimé l'exercice de sa bibliothèque entre-temps. Repasser par
 *    la bibliothèque perdrait alors des documents que l'instance porte pourtant encore.
 *
 * Une ligne REPRISE à l'édition, elle, garde les siens sans les recopier (#296) : c'est ce qui
 * garde valides les images que sa consigne cite (cf. `rewriteScheduledSessionExercises`).
 */

/**
 * Une copie de document : la **même clé objet** que l'original, jamais un binaire dupliqué
 * (CONTEXT, « ScheduledSessionExercise — la copie, pas la référence »).
 *
 * `id` est celui du document SOURCE — pas celui de la copie. Il sert à remapper les images de la
 * consigne, qui référencent l'ancien identifiant (cf. `insertScheduledSessionExercises`).
 *
 * Dérivé de la LIGNE de destination, pas de son `UncheckedCreateInput` : ce dernier rend les
 * colonnes nullables *optionnelles*, ce qui sous `exactOptionalPropertyTypes` laisserait passer
 * un `undefined` là où la table attend `null`. Les deux sources (`ExerciseDocument` et
 * `ScheduledSessionExerciseDocument`) satisfont cette forme telles quelles.
 */
export type ScheduledSessionDocumentDraft = Pick<
  ScheduledSessionExerciseDocument,
  "id" | "type" | "usage" | "storagePath" | "url" | "fileName" | "mimeType"
>;

// Un exercice à créer, avec les documents que l'appelant lui a rattachés.
export type ScheduledSessionExerciseDraft = {
  exercise: ScheduledSessionExerciseInput;
  /** Absente = la référence est le dosage diffusé lui-même (cas d'un exercice ajouté ad hoc). */
  baseline?: ExerciseBlocks;
  /**
   * Les marqueurs REÇUS, référence de « Revenir au défaut » (#518) : ceux de la séance-type à la
   * diffusion, ceux de l'instance source à la copie de semaine, `[]` pour un exercice ajouté — sa
   * référence est son propre dosage, il n'a rien reçu. Obligatoire : chaque appelant le décide,
   * aucun défaut ne le décide à sa place.
   */
  baselineAdjustments: Adjustments;
  documents: readonly ScheduledSessionDocumentDraft[];
};

/**
 * Écrit la composition : un exercice par ligne, `position` = ordre du tableau (l'ordre DÉFINIT
 * les positions, comme pour la séance modèle), et ses documents recopiés.
 *
 * `athleteId` est passé explicitement : l'extension tenant n'injecte que le champ de l'ACTEUR
 * (ici `coachId`). Une copie inter-planification doit donc atterrir avec l'athlète du plan
 * CIBLE — le renseigner depuis la source ferait fuir une ligne dans le mauvais tenant.
 *
 * `null` est une valeur ATTENDUE (#144), pas une défaillance : composer un brouillon dont le
 * destinataire n'est pas encore choisi est le cas d'usage même. Coller depuis un cycle affecté
 * vers un brouillon libre doit donc poser `null` sur les copies — l'athlète de la source ne
 * traverse jamais.
 */
export async function insertScheduledSessionExercises(
  tx: TenantTx,
  scheduledSessionId: string,
  athleteId: string | null,
  drafts: readonly ScheduledSessionExerciseDraft[],
): Promise<void> {
  for (const [position, draft] of drafts.entries()) {
    await insertScheduledSessionExercise(tx, scheduledSessionId, athleteId, draft, position);
  }
}

/**
 * Réécrit la composition d'une séance EXISTANTE en gardant l'identité de ses lignes (#296, #311).
 *
 * Une ligne reprise est mise à jour en place, jamais détruite puis recréée : ce qui lui est
 * rattaché et que le client n'émet pas reste où il est. C'est le cas du SUIVI d'exécution, qui
 * appartient à l'athlète et qu'il coche en local contre l'identifiant de la ligne, et des
 * DOCUMENTS, dont la consigne cite les images par leur identifiant. Les recréer cassait les deux
 * sans un signal — et recopier depuis la bibliothèque perdait tout quand l'exercice d'origine en
 * avait été supprimé, laissant ses objets orphelins dans le bucket.
 *
 * `@@unique([scheduledSessionId, position])` mord PENDANT l'écriture : deux lignes qui échangent
 * leurs rangs se heurtent à la première mise à jour. D'où le garage, comme `writeDay` le fait pour
 * les séances d'une journée : les lignes reprises montent d'abord au-dessus de tout rang final,
 * puis chacune redescend au sien.
 */
export async function rewriteScheduledSessionExercises(
  tx: TenantTx,
  scheduledSessionId: string,
  athleteId: string | null,
  rows: ExerciseRows<ScheduledSessionExerciseInput>,
  documentsOf: (
    exercise: ScheduledSessionExerciseInput,
  ) => readonly ScheduledSessionDocumentDraft[],
): Promise<void> {
  if (rows.removedIds.length > 0) {
    // Les copies de documents partent en cascade ; les objets en storage appartiennent à la
    // bibliothèque et ne sont jamais touchés d'ici.
    await tx.scheduledSessionExercise.deleteMany({
      where: { scheduledSessionId, id: { in: rows.removedIds } },
    });
  }

  for (const [index, row] of rows.kept.entries()) {
    await tx.scheduledSessionExercise.update({
      where: { id: row.id },
      data: { position: rows.parking + index },
    });
  }

  for (const row of rows.kept) {
    await tx.scheduledSessionExercise.update({
      where: { id: row.id },
      // Ni `baseline`, ni `baselineAdjustments`, ni `tracking`, ni `sourceExerciseId` : la
      // référence est ce que la séance a diffusé, le suivi appartient à l'athlète, et l'origine est
      // une trace — rien de tout ça ne se réécrit depuis le panneau du coach.
      data: { ...snapshotOf(row.item), position: row.position },
    });
    // Remplacés et non fusionnés : la liste reçue EST la liste des tags de la ligne.
    await tx.scheduledSessionExerciseTag.deleteMany({
      where: { scheduledSessionExerciseId: row.id },
    });
    await insertTags(tx, row.id, athleteId, row.item.tags ?? []);
  }

  for (const row of rows.added) {
    await insertScheduledSessionExercise(
      tx,
      scheduledSessionId,
      athleteId,
      // Un exercice AJOUTÉ n'a rien reçu : sa référence est son propre dosage, sans marqueur.
      { exercise: row.item, baselineAdjustments: [], documents: documentsOf(row.item) },
      row.position,
    );
  }
}

/**
 * Ce qu'une ligne tient du panneau du coach — commun à la création et à la mise à jour, qui ne
 * doivent pas pouvoir diverger sur ce qu'elles écrivent.
 */
function snapshotOf(exercise: ScheduledSessionExerciseInput) {
  return {
    title: exercise.title,
    description: exercise.description ?? null,
    // Le snapshot porte la consigne et la structure, sinon une planif diffusée se dégrade :
    // l'athlète garderait le titre et perdrait ce qu'il doit faire.
    instructions: toInstructionsInput(exercise.instructions ?? null),
    blocks: toBlocksInput(exercise.blocks ?? []),
    adjustments: toAdjustmentsInput(exercise.adjustments ?? []),
    customMetrics: toCustomMetricsInput(exercise.customMetrics ?? []),
    note: exercise.note ?? null,
  };
}

async function insertScheduledSessionExercise(
  tx: TenantTx,
  scheduledSessionId: string,
  athleteId: string | null,
  draft: ScheduledSessionExerciseDraft,
  position: number,
): Promise<void> {
  // `tracking` n'est pas écrit : une ligne qui naît est NON SUIVIE, et c'est le défaut de la
  // colonne. Le suivi d'une ligne existante ne passe jamais par ici (cf. `rewrite…`).
  const created = await tx.scheduledSessionExercise.create({
    data: {
      ...snapshotOf(draft.exercise),
      athleteId,
      scheduledSessionId,
      sourceExerciseId: draft.exercise.sourceExerciseId ?? null,
      // La référence du niveau 3 est ce que la SÉANCE a diffusé, pas le contenu actuel de la
      // bibliothèque : « Tout réinitialiser » chez l'athlète doit revenir à ce qu'il a reçu.
      baseline: toBlocksInput(draft.baseline ?? draft.exercise.blocks ?? []),
      baselineAdjustments: toAdjustmentsInput(draft.baselineAdjustments),
      position,
    } satisfies Omit<
      Prisma.ScheduledSessionExerciseUncheckedCreateInput,
      "coachId"
    > as Prisma.ScheduledSessionExerciseUncheckedCreateInput,
  });

  await insertTags(tx, created.id, athleteId, draft.exercise.tags ?? []);
  await copyDocumentsAndRemapImages(tx, created.id, athleteId, draft);
}

async function insertTags(
  tx: TenantTx,
  scheduledSessionExerciseId: string,
  athleteId: string | null,
  tags: readonly string[],
): Promise<void> {
  if (tags.length === 0) return;
  await tx.scheduledSessionExerciseTag.createMany({
    data: tags.map((name) => ({
      athleteId,
      scheduledSessionExerciseId,
      name,
    })) satisfies Omit<
      Prisma.ScheduledSessionExerciseTagUncheckedCreateInput,
      "coachId"
    >[] as Prisma.ScheduledSessionExerciseTagUncheckedCreateInput[],
  });
}

/**
 * Recopie les documents d'un exercice et réaligne les images de sa consigne sur les nouvelles
 * copies.
 *
 * Extrait de la boucle d'écriture : mêlées, les deux responsabilités poussaient
 * `insertScheduledSessionExercises` au-delà du seuil de complexité de la porte qualité.
 */
async function copyDocumentsAndRemapImages(
  tx: TenantTx,
  scheduledSessionExerciseId: string,
  athleteId: string | null,
  draft: ScheduledSessionExerciseDraft,
): Promise<void> {
  if (draft.documents.length === 0) return;

  /**
   * Créés UN PAR UN et non en `createMany` : il faut connaître l'identifiant de chaque copie pour
   * remapper les images de la consigne, et `createMany` ne rend rien. Une poignée de documents par
   * exercice — le coût est nul devant le bug qu'il évite.
   */
  const idByOldId = new Map<string, string>();
  for (const document of draft.documents) {
    const copy = await tx.scheduledSessionExerciseDocument.create({
      data: {
        athleteId,
        scheduledSessionExerciseId,
        type: document.type,
        // Copié : sans lui, la planif diffusée listerait les images de consigne parmi les pièces
        // jointes de l'athlète.
        usage: document.usage,
        storagePath: document.storagePath,
        url: document.url,
        fileName: document.fileName,
        mimeType: document.mimeType,
      } satisfies Omit<
        Prisma.ScheduledSessionExerciseDocumentUncheckedCreateInput,
        "coachId"
      > as Prisma.ScheduledSessionExerciseDocumentUncheckedCreateInput,
    });
    idByOldId.set(document.id, copy.id);
  }

  /**
   * La consigne référence ses images par l'identifiant du document de la BIBLIOTHÈQUE. Les copies
   * en ont un neuf : sans ce remappage, les images de consigne ne désignent plus rien chez
   * l'athlète, et l'échec est SILENCIEUX — un média introuvable ne s'affiche pas, c'est tout.
   */
  const instructions = draft.exercise.instructions ?? null;
  if (instructions == null || imageMediaIds(instructions).length === 0) return;

  await tx.scheduledSessionExercise.update({
    where: { id: scheduledSessionExerciseId },
    data: { instructions: toInstructionsInput(remapImageMediaIds(instructions, idByOldId)) },
  });
}
