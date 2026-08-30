import { isUpcomingIsoDate, type ScheduledSessionDto, ScheduledSessionStatus } from "@cmv/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { ExerciseCard } from "@/feature/plan/component/ExerciseCard";
import { RestBanner } from "@/feature/plan/component/RestBanner";
import { useCountdown } from "@/feature/plan/hook/useCountdown";
import { useLocalTracking } from "@/feature/plan/hook/useLocalTracking";
import { useScheduledSession } from "@/feature/plan/hook/useMyPlan";
import { useTimerNotification } from "@/feature/plan/hook/useTimerNotification";
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

  const [timerLabel, setTimerLabel] = useState("");
  const [timerTotal, setTimerTotal] = useState(0);
  // La vibration seulement : elle ne porte qu'app ouverte, et c'est bien ainsi — téléphone en
  // poche, c'est la notification PROGRAMMÉE ci-dessous qui prévient, l'OS n'ayant pas besoin de
  // nous pour la déclencher.
  const countdown = useCountdown(vibrateTimerDone);
  useTimerNotification(
    countdown.deadline,
    t("plan.timer.doneTitle"),
    t("plan.timer.doneBody", { label: timerLabel }),
  );

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
              onStartTimer={(seconds, label) => {
                setTimerLabel(label);
                setTimerTotal(seconds);
                countdown.start(seconds);
              }}
            />
          </>
        )}
      </ScrollView>

      {/* Le repos en BANDEAU et non en plein écran : c'est le moment où l'athlète relit la
          consigne suivante, et un chronomètre plein écran la lui cacherait. */}
      {countdown.active ? (
        <RestBanner
          remaining={countdown.remaining}
          total={timerTotal}
          label={timerLabel}
          isPaused={countdown.isPaused}
          onPause={countdown.pause}
          onResume={countdown.resume}
          onSkip={countdown.skip}
          onAdd={() => countdown.add(30)}
        />
      ) : null}
    </CmvScreen>
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
  onStartTimer,
}: Readonly<{
  session: ScheduledSessionDto;
  local: ReturnType<typeof useLocalTracking>;
  hint: boolean;
  dismissHint: () => void;
  onStartTimer: (seconds: number, label: string) => void;
}>) {
  const { t } = useTranslation();
  /**
   * Une séance dont le jour n'est pas arrivé se LIT mais ne se coche pas. Comparé en date et non
   * en instant : la séance du jour est cochable dès minuit, pas à partir d'une heure arbitraire.
   *
   * Une séance DÉBRIEFÉE, en revanche, reste cochable : le débrief lui-même se corrige (« Voir /
   * modifier mon débrief »), et le décompte l'accompagne.
   */
  const trackable = !isUpcomingIsoDate(session.scheduledDate);

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
      {hint && trackable && session.exercises.length > 0 ? (
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
          trackable={trackable}
          onToggleUnit={(blockId, unitIndex) => {
            dismissHint();
            local.toggleUnit(exercise.id, blockId, unitIndex);
          }}
          onRounds={(blockId, rounds) => {
            dismissHint();
            local.setRounds(exercise.id, blockId, rounds);
          }}
          onStartTimer={onStartTimer}
        />
      ))}
    </View>
  );
}
