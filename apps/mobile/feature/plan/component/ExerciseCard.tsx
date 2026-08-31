import type { CustomMetric, ExerciseTracking, ScheduledSessionExerciseDto } from "@cmv/shared";
import {
  type BlockSegment,
  blockSegments,
  DocumentUsage,
  formatTrainingDuration,
  SegmentKind,
  segmentsDuration,
  TimerKind,
  TrackingState,
  type TrackingUnit,
  timerFor,
  trackingSummary,
} from "@cmv/shared";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Pressable, View } from "react-native";
import { DosageBlock } from "@/feature/plan/component/DosageBlock";
import { DurationChip } from "@/feature/plan/component/DurationChip";
import { TrackingList } from "@/feature/plan/component/TrackingList";
import type { RunnerContext } from "@/feature/plan/hook/useSegmentRunner";
import { CmvRichDocument, CmvText } from "@/shared/component";

// i18n-values plan.tracking.open: TrackingUnit
// i18n-values plan.tracking.review: TrackingUnit
// i18n-values plan.tracking.hide: TrackingUnit

type ExerciseCardProps = {
  exercise: ScheduledSessionExerciseDto;
  index: number;
  customMetrics: readonly CustomMetric[];
  tracking: ExerciseTracking | null;
  onToggleUnit: (blockId: string, unitIndex: number) => void;
  onRounds: (blockId: string, rounds: number) => void;
  onRun: (segments: readonly BlockSegment[], context: RunnerContext) => void;
};

/**
 * Un exercice tel que l'athlète le lit.
 *
 * L'ordre suit la maquette : titre · dosage · lien de consigne · consigne · pièces jointes. La
 * consigne est REPLIÉE par défaut sur mobile — la place n'y est pas, et l'athlète au mur veut
 * d'abord son dosage.
 */
export function ExerciseCard({
  exercise,
  index,
  customMetrics,
  tracking,
  onToggleUnit,
  onRounds,
  onRun,
}: Readonly<ExerciseCardProps>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const summary = trackingSummary(exercise.blocks, tracking);
  // L'unité NOMME le lien : « Suivre mes séries », « mes tops », « mes tours », « mes étapes ».
  // Un « Suivre mes séries » sur un circuit demanderait à l'athlète de traduire.
  const unit = summary.unit;

  /**
   * Le lien COMMANDE les cases, et rien d'autre.
   *
   * `null` = l'athlète n'a rien décidé : on ouvre d'office ce qui porte déjà un suivi, et on
   * replie le reste. Dérivé plutôt que figé dans un `useState` : le suivi local arrive de façon
   * asynchrone, un état initialisé au premier render resterait fermé sur des cases déjà cochées.
   *
   * Ce que ça corrige : le lien et les cases étaient pilotés par DEUX conditions différentes, si
   * bien qu'ils s'affichaient ensemble et que taper le lien ne faisait rien de visible.
   */
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const tracked = manualOpen ?? summary.state !== TrackingState.UNTRACKED;

  const attachments = exercise.documents.filter(
    (document) => document.usage === DocumentUsage.ATTACHMENT,
  );
  // « Jamais de lien vers du vide » : un exercice sans consigne n'affiche pas « Voir la consigne ».
  const hasInstructions = exercise.instructions != null && exercise.instructions.length > 0;

  return (
    <View className="gap-3 rounded-lg border border-cmv-border bg-cmv-surface p-3">
      <View className="flex-row gap-2">
        <CmvText className="text-cmv-text-lo">{index + 1}</CmvText>
        <CmvText className="flex-1 text-cmv-text-hi">{exercise.title}</CmvText>
        {exercise.tags.map((tag) => (
          <CmvText key={tag} className="text-cmv-accent text-xs">
            {tag}
          </CmvText>
        ))}
      </View>

      {/* Un exercice SANS aucun bloc est légitime — « étirements au ressenti ». On n'affiche alors
          ni grille ni phrase de dosage, seulement le titre et la consigne. */}
      {exercise.blocks.map((block) => (
        <View key={block.id} className="gap-2">
          <DosageBlock block={block} customMetrics={customMetrics} />
          <BlockRunControls
            block={block}
            onRun={(segments) =>
              onRun(segments, {
                exerciseId: exercise.id,
                blockId: block.id,
                title: exercise.title,
              })
            }
          />
          {tracked ? (
            <TrackingList
              block={block}
              customMetrics={customMetrics}
              state={tracking?.[block.id]}
              onToggle={(unitIndex) => onToggleUnit(block.id, unitIndex)}
              onRounds={(rounds) => onRounds(block.id, rounds)}
            />
          ) : null}
        </View>
      ))}

      {/* « Jamais de lien vers du vide » vaut aussi ici : un exercice sans unité cochable n'ouvre
          rien. Et l'état NON SUIVI reste SILENCIEUX — pas de « 0 sur 4 », pas de rouge. */}
      {unit == null ? null : (
        <Pressable onPress={() => setManualOpen(!tracked)} hitSlop={8}>
          <CmvText className="text-cmv-accent text-sm">
            {trackedLabel(tracked, summary.state, unit, t)}
          </CmvText>
        </Pressable>
      )}

      {summary.state === "PARTIAL" && summary.done > 0 ? (
        <CmvText className="text-cmv-text-mid text-xs">
          {t("plan.tracking.progress", { done: summary.done, total: summary.total })}
        </CmvText>
      ) : null}

      {exercise.note == null ? null : (
        <CmvText className="text-cmv-text-mid text-sm">{exercise.note}</CmvText>
      )}

      {hasInstructions ? (
        <Pressable onPress={() => setOpen((current) => !current)} hitSlop={8}>
          <CmvText className="text-cmv-accent text-sm">
            {t(open ? "plan.session.hideInstructions" : "plan.session.showInstructions")}
          </CmvText>
        </Pressable>
      ) : null}

      {open ? (
        <CmvRichDocument blocks={exercise.instructions} documents={exercise.documents} />
      ) : null}

      {attachments.map((document) => (
        <Pressable
          key={document.id}
          onPress={() => Linking.openURL(document.url)}
          className="rounded-lg border border-cmv-border bg-cmv-bg-1 px-3 py-2"
        >
          <CmvText className="text-cmv-text-mid text-sm" numberOfLines={1}>
            {document.fileName ?? t("plan.session.link")}
          </CmvText>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * De quoi lancer le bloc, en deux gestes de portée différente.
 *
 * **« Lancer l'exercice »** déroule TOUT — effort, repos, effort… — dès qu'il y a plus d'un
 * segment à enchaîner. C'est le geste normal : taper une pastille à chaque repos, c'est ce que
 * cette barre remplace.
 *
 * **Les pastilles** restent pour le hors-piste : relancer un repos seul, chronométrer un effort
 * qu'on reprend. « Toute durée affichée est lançable d'un tap » vaut toujours.
 */
function BlockRunControls({
  block,
  onRun,
}: Readonly<{
  block: ScheduledSessionExerciseDto["blocks"][number];
  onRun: (segments: readonly BlockSegment[]) => void;
}>) {
  const { t } = useTranslation();
  const segments = blockSegments(block);
  const total = segmentsDuration(segments) ?? 0;
  /**
   * Rien à dérouler tant qu'aucun temps n'est écrit : un bloc fait UNIQUEMENT de gestes ne serait
   * qu'une seconde façon de cocher, et les cases sont déjà là, juste en dessous.
   */
  const runnable = segments.length > 1 && total > 0;

  return (
    <View className="gap-2">
      {runnable ? (
        <Pressable
          onPress={() => onRun(segments)}
          accessibilityRole="button"
          className="min-h-11 flex-row items-center justify-center gap-2 rounded-lg border border-cmv-accent-line bg-cmv-accent-soft px-3"
        >
          <CmvText className="text-cmv-accent-on text-sm">{t("plan.timer.run")}</CmvText>
          <CmvText className="font-cmv-mono text-cmv-accent-on text-xs">
            {formatTrainingDuration(total) ?? ""}
          </CmvText>
        </Pressable>
      ) : null}

      <BlockTimerChips
        block={block}
        onStart={(seconds) =>
          onRun([{ kind: SegmentKind.REST, seconds, unitIndex: null, rowId: null }])
        }
      />
    </View>
  );
}

/**
 * Les durées lançables d'un bloc. Elles viennent de `timerFor`, donc du type de structure — aucune
 * donnée nouvelle, et rien à régler côté athlète.
 */
function BlockTimerChips({
  block,
  onStart,
}: Readonly<{
  block: ScheduledSessionExerciseDto["blocks"][number];
  onStart: (seconds: number) => void;
}>) {
  const { t } = useTranslation();
  const timer = timerFor(block);
  if (timer == null) return null;

  const chips: { seconds: number; label: string }[] = [];
  if (timer.kind === TimerKind.REST) {
    chips.push({ seconds: timer.restSeconds, label: t("plan.timer.rest") });
  }
  if (timer.kind === TimerKind.EFFORT_REST) {
    chips.push({ seconds: timer.effortSeconds, label: t("plan.timer.effort") });
    if (timer.restSeconds != null) {
      chips.push({ seconds: timer.restSeconds, label: t("plan.timer.rest") });
    }
  }
  if (timer.kind === TimerKind.INTERVAL) {
    chips.push({ seconds: timer.intervalSeconds, label: t("plan.timer.interval") });
  }
  if (timer.kind === TimerKind.COUNTDOWN) {
    chips.push({ seconds: timer.totalSeconds, label: t("plan.timer.countdown") });
  }

  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <View key={chip.label} className="flex-row items-center gap-1">
          <CmvText className="text-cmv-text-mid text-xs">{chip.label}</CmvText>
          <DurationChip
            seconds={chip.seconds}
            label={`${chip.label} ${chip.seconds}`}
            onStart={onStart}
          />
        </View>
      ))}
    </View>
  );
}

/**
 * Le libellé DIT ce que le tap va faire — replier quand c'est ouvert, ouvrir sinon. Un lien qui
 * garde le même texte des deux côtés laisse croire qu'il n'a rien fait.
 */
function trackedLabel(
  open: boolean,
  state: TrackingState,
  unit: TrackingUnit,
  t: TFunction,
): string {
  if (open) return t(`plan.tracking.hide.${unit}`);
  return state === TrackingState.DONE
    ? t(`plan.tracking.review.${unit}`)
    : t(`plan.tracking.open.${unit}`);
}
