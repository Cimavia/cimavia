import {
  type CompositionEditKind,
  type CompositionLibrary,
  type CopyChoice,
  type ExerciseDto,
  joinNames,
  type PlanWeekDto,
  type ScheduledSessionCopyDto,
} from "@cmv/shared";
import type { TFunction } from "i18next";

/**
 * Les exercices que le Coach peut placer, tels que la fenêtre les juge (`copyChoices`) : ceux de
 * sa bibliothèque. Un exercice privé qu'une séance-type partagée cite (#605) n'y est pas — le
 * serveur, lui, l'accepte : la semaine se grise à tort, le dosage n'en souffre pas.
 */
export function compositionLibrary(exercises: readonly ExerciseDto[]): CompositionLibrary {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  return (exerciseId) => byId.get(exerciseId) ?? null;
}

/** Le numéro, dans le cycle, de la semaine qui porte la copie ; `null` si elle n'en a plus. */
export function weekNumberOf(
  copy: Pick<ScheduledSessionCopyDto, "planWeekId">,
  weeks: readonly Pick<PlanWeekDto, "id" | "weekNumber">[],
): number | null {
  return weeks.find((week) => week.id === copy.planWeekId)?.weekNumber ?? null;
}

/**
 * Une copie a-t-elle le changement, une fois la fenêtre validée ? Celle qui le refuse garde son état,
 * quoi que dise sa case (`compositionTargets`).
 */
function hasEdit(choice: CopyChoice, checked: ReadonlySet<string>): boolean {
  return choice.refusal === null ? checked.has(choice.id) : choice.inPlace;
}

/** Les numéros des semaines dont la copie vérifie `test`, dans l'ordre des copies. */
function weekNumbers(
  copies: readonly ScheduledSessionCopyDto[],
  weeks: readonly PlanWeekDto[],
  test: (copy: ScheduledSessionCopyDto) => boolean,
): number[] {
  return copies
    .filter(test)
    .map((copy) => weekNumberOf(copy, weeks))
    .filter((week) => week !== null);
}

/** « S2 et S5 » : des semaines, nommées par leur numéro. */
function weeksList(numbers: readonly number[], t: TFunction): string {
  return joinNames(
    numbers.map((number) => t("plan.composition.week", { number })),
    t("common.and"),
  );
}

/**
 * Où le changement est en place : « en S2 et S5 », « toutes les semaines » quand chaque copie l'a
 * — dès qu'il y en a deux —, `""` quand aucune.
 */
export function weeksText(numbers: readonly number[], total: number, t: TFunction): string {
  if (numbers.length === 0) return "";
  if (total > 1 && numbers.length === total) return t("plan.composition.allWeeks");
  return t("plan.composition.inWeeks", { weeks: weeksList(numbers, t) });
}

/** Les semaines où le changement est en place, telles que l'étiquette de la carte les dit. */
export function weeksInPlace(
  copies: readonly ScheduledSessionCopyDto[],
  choices: readonly CopyChoice[],
  weeks: readonly PlanWeekDto[],
): number[] {
  const inPlace = new Set(choices.filter((choice) => choice.inPlace).map((choice) => choice.id));
  return weekNumbers(copies, weeks, (copy) => inPlace.has(copy.id));
}

/**
 * Les cases cochées à l'ouverture. Un changement nouveau : la semaine du panneau, si elle le prend.
 * Rouvert depuis son étiquette : les semaines où il est.
 */
export function initiallyChecked(
  choices: readonly CopyChoice[],
  here: string,
  reopened: boolean,
): Set<string> {
  if (reopened) return new Set(choices.filter((c) => c.inPlace).map((c) => c.id));
  const own = choices.find((choice) => choice.id === here);
  return new Set(own?.refusal === null ? [here] : []);
}

/** Ce que dit la fenêtre du changement : son genre, l'exercice placé et celui de la séance-type. */
export type ChangeWords = {
  kind: CompositionEditKind;
  athlete: string;
  /** L'exercice ajouté ou le remplaçant ; `null` pour un retrait. */
  exercise: string | null;
  /** L'exercice de la séance-type remplacé ou retiré ; `null` pour un ajout. */
  was: string | null;
};

/**
 * La ligne du bas : où le changement sera — « remplacé pour Léa en S2 » —, puis ce que deviennent
 * les semaines décochées qui l'avaient : « Corde à sauter revient en S5 », « Gainage latéral n'est
 * plus en S5 ». `""` quand rien ne change.
 */
export function dialogFoot(
  copies: readonly ScheduledSessionCopyDto[],
  choices: readonly CopyChoice[],
  checked: ReadonlySet<string>,
  weeks: readonly PlanWeekDto[],
  words: ChangeWords,
  t: TFunction,
): string {
  const choiceOf = new Map(choices.map((choice) => [choice.id, choice]));
  const had = (copy: ScheduledSessionCopyDto) => choiceOf.get(copy.id)?.inPlace === true;
  const has = (copy: ScheduledSessionCopyDto) => {
    const choice = choiceOf.get(copy.id);
    return choice !== undefined && hasEdit(choice, checked);
  };
  const kept = weekNumbers(copies, weeks, has);
  const dropped = weekNumbers(copies, weeks, (copy) => had(copy) && !has(copy));

  const keep =
    kept.length === 0
      ? ""
      : `${t(`plan.composition.change.${words.kind}`, { name: words.athlete })} ${weeksText(kept, copies.length, t)}`;
  const back = dropped.length === 0 ? "" : comingBack(words, weeksList(dropped, t), t);
  if (keep !== "" && back !== "") return `${keep} · ${back}`;
  return keep === "" && back !== "" ? `${back}.` : keep;
}

/** Ce que retrouvent les semaines décochées : l'exercice de la séance-type, ou plus l'ajout. */
function comingBack(words: ChangeWords, weeks: string, t: TFunction): string {
  return words.was === null
    ? t("plan.composition.dialog.noLonger", { exercise: words.exercise, weeks })
    : t("plan.composition.dialog.comesBack", { exercise: words.was, weeks });
}
