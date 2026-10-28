import {
  blockNumbers,
  type CompositionEdit,
  CompositionEditKind,
  type CompositionLibrary,
  CompositionOrigin,
  compositionChangeCount,
  copyChoices,
  type ExerciseDto,
  editOfExercise,
  exerciseCodes,
  type PlanWeekDto,
  removedReferences,
  type ScheduledCompositionInput,
  type ScheduledSessionBlockDto,
  type ScheduledSessionCopyDto,
  type ScheduledSessionDto,
  settingsPhrase,
} from "@cmv/shared";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BlockMark } from "@/feature/library/component/BlockMark";
import {
  type CardChange,
  ComposedExerciseCard,
} from "@/feature/plan/component/ComposedExerciseCard";
import { ExercisePicker } from "@/feature/plan/component/ExercisePicker";
import {
  type CompositionTargets,
  WeekChoiceDialog,
} from "@/feature/plan/component/WeekChoiceDialog";
import { useScheduledSessionCopies } from "@/feature/plan/hook/usePlan";
import {
  type ChangeWords,
  compositionLibrary,
  weeksInPlace,
  weeksText,
} from "@/feature/plan/util/composition.util";
import { CmvButton, CmvConfirmButton, CmvErrorState } from "@/shared/component";
import { usePhraseText } from "@/shared/hook/usePhraseText";
import { newId } from "@/shared/util/new-id.util";

// i18n-values plan.composition.change: CompositionEditKind

/** L'exercice que le Coach va choisir : à ajouter en fin de bloc, ou à mettre à une place. */
type Picking =
  | { kind: "add"; blockIndex: number; block: string }
  | { kind: "replace"; blockIndex: number; replacesKey: string; was: string };

/** La fenêtre « Pour quelles semaines ? » ouverte sur un changement. */
type Choosing = { edit: CompositionEdit; reopened: boolean; what: string; words: ChangeWords };

type ScheduledCompositionProps = {
  session: ScheduledSessionDto;
  weeks: readonly PlanWeekDto[];
  /** Pour qui la séance se compose, tel qu'il s'écrit (« Léa ») ou « l'athlète ». */
  athleteName: string;
  isPublished: boolean;
  readOnly: boolean;
  /** La bibliothèque où piocher, et d'où se recopie un exercice de la séance-type à rendre. */
  exercises: readonly ExerciseDto[];
  isBusy: boolean;
  onCompose: (input: ScheduledCompositionInput) => Promise<unknown>;
  onReset: (expectedUpdatedAt: string) => Promise<unknown>;
};

/**
 * La composition d'une séance par blocs pour un Athlete (#720, frames 2 à 2 quinquies). Les blocs
 * et leurs réglages se lisent ; seuls leurs exercices changent — ajoutés, remplacés, retirés —,
 * et chaque changement s'écrit tout de suite, sur les semaines que la fenêtre coche.
 *
 * Elle se lit sur les COPIES (`/copies`) et non sur le détail : c'est sur elles que les semaines
 * se cochent, sous leurs versions. Le détail n'apporte que le titre, les tags et la source de
 * chaque ligne.
 */
export function ScheduledComposition(props: Readonly<ScheduledCompositionProps>) {
  const { session } = props;
  const { t } = useTranslation();
  const copies = useScheduledSessionCopies(session.id);
  const library = useMemo(() => compositionLibrary(props.exercises), [props.exercises]);

  if (copies.isError) {
    return (
      <CmvErrorState
        title={t("common.errorTitle")}
        description={t("common.errorDescription")}
        retryLabel={t("common.retry")}
        onRetry={() => void copies.refetch()}
      />
    );
  }
  const anchor = copies.data?.find((copy) => copy.id === session.id);
  if (copies.data == null || anchor == null) {
    return <p className="text-cmv-body text-cmv-text-lo">{t("common.loading")}</p>;
  }
  return <Composition {...props} copies={copies.data} anchor={anchor} library={library} />;
}

type CompositionProps = ScheduledCompositionProps & {
  copies: readonly ScheduledSessionCopyDto[];
  anchor: ScheduledSessionCopyDto;
  library: CompositionLibrary;
};

function Composition(props: Readonly<CompositionProps>) {
  const { session, anchor, copies, weeks, athleteName, library, readOnly, isBusy } = props;
  const { t } = useTranslation();
  const [picking, setPicking] = useState<Picking | null>(null);
  const [choosing, setChoosing] = useState<Choosing | null>(null);

  const titleOfExercise = (exerciseId: string | null) =>
    (exerciseId == null ? null : props.exercises.find((each) => each.id === exerciseId)?.title) ??
    t("plan.composition.noSource");
  const here = { id: anchor.id, expectedUpdatedAt: anchor.updatedAt };

  async function compose(edit: CompositionEdit, targets: CompositionTargets) {
    await props.onCompose({ edit, ...targets });
  }

  /** L'étiquette d'une carte : le changement, les semaines où il est, et ses deux gestes. */
  function changeOf(edit: CompositionEdit, what: string, words: ChangeWords): CardChange {
    const where = weeksInPlace(copies, copyChoices(copies, edit, library), weeks);
    const kind = t(`plan.composition.change.${edit.kind}`, { name: athleteName });
    return {
      label: `${kind} ${weeksText(where, copies.length, t)}`.trim(),
      sessionType: words.was,
      onReopen: () => setChoosing({ edit, reopened: true, what, words }),
      onRevert: () => void compose(edit, { apply: [], revert: [here] }),
    };
  }

  function onPick(exercise: ExerciseDto) {
    if (picking == null) return;
    const words: ChangeWords = {
      kind: picking.kind === "add" ? CompositionEditKind.ADD : CompositionEditKind.REPLACE,
      athlete: athleteName,
      exercise: exercise.title,
      was: picking.kind === "add" ? null : picking.was,
    };
    setChoosing(
      picking.kind === "add"
        ? {
            edit: {
              kind: CompositionEditKind.ADD,
              blockIndex: picking.blockIndex,
              key: newId(),
              exerciseId: exercise.id,
            },
            reopened: false,
            what: t("plan.composition.dialog.what.ADD", {
              exercise: exercise.title,
              block: picking.block,
            }),
            words,
          }
        : {
            edit: {
              kind: CompositionEditKind.REPLACE,
              blockIndex: picking.blockIndex,
              replacesKey: picking.replacesKey,
              key: newId(),
              exerciseId: exercise.id,
            },
            reopened: false,
            what: t("plan.composition.dialog.what.REPLACE", {
              was: picking.was,
              exercise: exercise.title,
            }),
            words,
          },
    );
    setPicking(null);
  }

  const gestures: BlockGestures = {
    session,
    athleteName,
    readOnly,
    isBusy,
    picking,
    exercises: props.exercises,
    titleOfExercise,
    changeOf,
    onPickStart: setPicking,
    onPick,
    onRemove: (edit, was) =>
      setChoosing({
        edit,
        reopened: false,
        what: t("plan.composition.dialog.what.REMOVE", { was }),
        words: { kind: CompositionEditKind.REMOVE, athlete: athleteName, exercise: null, was },
      }),
  };
  const numbers = blockNumbers(anchor.blocks);

  return (
    <div className="flex flex-col gap-cmv-lg">
      <CompositionHeader {...props} />
      {anchor.blocks.map((block, index) => (
        <CompositionBlock
          key={block.id}
          block={block}
          blockIndex={index}
          number={numbers[index] ?? null}
          gestures={gestures}
        />
      ))}
      {choosing == null ? null : (
        <WeekChoiceDialog
          {...choosing}
          copies={copies}
          weeks={weeks}
          here={anchor.id}
          library={library}
          isBusy={isBusy}
          onCancel={() => setChoosing(null)}
          onValidate={(targets) => {
            void compose(choosing.edit, targets).finally(() => setChoosing(null));
          }}
        />
      )}
    </div>
  );
}

/**
 * « 2 changements pour Léa », « Tout réinitialiser » et « Voir la séance-type » ; puis ce qui
 * ne se change pas ici, et ce que l'athlète verra.
 */
function CompositionHeader({
  session,
  anchor,
  athleteName,
  isPublished,
  readOnly,
  isBusy,
  onReset,
}: Readonly<CompositionProps>) {
  const { t } = useTranslation();
  const count = compositionChangeCount(anchor.blocks);
  return (
    <div className="flex flex-col gap-cmv-sm">
      <div className="flex flex-wrap items-center gap-cmv-sm">
        <span className="text-cmv-body text-cmv-text-hi">
          {count === 0
            ? t("plan.composition.fromSessionType")
            : t("plan.composition.changes", { count, name: athleteName })}
        </span>
        {readOnly || count === 0 ? null : (
          <CmvConfirmButton
            label={t("plan.composition.resetAll")}
            confirmLabel={t("plan.composition.resetConfirm")}
            cancelLabel={t("common.cancel")}
            confirmHint={t("plan.composition.resetWarning")}
            onConfirm={() => void onReset(anchor.updatedAt)}
            disabled={isBusy}
          />
        )}
        {session.sourceSessionId == null ? null : (
          // Un autre onglet : le panneau reste ouvert, avec ce qu'il porte.
          <a
            href={`/library/sessions/${session.sourceSessionId}`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-cmv-caption text-cmv-accent-on underline"
          >
            {t("plan.composition.viewSessionType")}
          </a>
        )}
      </div>
      <p className="text-cmv-caption text-cmv-text-lo">{t("plan.composition.readOnlySettings")}</p>
      {isPublished ? (
        <p className="text-cmv-caption text-cmv-warning-on">
          {t("plan.composition.willSeeUpdate", { name: athleteName })}
        </p>
      ) : null}
    </div>
  );
}

/** Ce que chaque bloc partage : la séance, les libellés, et les gestes qui ouvrent la fenêtre. */
type BlockGestures = {
  session: ScheduledSessionDto;
  athleteName: string;
  readOnly: boolean;
  isBusy: boolean;
  picking: Picking | null;
  exercises: readonly ExerciseDto[];
  titleOfExercise: (exerciseId: string | null) => string;
  changeOf: (edit: CompositionEdit, what: string, words: ChangeWords) => CardChange;
  onPickStart: (picking: Picking | null) => void;
  onPick: (exercise: ExerciseDto) => void;
  onRemove: (edit: CompositionEdit, was: string) => void;
};

type CompositionBlockProps = {
  block: ScheduledSessionBlockDto;
  blockIndex: number;
  number: string | null;
  gestures: BlockGestures;
};

/** Un bloc : son nom et ses réglages, en lecture ; ses exercices, ceux qu'il a perdus, et l'ajout. */
function CompositionBlock({
  block,
  blockIndex,
  number,
  gestures,
}: Readonly<CompositionBlockProps>) {
  const { t } = useTranslation();
  const text = usePhraseText();
  const { session, athleteName, readOnly, isBusy, picking } = gestures;
  const names = block.exercises.map(
    (exercise) => session.exercises.find((row) => row.id === exercise.id)?.title ?? "—",
  );
  const phrase = settingsPhrase(block.settings, block.exercises.length, names);
  const codes = exerciseCodes(number, block.exercises.length + 1);
  const referenceCodes = exerciseCodes(number, block.baseline.exercises.length);
  const blockName = number ?? block.label ?? "—";
  const pickingHere = picking?.blockIndex === blockIndex ? picking : null;

  return (
    <section className="flex flex-col gap-cmv-sm">
      <div className="flex flex-wrap items-center gap-cmv-sm">
        {number == null ? (
          <span className="text-cmv-h3 text-cmv-text-hi">{block.label}</span>
        ) : (
          <BlockMark mark={number} kind="block" />
        )}
        {phrase == null ? null : (
          <span className="text-cmv-caption text-cmv-text-mid">{text(phrase)}</span>
        )}
      </div>

      <div className="ml-cmv-md flex flex-col gap-cmv-sm border-cmv-border border-l pl-cmv-md">
        {block.exercises.map((exercise, index) => (
          <PlannedExerciseCard
            key={exercise.key}
            block={block}
            blockIndex={blockIndex}
            blockName={blockName}
            exercise={exercise}
            code={codes[index] ?? null}
            referenceCodes={referenceCodes}
            gestures={gestures}
          />
        ))}

        {removedReferences(block).map((reference) => {
          const place = block.baseline.exercises.indexOf(reference);
          const title = gestures.titleOfExercise(reference.exerciseId);
          const was = named(referenceCodes[place], title);
          const edit: CompositionEdit = {
            kind: CompositionEditKind.REMOVE,
            blockIndex,
            key: reference.key,
          };
          return (
            <ComposedExerciseCard
              key={reference.key}
              code={referenceCodes[place] ?? null}
              title={title}
              tags={[]}
              grid={null}
              customMetrics={[]}
              note={null}
              removed
              change={gestures.changeOf(edit, t("plan.composition.dialog.what.REMOVE", { was }), {
                kind: CompositionEditKind.REMOVE,
                athlete: athleteName,
                exercise: null,
                was,
              })}
              onReplace={null}
              onRemove={null}
              readOnly={readOnly}
              isBusy={isBusy}
            />
          );
        })}

        {readOnly ? null : (
          <AddOrPick
            picking={pickingHere}
            label={t("plan.composition.add", { name: athleteName })}
            hint={
              codes[block.exercises.length] == null
                ? null
                : t("plan.composition.arrivesAt", { code: codes[block.exercises.length] })
            }
            exercises={gestures.exercises}
            isBusy={isBusy}
            onStart={() => gestures.onPickStart({ kind: "add", blockIndex, block: blockName })}
            onPick={gestures.onPick}
            onCancel={() => gestures.onPickStart(null)}
          />
        )}
      </div>
    </section>
  );
}

/** « 1.2 Squat », ou le titre seul dans un bloc à libellé. */
function named(code: string | null | undefined, title: string): string {
  return code == null ? title : `${code} ${title}`;
}

type PlannedExerciseCardProps = {
  block: ScheduledSessionBlockDto;
  blockIndex: number;
  blockName: string;
  exercise: ScheduledSessionBlockDto["exercises"][number];
  code: string | null;
  referenceCodes: readonly (string | null)[];
  gestures: BlockGestures;
};

/**
 * Un exercice que la séance porte cette semaine : reçu, ajouté ou remplaçant. Un ajout se défait
 * par son étiquette ; un exercice à une place de la séance-type se remplace ou se retire — un
 * remplaçant au nom de la place qu'il occupe.
 */
function PlannedExerciseCard({
  block,
  blockIndex,
  blockName,
  exercise,
  code,
  referenceCodes,
  gestures,
}: Readonly<PlannedExerciseCardProps>) {
  const { t } = useTranslation();
  const row = gestures.session.exercises.find((each) => each.id === exercise.id);
  const title = row?.title ?? "—";
  const edit = editOfExercise(blockIndex, exercise, row?.sourceExerciseId ?? null);
  const placeKey =
    exercise.origin.kind === CompositionOrigin.REPLACEMENT
      ? exercise.origin.replacesKey
      : exercise.key;
  const place = block.baseline.exercises.findIndex((reference) => reference.key === placeKey);
  const was =
    place < 0
      ? null
      : named(
          referenceCodes[place],
          gestures.titleOfExercise(block.baseline.exercises[place]?.exerciseId ?? null),
        );
  const atPlace = exercise.origin.kind !== CompositionOrigin.ADDED;
  const placeName = was ?? named(code, title);
  const what =
    edit?.kind === CompositionEditKind.ADD
      ? t("plan.composition.dialog.what.ADD", { exercise: title, block: blockName })
      : t("plan.composition.dialog.what.REPLACE", { was: placeName, exercise: title });

  return (
    <ComposedExerciseCard
      code={code}
      title={title}
      tags={row?.tags ?? []}
      grid={exercise.grid}
      customMetrics={row?.customMetrics ?? []}
      note={exercise.note}
      removed={false}
      change={
        edit == null
          ? null
          : gestures.changeOf(edit, what, {
              kind: edit.kind,
              athlete: gestures.athleteName,
              exercise: title,
              was,
            })
      }
      onReplace={
        atPlace
          ? () =>
              gestures.onPickStart({
                kind: "replace",
                blockIndex,
                replacesKey: placeKey,
                was: placeName,
              })
          : null
      }
      onRemove={
        atPlace
          ? () =>
              gestures.onRemove(
                { kind: CompositionEditKind.REMOVE, blockIndex, key: placeKey },
                placeName,
              )
          : null
      }
      readOnly={gestures.readOnly}
      isBusy={gestures.isBusy}
    />
  );
}

type AddOrPickProps = {
  picking: Picking | null;
  label: string;
  hint: string | null;
  exercises: readonly ExerciseDto[];
  isBusy: boolean;
  onStart: () => void;
  onPick: (exercise: ExerciseDto) => void;
  onCancel: () => void;
};

/** « Ajouter un exercice pour Léa » en fin de bloc — ou, le temps du choix, la bibliothèque. */
function AddOrPick({
  picking,
  label,
  hint,
  exercises,
  isBusy,
  onStart,
  onPick,
  onCancel,
}: Readonly<AddOrPickProps>) {
  const { t } = useTranslation();
  if (picking == null) {
    return (
      <button
        type="button"
        onClick={onStart}
        disabled={isBusy}
        className="flex items-center gap-cmv-sm rounded-cmv-md border border-cmv-border border-dashed px-cmv-md py-cmv-sm text-left text-cmv-body text-cmv-text-hi"
      >
        <span>{label}</span>
        {hint == null ? null : (
          <span className="ml-auto text-cmv-caption text-cmv-text-lo">{hint}</span>
        )}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-cmv-sm rounded-cmv-md border border-cmv-accent-line p-cmv-md">
      <div className="flex items-center justify-between gap-cmv-sm">
        <span className="text-cmv-body text-cmv-text-hi">
          {picking.kind === "add"
            ? t("plan.composition.pick.addTitle", { block: picking.block })
            : t("plan.composition.pick.replaceTitle", { exercise: picking.was })}
        </span>
        <CmvButton variant="ghost" onClick={onCancel}>
          {t("plan.composition.pick.cancel")}
        </CmvButton>
      </div>
      <ExercisePicker exercises={exercises} onPick={onPick} />
    </div>
  );
}
