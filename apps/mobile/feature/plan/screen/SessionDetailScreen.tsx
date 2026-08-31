import {
  type BlockSegment,
  type BlockTrackingState,
  formatTrainingDuration,
  type ScheduledSessionDto,
  ScheduledSessionStatus,
  SegmentKind,
} from "@cmv/shared";
import { router, useLocalSearchParams } from "expo-router";
import type { TFunction } from "i18next";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { ExerciseCard } from "@/feature/plan/component/ExerciseCard";
import { RestBanner } from "@/feature/plan/component/RestBanner";
import { TimerOverlay } from "@/feature/plan/component/TimerOverlay";
import { useLocalTracking } from "@/feature/plan/hook/useLocalTracking";
import { useScheduledSession } from "@/feature/plan/hook/useMyPlan";
import { type RunnerContext, useSegmentRunner } from "@/feature/plan/hook/useSegmentRunner";
import { type TimerAlert, useTimerNotification } from "@/feature/plan/hook/useTimerNotification";
import { useTrackingHint } from "@/feature/plan/hook/useTrackingHint";
import { vibrateTimerDone } from "@/feature/plan/lib/timer-alert";
import { CmvButton, CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";
import { formatFullDay } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values plan.sessionStatus: ScheduledSessionStatus

/**
 * Détail d'une séance (p3-4) : consignes du coach, déroulé, documents.
 * Les documents sont des URLs signées à durée courte : ils exigent le réseau, contrairement au
 * déroulé qui, lui, reste lisible depuis le cache (dette P3-3).
 */
export function SessionDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session, isPending, isError, isFetching, refetch } = useScheduledSession(id);

  const remote = useMemo(
    () =>
      Object.fromEntries(
        (session?.exercises ?? []).map((exercise) => [exercise.id, exercise.tracking]),
      ),
    [session],
  );
  const local = useLocalTracking(id, remote);
  const { hint, dismissHint } = useTrackingHint();

  const [expanded, setExpanded] = useState(false);

  /**
   * Le déroulé coche au fil des segments, sans que l'athlète ait à y penser : c'est la moitié du
   * « ça s'enchaîne » — l'autre étant l'enchaînement lui-même.
   */
  const runner = useSegmentRunner((blockId, unitIndex) => {
    vibrateTimerDone();
    const exerciseId = runnerExerciseId.current;
    if (exerciseId != null) local.checkUnit(exerciseId, blockId, unitIndex);
  });
  const runnerExerciseId = useRef<string | null>(null);
  runnerExerciseId.current = runner.context?.exerciseId ?? null;

  const alerts = useTimerAlerts(runner, t);
  const timerNotification = useTimerNotification(alerts);

  // Le suivi du bloc en cours de déroulé : la frise des tops et le compteur de tours s'y lisent.
  const runnerTracking =
    runner.context == null
      ? undefined
      : local.tracking[runner.context.exerciseId]?.[runner.context.block.id];

  return (
    <CmvScreen>
      <OfflineBanner />

      {/*
        Tirer pour rafraîchir : le cache est frais 5 min et persisté une semaine, et le coach peut
        ajuster la planif pendant que l'athlète a l'écran ouvert. Sans geste explicite, il n'a
        aucun moyen de savoir que ce qu'il lit date — ni de demander mieux.
      */}
      <ScrollView
        contentContainerClassName="gap-6 p-4"
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />}
      >
        {isPending ? <ActivityIndicator /> : null}

        {isError && session == null ? <CmvErrorState onRetry={() => refetch()} /> : null}

        {session == null ? null : (
          <>
            <View className="gap-1">
              <CmvText className="text-cmv-text-lo text-xs">
                {formatFullDay(session.scheduledDate)}
              </CmvText>
              <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
                {session.title}
              </CmvText>
              <CmvText className="text-cmv-accent text-xs">
                {t(`plan.sessionStatus.${session.status}`)}
              </CmvText>
            </View>

            {session.notes == null ? null : (
              <View className="gap-1 rounded-lg border border-cmv-border bg-cmv-surface p-3">
                <CmvText className="text-cmv-text-mid text-xs">{t("plan.session.notes")}</CmvText>
                <CmvText className="text-cmv-text-hi">{session.notes}</CmvText>
              </View>
            )}

            {/* Débriefer est l'action attendue de l'athlète sur sa séance : elle vient AVANT le
                déroulé, pas enterrée sous la liste des exercices.
                RETIRÉE — pas grisée — sur une séance vide : un bouton mort se tape quand même. */}
            {session.exercises.length === 0 ? null : (
              <CmvButton
                label={
                  session.status === ScheduledSessionStatus.DONE
                    ? t("feedback.openDone")
                    : t("feedback.open")
                }
                onPress={() => router.push(`/session/${session.id}/feedback`)}
              />
            )}

            <SessionExercises
              session={session}
              local={local}
              hint={hint}
              dismissHint={dismissHint}
              onRun={(segments, context) => {
                dismissHint();
                setExpanded(segments.length > 1);
                runner.start(segments, context);
              }}
            />
          </>
        )}
      </ScrollView>

      {/* Deux tailles pour le même chrono : le BANDEAU pendant qu'on relit la consigne suivante,
          l'AGRANDI pendant l'effort, lisible téléphone posé (maquettes 3a et 3b). */}
      <RunnerChrono
        runner={runner}
        armed={timerNotification.armed}
        expanded={expanded}
        tracking={runnerTracking}
        onUnitDone={(unitIndex) => {
          const context = runner.context;
          if (context != null) local.checkUnit(context.exerciseId, context.block.id, unitIndex);
        }}
        onRoundDone={(rounds) => {
          const context = runner.context;
          if (context != null) local.setRounds(context.exerciseId, context.block.id, rounds);
        }}
        onExpand={() => setExpanded(true)}
        onReduce={() => setExpanded(false)}
      />
    </CmvScreen>
  );
}

/**
 * Le chrono, dans l'une de ses deux tailles.
 *
 * Extrait de l'écran : mêlé au chargement, au rafraîchissement et au débrief, il faisait franchir
 * à `SessionDetailScreen` le seuil de complexité de la porte qualité.
 */
function RunnerChrono({
  runner,
  armed,
  expanded,
  tracking,
  onUnitDone,
  onRoundDone,
  onExpand,
  onReduce,
}: Readonly<{
  runner: ReturnType<typeof useSegmentRunner>;
  armed: boolean;
  expanded: boolean;
  /** Le suivi du bloc déroulé : la frise des tops et le compteur de tours le lisent. */
  tracking: BlockTrackingState | undefined;
  onUnitDone: (unitIndex: number) => void;
  onRoundDone: (rounds: number) => void;
  onExpand: () => void;
  onReduce: () => void;
}>) {
  const { t } = useTranslation();
  const { current, context } = runner;
  if (!runner.active || current == null || context == null) return null;

  const checked = tracking != null && "checked" in tracking ? tracking.checked : [];
  const rounds = tracking != null && "rounds" in tracking ? tracking.rounds : 0;

  const overlayProps = {
    title: context.title,
    block: context.block,
    customMetrics: context.customMetrics,
    current,
    remaining: runner.remaining,
    total: runner.total,
    totalRemaining: runner.totalRemaining,
    // « 1 sur 1 » n'apprend rien : un AMRAP n'a qu'une échéance, il n'y a pas de progression à
    // annoncer. On ne dit la position que là où elle avance.
    position:
      runner.segments.length > 1
        ? t("plan.timer.position", { current: runner.index + 1, total: runner.segments.length })
        : null,
    isPaused: runner.isPaused,
    armed,
    checked,
    rounds,
    onConfirm: runner.confirm,
    onUnitDone: () => {
      if (current.unitIndex != null) onUnitDone(current.unitIndex);
    },
    onRoundDone: () => onRoundDone(rounds + 1),
    onPause: runner.pause,
    onResume: runner.resume,
    onSkip: runner.skip,
    onAdd: () => runner.add(30),
    onStop: runner.stop,
    onReduce,
  };

  /**
   * Le déroulé qui ATTEND, un EMOM ou un AMRAP ne tiennent pas dans un bandeau : ils n'ont pas
   * qu'un temps à montrer, et leur geste — « J'ai terminé », « Top fait », « Tour fait » — doit
   * être atteignable. On les agrandit d'office plutôt que d'inventer un bandeau muet.
   */
  if (expanded || runner.awaiting || hasOwnAction(current)) {
    return <TimerOverlay {...overlayProps} />;
  }

  const segmentName = t(`plan.timer.segment.${current.kind}`);

  return (
    <RestBanner
      remaining={runner.remaining}
      total={runner.total}
      label={`${segmentName} · ${context.title}`}
      isPaused={runner.isPaused}
      armed={armed}
      onPause={runner.pause}
      onResume={runner.resume}
      onSkip={runner.stop}
      onAdd={() => runner.add(30)}
      onExpand={onExpand}
    />
  );
}

/**
 * Le déroulé et son suivi. Extrait de l'écran : mêlés, le chargement, le chronomètre, l'amorçage
 * et la liste dépassaient le seuil de complexité de la porte qualité.
 */
function SessionExercises({
  session,
  local,
  hint,
  dismissHint,
  onRun,
}: Readonly<{
  session: ScheduledSessionDto;
  local: ReturnType<typeof useLocalTracking>;
  hint: boolean;
  dismissHint: () => void;
  onRun: (segments: readonly BlockSegment[], context: RunnerContext) => void;
}>) {
  const { t } = useTranslation();
  return (
    <View className="gap-3">
      <CmvText className="text-cmv-text-mid text-xs">
        {t("plan.session.composition", { count: session.exercises.length })}
      </CmvText>

      {/* Une séance diffusée SANS exercice est l'anomalie du coach : on la constate sans
          culpabiliser l'athlète, et le bouton de débrief a déjà été retiré plus haut. */}
      {session.exercises.length === 0 ? (
        <View className="gap-1 rounded-lg border border-cmv-border bg-cmv-surface p-3">
          <CmvText className="text-cmv-text-hi">{t("plan.session.emptyTitle")}</CmvText>
          <CmvText className="text-cmv-text-mid text-sm">
            {t("plan.session.emptyDescription")}
          </CmvText>
        </View>
      ) : null}

      {/* L'amorçage : « Coche au fur et à mesure », PREMIÈRE séance seulement, et il disparaît au
          premier tap — définitivement. Pas de visite guidée, pas de modale. */}
      {hint && session.exercises.length > 0 ? (
        <View className="rounded-lg border border-cmv-accent-line bg-cmv-accent-soft px-3 py-2">
          <CmvText className="text-cmv-accent-on text-xs">{t("plan.tracking.hint")}</CmvText>
        </View>
      ) : null}

      {session.exercises.map((exercise, index) => (
        <ExerciseCard
          key={exercise.id}
          exercise={exercise}
          index={index}
          customMetrics={exercise.customMetrics}
          tracking={local.tracking[exercise.id] ?? null}
          onToggleUnit={(blockId, unitIndex) => {
            dismissHint();
            local.toggleUnit(exercise.id, blockId, unitIndex);
          }}
          onRounds={(blockId, rounds) => {
            dismissHint();
            local.setRounds(exercise.id, blockId, rounds);
          }}
          onRun={onRun}
        />
      ))}
    </View>
  );
}

/**
 * Les notifications de TOUT le déroulé restant, posées d'avance.
 *
 * Chacune annonce ce qui COMMENCE, pas ce qui finit : « Récupération 45 s » est ce que l'athlète
 * doit faire en sortant le téléphone de sa poche. La dernière annonce la fin de l'exercice.
 *
 * Plafonnées : iOS ne garde que 64 notifications programmées par app, et un EMOM de 30 min les
 * mangerait toutes au détriment des rappels du coach.
 */
function useTimerAlerts(
  runner: ReturnType<typeof useSegmentRunner>,
  t: TFunction,
): readonly TimerAlert[] {
  const { deadline, context, segments, index } = runner;

  return useMemo(() => {
    if (deadline == null || context == null) return [];

    const alerts: TimerAlert[] = [];
    let at = deadline;

    for (let cursor = index; cursor < segments.length && alerts.length < MAX_SCHEDULED; cursor++) {
      const next = segments[cursor + 1];
      alerts.push({ at, title: context.title, body: alertBody(next, t) });
      // On s'arrête au premier segment MANUEL : après lui, plus aucune échéance n'est connue —
      // c'est l'athlète qui décide quand le déroulé repart.
      if (next == null || next.kind === SegmentKind.MANUAL) break;
      at += next.seconds * 1000;
    }

    return alerts;
  }, [deadline, context, segments, index, t]);
}

const MAX_SCHEDULED = 12;

/** Ce que la notification annonce : ce qui COMMENCE, ou la fin. */
function alertBody(next: BlockSegment | undefined, t: TFunction): string {
  if (next == null) return t("plan.timer.lastBody");
  if (next.kind === SegmentKind.MANUAL) return t("plan.timer.awaiting");
  return t("plan.timer.nextBody", {
    segment: t(`plan.timer.segment.${next.kind}`),
    duration: formatTrainingDuration(next.seconds) ?? "—",
  });
}

/** Un segment dont l'athlète pilote lui-même l'issue : il lui faut le grand écran et son bouton. */
function hasOwnAction(segment: BlockSegment): boolean {
  return (
    segment.kind === SegmentKind.MANUAL ||
    segment.kind === SegmentKind.INTERVAL ||
    segment.kind === SegmentKind.COUNTDOWN
  );
}
