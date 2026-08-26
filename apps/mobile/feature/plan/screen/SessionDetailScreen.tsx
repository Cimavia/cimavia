import { ScheduledSessionStatus } from "@cmv/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { ExerciseCard } from "@/feature/plan/component/ExerciseCard";
import { useScheduledSession } from "@/feature/plan/hook/useMyPlan";
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

              {session.exercises.map((exercise, index) => (
                <ExerciseCard
                  key={exercise.id}
                  exercise={exercise}
                  index={index}
                  // Les définitions voyagent AVEC la copie : l'athlète n'a pas accès à la
                  // bibliothèque du coach, et une planif diffusée doit rester lisible seule.
                  customMetrics={exercise.customMetrics}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </CmvScreen>
  );
}
