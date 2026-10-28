import {
  blockExerciseFrom,
  blockFrom,
  blocksFromDto,
  type CopiedStructure,
  type CustomMetric,
  compositionIssues,
  type ExerciseDto,
  exerciseKeyAt,
  type FrozenFrom,
  fittedBlock,
  presetSource,
  replacedExercise,
  type SessionBlock,
  type SessionBlockExercise,
  type SessionBlocksInput,
  type SessionDto,
  StructurePresetKey,
  sameJson,
  withAddedExercise,
} from "@cmv/shared";
import { useState } from "react";
import { type SessionVersion, useSaveSession } from "@/feature/library/hook/useSessions";
import { ApiError, isStaleWriteError } from "@/shared/lib/api";
import { newId } from "@/shared/util/new-id.util";

/**
 * Ce que la carte d'un exercice affiche et que la grille ne porte pas : son titre, ses tags, et les
 * métriques maison que ses colonnes citent chez SON propriétaire (#605).
 */
export type ExerciseInfo = {
  title: string;
  tags: string[];
  customMetrics: CustomMetric[];
  /** L'exercice cité est une copie figée (#609) : la carte le dit. */
  frozenFrom: FrozenFrom | null;
};

/** Ce que la séance rend de chaque exercice de ses blocs, par clé : la ligne du même `id`. */
function infoOfSession(session: SessionDto | null): Record<string, ExerciseInfo> {
  if (session == null) return {};
  const lines = new Map(session.exercises.map((line) => [line.id, line]));
  return Object.fromEntries(
    session.blocks.flatMap((block) =>
      block.exercises.flatMap((exercise) => {
        const line = lines.get(exercise.id);
        if (line == null) return [];
        const info: ExerciseInfo = {
          title: line.title,
          tags: line.tags,
          customMetrics: line.customMetrics,
          frozenFrom: line.frozenFrom,
        };
        return [[exercise.key, info]];
      }),
    ),
  );
}

const infoOfExercise = (exercise: ExerciseDto): ExerciseInfo => ({
  title: exercise.title,
  tags: exercise.tags,
  customMetrics: exercise.customMetrics,
  frozenFrom: exercise.frozenFrom,
});

/**
 * L'exercice créé depuis la séance (#303), et le rang du bloc où l'ajouter — `null` : un bloc neuf.
 * `source` : il revient d'un bloc vide, que l'enregistrement a laissé de côté (`creationPlaceOf`) ;
 * un bloc neuf de cette structure le reçoit, au rang `blockIndex`.
 */
export type AddedExercise = {
  exercise: ExerciseDto;
  blockIndex: number | null;
  source: CopiedStructure | null;
};

/** Ce qui part : le titre et la note rognés, chaque grille taillée à ses tours (`fittedBlock`). */
function inputOf(
  title: string,
  notes: string,
  blocks: readonly SessionBlock[],
): SessionBlocksInput {
  return {
    title: title.trim(),
    notes: notes.trim() === "" ? null : notes.trim(),
    blocks: blocks.map(fittedBlock),
  };
}

/** Le brouillon, tel que les gestes du constructeur le reçoivent. */
export type BlocksDraft = ReturnType<typeof useBlocksDraft>;

/**
 * La séance-type composée par blocs (#719) : son titre, sa note, ses blocs, et l'enregistrement.
 * Les gestes sont les fonctions pures de `@cmv/shared` (`session-composition`), passées à `change`.
 *
 * Une séance encore composée par exercices (`blocks` vide, BL-1) s'ouvre sans composition : la
 * reprise de #716 a converti les séances existantes, et l'ancien constructeur n'en crée plus.
 *
 * `seriesName` : le nom traduit de la structure prête « Séries », que prend un exercice ajouté sans
 * bloc — le premier d'une séance vide, ou celui créé depuis elle (#303) sans bloc cible.
 */
export function useBlocksDraft(
  session: SessionDto | null,
  seriesName: string,
  added: AddedExercise | null = null,
) {
  const { save, isSaving, error } = useSaveSession();

  /**
   * La version que l'enregistrement cite (#604) : celle sur laquelle la saisie a commencé, qui
   * n'avance qu'avec NOS écritures. Une création enregistrée passe ainsi en édition.
   */
  const [edited, setEdited] = useState<SessionVersion | null>(session);
  const [title, setTitle] = useState(session?.title ?? "");
  const [notes, setNotes] = useState(session?.notes ?? "");
  // L'exercice créé depuis cette séance (#303) entre dans l'état INITIAL, sous une clé tirée une
  // fois : le brouillon naît une seule fois, l'exercice ne peut donc pas y entrer deux fois.
  const [addedKey] = useState(newId);
  const [info, setInfo] = useState(() => ({
    ...infoOfSession(session),
    ...(added == null ? {} : { [addedKey]: infoOfExercise(added.exercise) }),
  }));
  const [blocks, setBlocks] = useState<SessionBlock[]>(() => {
    const loaded = blocksFromDto(session?.blocks ?? []);
    return added == null ? loaded : withExercise(loaded, added, addedKey, seriesName);
  });

  /**
   * Ce qui est ENREGISTRÉ, sous la forme où le brouillon l'enverrait (#327). L'exercice ajouté au
   * retour de #303 n'en fait pas partie : il reste à enregistrer, comme tout ajout.
   */
  const [saved, setSaved] = useState(() =>
    inputOf(session?.title ?? "", session?.notes ?? "", blocksFromDto(session?.blocks ?? [])),
  );
  const input = inputOf(title, notes, blocks);
  const issues = compositionIssues(blocks);
  // Sans les blocs vides : ce qu'enregistre la création d'un exercice manquant (#303).
  // Encore composée par exercices (BL-1) : des blocs l'effaceraient. Aucun constructeur n'en crée
  // plus, mais l'API en accepte encore : on la lit sans l'écraser.
  const legacy = session != null && session.blocks.length === 0 && session.exercises.length > 0;

  /** Un exercice de la bibliothèque, au bout du bloc `blockId` — ou dans un bloc Séries neuf. */
  function addExercise(blockId: string | null, exercise: ExerciseDto) {
    const key = newId();
    setInfo((current) => ({ ...current, [key]: infoOfExercise(exercise) }));
    const line = blockExerciseFrom(exercise, key, newId);
    setBlocks((current) =>
      blockId == null
        ? [...current, seriesBlock(seriesName, line)]
        : withAddedExercise(current, blockId, line),
    );
  }

  /** Un autre exercice à la place de `key`, sous une clé neuve et ses colonnes (`replacedExercise`). */
  function replaceExercise(key: string, exercise: ExerciseDto) {
    const next = newId();
    setInfo((current) => ({ ...current, [next]: infoOfExercise(exercise) }));
    setBlocks((current) => replacedExercise(current, key, exercise, next, newId));
  }

  /** Un bloc neuf, vide, au bout de la séance. */
  function addBlock(source: CopiedStructure) {
    setBlocks((current) => [...current, blockFrom(source, newId())]);
  }

  // L'exercice qu'un refus de l'API désigne, retrouvé dans les blocs ENVOYÉS : leurs rangs sont
  // ceux du pointeur, et la clé suit l'exercice même si le Coach range ensuite la séance.
  const [refusedKey, setRefusedKey] = useState<string | null>(null);

  async function send(sent: SessionBlocksInput) {
    setRefusedKey(null);
    try {
      const result = await save({ session: edited, input: sent });
      setEdited(result);
      setSaved(sent);
      return result;
    } catch (failure) {
      setRefusedKey(refusedKeyOf(failure, sent.blocks));
      throw failure;
    }
  }

  return {
    title,
    setTitle,
    trimmedTitle: input.title,
    notes,
    setNotes,
    blocks,
    /** Les blocs tels qu'ils partiraient, chaque grille taillée à ses tours : ce que l'athlète lira. */
    sentBlocks: input.blocks,
    /** Un geste de `@cmv/shared` sur les blocs : déplacer, dupliquer, régler… */
    change: setBlocks,
    info,
    /** Pour qu'une copie d'exercice (`duplicatedExercise`, `duplicatedBlock`) se nomme aussi. */
    copyInfo: (from: string, to: string) =>
      setInfo((current) => {
        const known = current[from];
        return known == null ? current : { ...current, [to]: known };
      }),
    addExercise,
    replaceExercise,
    addBlock,
    issues,
    /** La séance est encore composée par exercices : l'enregistrer par blocs l'effacerait. */
    legacy,
    /** Un bloc vide ou qui manque de bips retient l'enregistrement, comme l'API le refuserait. */
    refusal: refusalOf(legacy, issues.length),
    submit: () => send(input),
    /**
     * Enregistre SANS ce bloc s'il est vide, que l'API refuserait : la création d'un exercice
     * manquant quitte la séance, et le bloc vide d'où elle part revient par sa structure
     * (`creationPlaceOf`). Tout autre bloc vide retient l'enregistrement, comme d'habitude.
     */
    withoutEmptyBlock: (blockId: string | null) => {
      const kept = blocks.filter((block) => block.id !== blockId || block.exercises.length > 0);
      return {
        refusal: refusalOf(legacy, compositionIssues(kept).length),
        submit: () => send(inputOf(title, notes, kept)),
      };
    },
    /** L'écran montre autre chose que l'enregistré : le quitter perdrait la saisie (#327). */
    isDirty: !sameJson(input, saved),
    isSaving,
    error,
    /** L'exercice que le dernier refus de l'API désigne, ou `null`. */
    refusedKey,
    edited,
    /** L'enregistrement a été refusé : la séance a changé depuis le début de la saisie (#604). */
    isStale: isStaleWriteError(error),
  };
}

/** Ce qui retient l'enregistrement, en clé i18n, ou `null`. */
function refusalOf(legacy: boolean, issueCount: number): string | null {
  if (legacy) return "library.session.blocks.legacyBlocksSave";
  return issueCount === 0 ? null : "library.session.blocks.issuesBlockSave";
}

/** La clé de l'exercice que le premier refus de champ désigne, ou `null`. */
function refusedKeyOf(failure: unknown, sent: readonly SessionBlock[]): string | null {
  const pointer = failure instanceof ApiError ? failure.fieldErrors?.[0]?.pointer : undefined;
  return pointer == null ? null : exerciseKeyAt(sent, pointer);
}

/** Un bloc Séries neuf, autour d'un exercice ajouté sans bloc. */
function seriesBlock(seriesName: string, line: SessionBlockExercise): SessionBlock {
  return {
    ...blockFrom(presetSource(StructurePresetKey.SERIES, seriesName), newId()),
    exercises: [line],
  };
}

/** L'exercice de #303 dans le bloc de rang `blockIndex` — ou dans un bloc Séries neuf. */
function withExercise(
  blocks: SessionBlock[],
  added: AddedExercise,
  key: string,
  seriesName: string,
): SessionBlock[] {
  const line = blockExerciseFrom(added.exercise, key, newId);
  if (added.source != null) {
    const fresh = { ...blockFrom(added.source, newId()), exercises: [line] };
    const at = added.blockIndex ?? blocks.length;
    return [...blocks.slice(0, at), fresh, ...blocks.slice(at)];
  }
  const target = added.blockIndex == null ? undefined : blocks[added.blockIndex];
  if (target != null) return withAddedExercise(blocks, target.id, line);
  return [...blocks, seriesBlock(seriesName, line)];
}
