import { type ScheduledSessionDto, ScheduledSessionStatus } from "@cmv/shared";
import { router, useLocalSearchParams } from "expo-router";
import { type ReactNode, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { SessionBlocks } from "@/feature/plan/component/SessionBlocks";
import { useBlockScrollSpy } from "@/feature/plan/hook/useBlockScrollSpy";
import { useScheduledSession } from "@/feature/plan/hook/useMyPlan";
import { CmvButton, CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";
import { formatFullDay } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values plan.sessionStatus: ScheduledSessionStatus

/**
 * Détail d'une séance (p3-4) : consignes du coach, puis ses blocs (#722). Le chrono et le suivi
 * se lancent depuis l'écran d'un bloc.
 * Déroulé ET documents sont lisibles hors réseau depuis #95 : la passe montée sur le planning les
 * descend sur l'appareil au dernier passage en ligne. Ce qu'elle n'a pas eu le temps de descendre
 * retombe sur une URL re-signée (#307), et le dit quand le réseau manque.
 */
export function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    data: session,
    dataUpdatedAt,
    isPending,
    isError,
    isFetching,
    refetch,
  } = useScheduledSession(id);
  // L'instant où CETTE séance a été récupérée — c'est elle que l'athlète lit, pas le planning.
  // TanStack dit 0 quand il ne le sait pas : c'est « inconnu », pas le 1er janvier 1970.
  const savedAt =
    session == null || dataUpdatedAt === 0 ? null : new Date(dataUpdatedAt).toISOString();

  const scroll = useRef<ScrollView>(null);
  const spy = useBlockScrollSpy(scroll, session?.blocks.length ?? 0);

  return (
    <CmvScreen>
      <OfflineBanner savedAt={savedAt} />

      {/*
        Tirer pour rafraîchir : le cache est frais 5 min et persisté une semaine, et le coach peut
        ajuster la planif pendant que l'athlète a l'écran ouvert. Sans geste explicite, il n'a
        aucun moyen de savoir que ce qu'il lit date — ni de demander mieux.
      */}
      <ScrollView
        ref={scroll}
        contentContainerClassName="gap-6 p-4"
        scrollEventThrottle={64}
        // La liste des blocs lit la position, pour sa puce en cours.
        onScroll={spy.onScroll}
        onScrollBeginDrag={spy.release}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />}
      >
        {isPending ? <ActivityIndicator /> : null}

        {isError && session == null ? <CmvErrorState onRetry={() => refetch()} /> : null}

        {session == null ? null : (
          <SessionContent session={session}>
            {session.blocks.length === 0 ? (
              <EmptySession />
            ) : (
              <SessionBlocks session={session} spy={spy} />
            )}
          </SessionContent>
        )}
      </ScrollView>
    </CmvScreen>
  );
}

/**
 * L'en-tête de la séance chargée — date, titre, statut, consignes — puis le bouton de débrief, au
 * dessus de son déroulé (`children`). Extrait de l'écran pour le seuil de complexité.
 */
function SessionContent({
  session,
  children,
}: Readonly<{ session: ScheduledSessionDto; children: ReactNode }>) {
  const { t } = useTranslation();
  return (
    <>
      <View className="gap-1">
        <CmvText className="text-cmv-text-lo text-xs">
          {formatFullDay(session.scheduledDate)}
        </CmvText>
        <CmvText className="font-cmv-display text-cmv-text-hi text-xl">{session.title}</CmvText>
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
          INCONDITIONNEL (#276) : sans exercice, c'est le SEUL geste qui reste, et celui par
          lequel la trace part au coach. Le libellé suit le STATUT, jamais la composition. */}
      <CmvButton
        label={
          session.status === ScheduledSessionStatus.DONE
            ? t("feedback.openDone")
            : t("feedback.open")
        }
        onPress={() => router.push(`/session/${session.id}/feedback`)}
      />

      {children}
    </>
  );
}

/**
 * Une séance sans exercice n'est PAS forcément un oubli du coach : « footing, repos actif » se
 * compose exactement comme ça (#276). On le constate sans désigner de coupable, et sans rien
 * retirer — le bouton de débrief, plus haut, reste ouvert.
 */
function EmptySession() {
  const { t } = useTranslation();
  return (
    <View className="gap-1 rounded-lg border border-cmv-border bg-cmv-surface p-3">
      <CmvText className="text-cmv-text-hi">{t("plan.session.emptyTitle")}</CmvText>
      <CmvText className="text-cmv-text-mid text-sm">{t("plan.session.emptyDescription")}</CmvText>
    </View>
  );
}
