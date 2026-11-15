import {
  type BlockGrid,
  type CompositionOrigin,
  type CustomMetric,
  imageMediaIds,
  type RichDocument,
  remapImageMediaIds,
  required,
  type ScheduledSessionBlockDto,
} from "@cmv/shared";
import type { Prisma, ScheduledSessionExerciseDocument } from "@prisma/client";
import { blockContentOf } from "../session/session-block.mapper";
import { toBlockContentData } from "../session/session-block.writer";
import type { TenantTx } from "../tenancy/tenancy.extension";
import { toJsonInput } from "../util/block-json.util";
import { toCustomMetricsInput, toInstructionsInput } from "../util/exercise-json.util";
import { withoutUncitedImages } from "../util/instruction-images.util";

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
 * Une ligne GARDÉE par la composition, elle, garde les siens sans les recopier (#296) : c'est ce
 * qui garde valides les images que sa consigne cite (cf. `rewriteScheduledComposition`).
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

/**
 * Ce qu'une ligne copie de son exercice : un instantané, que l'affichage d'une planif diffusée lit
 * sans jamais remonter à la bibliothèque.
 */
export type ScheduledExerciseSnapshot = {
  sourceExerciseId: string | null;
  title: string;
  description: string | null;
  instructions: RichDocument | null;
  /** Les métriques maison que cite sa grille, définitions comprises (décision P3). */
  customMetrics: readonly CustomMetric[];
  tags: readonly string[];
  note: string | null;
};

// Un exercice à créer, avec les documents que l'appelant lui a rattachés et sa place de bloc.
export type ScheduledSessionExerciseDraft = {
  exercise: ScheduledExerciseSnapshot;
  documents: readonly ScheduledSessionDocumentDraft[];
  placement: BlockPlacementDraft;
};

/**
 * Un bloc de séance planifiée à écrire (#716) : ses champs, et la référence qu'il a reçue. Ni
 * identifiant, ni suivi : le bloc naît sous un identifiant neuf, et NON SUIVI.
 */
export type ScheduledBlockDraft = Omit<ScheduledSessionBlockDto, "id" | "tracking" | "exercises">;

/** La place d'un exercice dans son bloc — `block` : le rang du bloc parmi ceux à écrire. */
export type BlockPlacementDraft = {
  block: number;
  blockPosition: number;
  key: string;
  grid: BlockGrid;
  origin: CompositionOrigin;
  replacesKey: string | null;
};

/**
 * Écrit la composition : un exercice par ligne, `position` = ordre du tableau (l'ordre DÉFINIT
 * les positions, comme pour la séance modèle), et ses documents recopiés.
 *
 * `athleteId` est passé explicitement : l'extension tenant n'injecte que le propriétaire,
 * `coachId`, repris du parent (#603). Une copie inter-planification doit donc atterrir avec l'athlète du plan
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
  blocks: readonly ScheduledBlockDraft[],
): Promise<void> {
  const blockIds = await insertScheduledBlocks(tx, scheduledSessionId, athleteId, blocks);
  for (const [position, draft] of drafts.entries()) {
    await insertScheduledSessionExercise(
      tx,
      scheduledSessionId,
      athleteId,
      draft,
      position,
      blockIds,
    );
  }
}

/** Les blocs d'abord : leurs exercices s'y rangent par identifiant. */
async function insertScheduledBlocks(
  tx: TenantTx,
  scheduledSessionId: string,
  athleteId: string | null,
  blocks: readonly ScheduledBlockDraft[],
): Promise<string[]> {
  const created = await Promise.all(
    blocks.map((block, position) =>
      tx.scheduledSessionBlock.create({
        // coachId injecté par la couche d'isolation ; athleteId explicite, comme pour les lignes.
        data: {
          athleteId,
          scheduledSessionId,
          position,
          ...toBlockContentData(block),
          baseline: toJsonInput(block.baseline),
        } satisfies Omit<
          Prisma.ScheduledSessionBlockUncheckedCreateInput,
          "coachId"
        > as Prisma.ScheduledSessionBlockUncheckedCreateInput,
        select: { id: true },
      }),
    ),
  );
  return created.map((block) => block.id);
}

/**
 * Les blocs d'une séance planifiée recopiés tels quels (copie de semaine, #4) : leur contenu, leur
 * référence reçue, et la place de chaque ligne — origine comprise. Ce que la copie a reçu de la
 * séance-type, elle le garde ; le suivi, lui, reste à l'athlète de la source.
 */
export function copiedBlocksOf(blocks: readonly ScheduledSessionBlockDto[]): {
  blocks: ScheduledBlockDraft[];
  placements: ReadonlyMap<string, BlockPlacementDraft>;
} {
  const placements = new Map(
    blocks.flatMap((block, index) =>
      block.exercises.map((exercise, blockPosition): [string, BlockPlacementDraft] => [
        exercise.id,
        {
          block: index,
          blockPosition,
          key: exercise.key,
          grid: exercise.grid,
          origin: exercise.origin.kind,
          replacesKey: "replacesKey" in exercise.origin ? exercise.origin.replacesKey : null,
        },
      ]),
    ),
  );
  return {
    blocks: blocks.map((block) => ({ ...blockContentOf(block), baseline: block.baseline })),
    placements,
  };
}

/** Les colonnes de bloc d'une ligne ; `replacesKey` pour un remplaçant seulement (CHECK). */
function placementColumns(placement: BlockPlacementDraft, blockIds: readonly string[]) {
  return {
    blockId: required(blockIds[placement.block], `[plan] bloc ${placement.block} non écrit`),
    blockPosition: placement.blockPosition,
    key: placement.key,
    grid: toJsonInput(placement.grid),
    origin: placement.origin,
    replacesKey: placement.replacesKey,
  };
}

/** Un exercice de bloc tel que la composition le veut (#720) ; `exerciseId` pour celui qu'elle place. */
export type ComposedRow = {
  key: string;
  origin: ScheduledSessionBlockDto["exercises"][number]["origin"];
  note: string | null;
  grid: BlockGrid;
  exerciseId?: string;
};

/**
 * Récrit la composition par blocs d'une séance planifiée (#720), sans toucher ses blocs : leur
 * suivi reste, comme la `baseline` reçue. Une ligne dont la clé reste est GARDÉE et ne fait que
 * changer de rang — son suivi, ses documents et ses valeurs avec. Une clé qui part emporte sa
 * ligne ; une clé neuve naît du contenu que `draftOf` lui donne.
 *
 * `@@unique([scheduledSessionId, position])` mord PENDANT l'écriture : deux lignes qui échangent
 * leurs rangs se heurtent à la première mise à jour. D'où le garage, comme `writeDay` le fait pour
 * les séances d'une journée : `parking` dépasse tout rang occupé, dans la séance comme dans un
 * bloc ; les lignes gardées y montent d'abord, puis chacune redescend au sien.
 */
export async function rewriteScheduledComposition(
  tx: TenantTx,
  session: { id: string; athleteId: string | null; parking: number },
  blockIds: readonly string[],
  stored: readonly { id: string; key: string }[],
  blocks: readonly { exercises: readonly ComposedRow[] }[],
  draftOf: (
    row: ComposedRow & { exerciseId: string },
  ) => Omit<ScheduledSessionExerciseDraft, "placement">,
): Promise<void> {
  const final = blocks.flatMap((block, blockIndex) =>
    block.exercises.map((row, blockPosition) => ({ row, blockIndex, blockPosition })),
  );
  const idOf = new Map(stored.map((line) => [line.key, line.id]));
  const finalKeys = new Set(final.map(({ row }) => row.key));
  const kept = final.flatMap((place, position) => {
    const id = idOf.get(place.row.key);
    return id === undefined ? [] : [{ ...place, id, position }];
  });

  for (const [index, { id }] of kept.entries()) {
    const parked = session.parking + index;
    await tx.scheduledSessionExercise.update({
      where: { id },
      data: { position: parked, blockPosition: parked },
    });
  }
  const removedIds = stored.filter((line) => !finalKeys.has(line.key)).map((line) => line.id);
  if (removedIds.length > 0) {
    // Ses copies de documents partent en cascade ; les objets restent à la bibliothèque.
    await tx.scheduledSessionExercise.deleteMany({
      where: { scheduledSessionId: session.id, id: { in: removedIds } },
    });
  }
  for (const place of kept) {
    await tx.scheduledSessionExercise.update({
      where: { id: place.id },
      data: {
        position: place.position,
        blockId: required(blockIds[place.blockIndex], `[plan] bloc ${place.blockIndex} absent`),
        blockPosition: place.blockPosition,
      },
    });
  }

  for (const [position, { row, blockIndex, blockPosition }] of final.entries()) {
    if (idOf.has(row.key)) continue;
    const exerciseId = required(row.exerciseId, `[plan] l'exercice ${row.key} sans source`);
    await insertScheduledSessionExercise(
      tx,
      session.id,
      session.athleteId,
      {
        ...draftOf({ ...row, exerciseId }),
        placement: {
          block: blockIndex,
          blockPosition,
          key: row.key,
          grid: row.grid,
          origin: row.origin.kind,
          replacesKey: "replacesKey" in row.origin ? row.origin.replacesKey : null,
        },
      },
      position,
      blockIds,
    );
  }
}

async function insertScheduledSessionExercise(
  tx: TenantTx,
  scheduledSessionId: string,
  athleteId: string | null,
  draft: ScheduledSessionExerciseDraft,
  position: number,
  blockIds: readonly string[],
): Promise<void> {
  const { exercise } = draft;
  const created = await tx.scheduledSessionExercise.create({
    data: {
      athleteId,
      scheduledSessionId,
      sourceExerciseId: exercise.sourceExerciseId,
      title: exercise.title,
      description: exercise.description,
      // Le snapshot porte la consigne, sinon une planif diffusée se dégrade : l'athlète garderait
      // le titre et perdrait ce qu'il doit faire.
      instructions: toInstructionsInput(exercise.instructions),
      customMetrics: toCustomMetricsInput(exercise.customMetrics),
      note: exercise.note,
      position,
      ...placementColumns(draft.placement, blockIds),
    } satisfies Omit<
      Prisma.ScheduledSessionExerciseUncheckedCreateInput,
      "coachId"
    > as Prisma.ScheduledSessionExerciseUncheckedCreateInput,
  });

  await insertTags(tx, created.id, athleteId, exercise.tags);
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
 * Recopie les documents d'un exercice — sauf les images que sa consigne ne cite pas (#330) — et
 * réaligne les images de sa consigne sur les nouvelles copies.
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
  const documents = withoutUncitedImages(draft.exercise.instructions, draft.documents);
  if (documents.length === 0) return;

  /**
   * Créés UN PAR UN et non en `createMany` : il faut connaître l'identifiant de chaque copie pour
   * remapper les images de la consigne, et `createMany` ne rend rien. Une poignée de documents par
   * exercice — le coût est nul devant le bug qu'il évite.
   */
  const idByOldId = new Map<string, string>();
  for (const document of documents) {
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
  const { instructions } = draft.exercise;
  if (instructions == null || imageMediaIds(instructions).length === 0) return;

  await tx.scheduledSessionExercise.update({
    where: { id: scheduledSessionExerciseId },
    data: { instructions: toInstructionsInput(remapImageMediaIds(instructions, idByOldId)) },
  });
}
