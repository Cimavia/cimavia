import {
  AdjustmentLevel,
  type Adjustments,
  adjustCell,
  adjustRows,
  adjustStructure,
  type CreateSessionInput,
  type CustomMetric,
  type DosageScope,
  type ExerciseBlock,
  type ExerciseBlocks,
  type ExerciseDto,
  type MetricValue,
  resetAllAdjustments,
  revertCell,
  revertRow,
  revertStructureField,
  type SessionDto,
  sameJson,
  toSessionInput,
} from "@cmv/shared";
import { useState } from "react";
import { type SessionVersion, useSaveSession } from "@/feature/library/hook/useSessions";
import { isStaleWriteError } from "@/shared/lib/api";

type CreateSessionLine = CreateSessionInput["exercises"][number];

/**
 * Le constructeur dose au niveau SÉANCE, dont la référence des marqueurs est vide : revenir au
 * défaut rend la valeur de la bibliothèque, qui n'en porte aucun.
 */
const SESSION_SCOPE: DosageScope = { level: AdjustmentLevel.SESSION, reference: [] };

/**
 * Une ligne de composition en cours d'édition. `key` est locale et stable : un même exercice peut
 * figurer deux fois dans une séance, l'id de l'exercice ne suffit donc pas à identifier la ligne.
 *
 * `id` est celui de la ligne DÉJÀ enregistrée, s'il existe. C'est lui qui permet au serveur de
 * retrouver la référence de dosage à travers le remplace-all.
 */
export type CompositionItem = {
  key: string;
  id?: string;
  exerciseId: string;
  title: string;
  tags: string[];
  note: string;
  blocks: ExerciseBlocks;
  baseline: ExerciseBlocks;
  adjustments: Adjustments;
  /**
   * Les métriques maison que cite l'exercice, chez SON propriétaire (#605) : une séance compose
   * les exercices d'autres Coachs, et leurs colonnes ne se résolvent pas dans le catalogue du
   * lecteur.
   */
  customMetrics: CustomMetric[];
};

const fromSession = (session: SessionDto | null): CompositionItem[] =>
  (session?.exercises ?? []).map((composed) => ({
    key: composed.id,
    id: composed.id,
    exerciseId: composed.exerciseId,
    title: composed.title,
    tags: composed.tags,
    note: composed.note ?? "",
    blocks: composed.blocks,
    baseline: composed.baseline,
    adjustments: composed.adjustments,
    customMetrics: composed.customMetrics,
  }));

/** Une ligne neuve, copiée de la bibliothèque. */
const fromExercise = (exercise: ExerciseDto): CompositionItem => ({
  key: crypto.randomUUID(),
  exerciseId: exercise.id,
  title: exercise.title,
  tags: exercise.tags,
  note: "",
  // La copie à l'AJOUT : la séance est indépendante dès cet instant, et le serveur posera
  // la même chose en référence.
  blocks: exercise.blocks,
  baseline: exercise.blocks,
  adjustments: [],
  customMetrics: exercise.customMetrics,
});

/**
 * Toute la composition d'une séance et les gestes qui la modifient.
 *
 * Les gestes de dosage sont les fonctions pures de `@cmv/shared`, partagées avec le panneau de séance
 * planifiée (#518) : une seule mécanique, paramétrée par le niveau. Seul le rechargement passe par
 * le serveur, parce qu'il déplace la référence.
 */
export function useSessionDraft(session: SessionDto | null, added: ExerciseDto | null = null) {
  const { save, isSaving, error } = useSaveSession();

  /**
   * La séance éditée et la version que l'enregistrement cite (#604) — celle sur laquelle la saisie
   * a commencé, qui n'avance qu'avec NOS écritures : l'enregistrement, le rechargement d'un
   * exercice. Jamais avec le cache, qu'un retour d'onglet rafraîchit : la saisie, elle, ne l'a pas
   * vu. Une création enregistrée passe ainsi en édition, plutôt que d'en créer une seconde.
   */
  const [edited, setEdited] = useState<SessionVersion | null>(session);

  const [title, setTitle] = useState(session?.title ?? "");
  const [notes, setNotes] = useState(session?.notes ?? "");
  const [items, setItems] = useState<CompositionItem[]>(() => [
    ...fromSession(session),
    // L'exercice créé depuis cette séance (#303) entre dans l'état INITIAL, pas par un effet : le
    // brouillon naît une seule fois, l'exercice ne peut donc pas y entrer deux fois.
    ...(added == null ? [] : [fromExercise(added)]),
  ]);

  /**
   * Ce qui est ENREGISTRÉ, sous la forme où le brouillon l'enverrait (#327) — remis à jour avec ce
   * qui est parti, et non la séance vide d'où une création est partie : sans ça, la navigation qui
   * suit l'enregistrement d'une séance neuve serait retenue. L'exercice ajouté au retour de #303
   * n'en fait PAS partie : il reste à enregistrer, comme tout ajout.
   */
  const [saved, setSaved] = useState(() =>
    toSessionInput(session ?? { title: "", notes: null, exercises: [] }),
  );
  const input = toSessionInput({ title, notes, exercises: items });
  const isDirty = !sameJson(input, saved);

  const trimmedTitle = title.trim();

  function replace(key: string, change: (item: CompositionItem) => CompositionItem) {
    setItems((current) => current.map((item) => (item.key === key ? change(item) : item)));
  }

  function addExercise(exercise: ExerciseDto) {
    setItems((current) => [...current, fromExercise(exercise)]);
  }

  function removeItem(key: string) {
    setItems((current) => current.filter((item) => item.key !== key));
  }

  function moveItem(from: number, to: number) {
    setItems((current) => {
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      next.splice(to, 0, ...next.splice(from, 1));
      return next;
    });
  }

  /** Écrit une valeur de grille ET pose son marqueur : les deux vont toujours ensemble. */
  function setCellValue(
    key: string,
    blockId: string,
    rowId: string,
    metricId: string,
    value: unknown,
  ) {
    // La grille ne remonte que des valeurs de cellule : la carte la relaie sans la typer.
    const cell = value as MetricValue;
    replace(key, (item) => adjustCell(item, SESSION_SCOPE, { blockId, rowId, metricId }, cell));
  }

  /** Un paramètre de bandeau — « 4 séries », « repos 2'30 ». */
  function setStructure(key: string, blockId: string, structure: ExerciseBlock["structure"]) {
    replace(key, (item) => adjustStructure(item, SESSION_SCOPE, blockId, structure));
  }

  /** « Revenir au défaut » sur un paramètre de bandeau. */
  function revertStructure(key: string, blockId: string, field: string) {
    replace(key, (item) => revertStructureField(item, SESSION_SCOPE, blockId, field));
  }

  function setRows(key: string, blockId: string, rows: ExerciseBlock["rows"]) {
    replace(key, (item) => adjustRows(item, blockId, rows));
  }

  function revertItemRow(key: string, blockId: string, rowId: string) {
    replace(key, (item) => revertRow(item, SESSION_SCOPE, blockId, rowId));
  }

  function revertItemCell(key: string, blockId: string, rowId: string, metricId: string) {
    replace(key, (item) => revertCell(item, SESSION_SCOPE, { blockId, rowId, metricId }));
  }

  /** « Tout réinitialiser » : retour aux valeurs copiées à l'ajout, la référence ne bouge pas. */
  function resetItem(key: string) {
    replace(key, (item) => resetAllAdjustments(item, SESSION_SCOPE));
  }

  /**
   * La séance telle qu'enregistrée : son id ramène à elle après un détour (#303).
   *
   * Le remplace-all recrée chaque ligne sous un NOUVEL id, à la position où elle est partie : la
   * saisie les reprend, sans quoi un écran resté ouvert — un détour raté — enverrait au prochain
   * enregistrement des ids disparus, et chaque ligne perdrait sa référence de dosage. Par clé, et
   * non par position actuelle : la composition a pu bouger pendant l'enregistrement.
   */
  async function submit(): Promise<SessionDto> {
    const sentKeys = items.map((item) => item.key);
    const result = await save({ session: edited, input });
    const savedIdAt = (position: number) => result.exercises[position]?.id;
    const idByKey = new Map(sentKeys.map((key, position) => [key, savedIdAt(position)]));
    setItems((current) =>
      current.map((item) => {
        const id = idByKey.get(item.key);
        return id == null ? item : { ...item, id };
      }),
    );
    setEdited(result);
    setSaved({
      ...input,
      exercises: input.exercises.map((line, position) => {
        const id = savedIdAt(position);
        return id == null ? line : { ...line, id };
      }),
    });
    return result;
  }

  /**
   * Reprend une ligne après un rechargement serveur. Sans ça la réponse arrive et le cache est
   * invalidé, mais l'écran continue d'afficher son état local : le coach voit la confirmation
   * disparaître et rien changer.
   *
   * La réponse porte la séance ENTIÈRE, telle qu'enregistrée : seule la ligne rechargée en est
   * reprise. Les autres y figurent dans leur dernier état sauvegardé, et les reprendre effacerait
   * en silence tout ce que le coach y a modifié sans encore enregistrer (#300).
   */
  function applyReloaded(sessionExerciseId: string, reloaded: SessionDto) {
    setEdited(reloaded);
    const fresh = reloaded.exercises.find((composed) => composed.id === sessionExerciseId);
    if (fresh == null) return;
    // Le rechargement est ENREGISTRÉ : la ligne repart de ce que le serveur a écrit, des deux côtés
    // — sinon elle passerait pour une saisie en attente sans que le coach y ait touché.
    const reload = (line: CreateSessionLine) =>
      line.id === sessionExerciseId
        ? { ...line, blocks: fresh.blocks, adjustments: fresh.adjustments }
        : line;
    setSaved((current) => ({ ...current, exercises: current.exercises.map(reload) }));
    setItems((current) =>
      current.map((item) =>
        item.id === sessionExerciseId
          ? {
              ...item,
              blocks: fresh.blocks,
              baseline: fresh.baseline,
              adjustments: fresh.adjustments,
              customMetrics: fresh.customMetrics,
            }
          : item,
      ),
    );
  }

  return {
    title,
    setTitle,
    trimmedTitle,
    notes,
    setNotes,
    items,
    setItems,
    addExercise,
    removeItem,
    moveItem,
    setCellValue,
    setStructure,
    revertStructureField: revertStructure,
    applyReloaded,
    setRows,
    revertRow: revertItemRow,
    revertCell: revertItemCell,
    resetItem,
    submit,
    /** L'écran montre autre chose que l'enregistré : le quitter perdrait la saisie (#327). */
    isDirty,
    isSaving,
    error,
    edited,
    /** L'enregistrement a été refusé : la séance a changé depuis le début de la saisie (#604). */
    isStale: isStaleWriteError(error),
  };
}
