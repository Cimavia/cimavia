import {
  buildAthleteRows,
  countOverdueInvoices,
  countPendingInvoices,
  countUnreadFeedbacks,
  todayIsoDate,
} from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { useAthletes } from "@/feature/athlete";
import { AthleteRowCard } from "@/feature/dashboard/component/AthleteRowCard";
import { DashboardTile } from "@/feature/dashboard/component/DashboardTile";
import { InvitationSection } from "@/feature/dashboard/component/InvitationSection";
import { useCoachFeedbacks } from "@/feature/feedback/hook/useCoachFeedbacks";
import { useInvoices } from "@/feature/invoice/hook/useInvoices";
import { useConversations } from "@/feature/message/hook/useConversation";
import { CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";
import { authClient } from "@/shared/lib/auth";

/**
 * Tableau de bord du coach sur mobile (#30).
 *
 * Aucun compteur n'est calculé ici : les dérivations vivent dans `@cmv/shared`, testées, et sont
 * les MÊMES que celles du tableau de bord web (#52). L'écran choisit quoi montrer, pas quoi
 * compter — sinon deux plateformes finiraient par ne pas compter pareil.
 *
 * Quatre tuiles et non les sept du web, pour deux raisons distinctes :
 *  - « Rappels dus » et « Planifications » n'ont **pas d'écran mobile** (#46 est reportée, le
 *    builder est web-only) — une tuile qui annonce du travail sans y mener est un cul-de-sac
 *    (arbitrage #52) ;
 *  - « Notifications non lues » ferait doublon avec la **pastille de l'onglet Notifs**, visible en
 *    permanence à 200 px de là.
 *
 * « Factures en retard » mène à l'onglet Factures depuis #32. « Débriefs à relire » reste muette
 * jusqu'à #33 : une tuile d'action est un cul-de-sac tant que sa destination n'existe pas.
 */
export function CoachDashboardScreen() {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();

  const athletes = useAthletes();
  const feedbacks = useCoachFeedbacks();
  const invoices = useInvoices();
  const conversations = useConversations();

  // `todayIsoDate()` et non un instant : `Invoice.dueDate` est une date CIVILE, la lire en heure
  // locale ferait basculer de jour aux abords de minuit.
  const today = todayIsoDate();

  /**
   * La jointure des quatre listes vit dans `@cmv/shared`, testée : l'écran ne fait que la rendre.
   * `plans` est volontairement absent — `GET /plans` est une surface coach que le mobile n'a pas,
   * et le builder reste web-only (#20). `buildAthleteRows` tolère chaque source manquante colonne
   * par colonne : les lignes existent, sans cycle.
   */
  const rows = buildAthleteRows({
    athletes: athletes.data,
    plans: undefined,
    feedbacks: feedbacks.data,
    conversations: conversations.data,
    invoices: invoices.data,
    today,
  });

  const sources = [athletes, feedbacks, invoices, conversations];
  const isPending = sources.some((source) => source.isPending);
  const hasFailedSource = sources.some((source) => source.isError);
  const isRefetching = sources.some((source) => source.isRefetching);
  // Ne rejoue QUE ce qui a échoué : réinterroger les sources saines gaspillerait des requêtes.
  const retry = () => {
    for (const source of sources) {
      if (source.isError) source.refetch();
    }
  };

  // Le tirer-pour-rafraîchir, lui, rejoue TOUT : c'est le geste par lequel le coach demande
  // explicitement de l'à-jour, pas une reprise après panne.
  const refreshAll = () => {
    for (const source of sources) {
      source.refetch();
    }
  };

  return (
    <CmvScreen>
      <OfflineBanner />

      <ScrollView
        contentContainerClassName="gap-6 p-4"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refreshAll}
            // Le spinner est natif : il ignore les className, d'où la valeur (issue des tokens).
            tintColor={cmvColors.accent.DEFAULT}
          />
        }
      >
        <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
          {t("dashboard.welcome", { name: session?.user.name ?? "—" })}
        </CmvText>

        {isPending ? <ActivityIndicator /> : null}

        {/* Au-dessus des tuiles, jamais à leur place : celles qui ONT répondu restent lisibles,
            seules celles qui manquent affichent « — ». Une panne partielle n'efface pas l'écran. */}
        {hasFailedSource ? <CmvErrorState onRetry={retry} /> : null}

        <View className="gap-3">
          <CmvText className="text-cmv-text-mid text-xs uppercase">
            {t("dashboard.section.todo")}
          </CmvText>
          <View className="flex-row gap-3">
            <DashboardTile
              label={t("dashboard.tiles.feedback")}
              count={countUnreadFeedbacks(feedbacks.data)}
              hint={t("dashboard.tiles.feedbackHint")}
              tone="warning"
            />
            <DashboardTile
              label={t("dashboard.tiles.overdueInvoices")}
              count={countOverdueInvoices(invoices.data, today)}
              hint={t("dashboard.tiles.overdueInvoicesHint")}
              tone="error"
              onPress={() => router.push("/invoices")}
            />
          </View>
        </View>

        <View className="gap-3">
          <CmvText className="text-cmv-text-mid text-xs uppercase">
            {t("dashboard.section.overview")}
          </CmvText>
          <View className="flex-row gap-3">
            <DashboardTile
              label={t("dashboard.tiles.athletes")}
              count={athletes.data?.length ?? null}
              hint={t("dashboard.tiles.athletesHint")}
            />
            {/* EXCLUT les factures en retard : les deux tuiles partitionnent l'impayé, personne
                n'est compté deux fois (cf. `countPendingInvoices`, tranché en #52). */}
            <DashboardTile
              label={t("dashboard.tiles.invoices")}
              count={countPendingInvoices(invoices.data, today)}
              hint={t("dashboard.tiles.invoicesHint")}
            />
          </View>
        </View>

        <InvitationSection />

        {/* `null` = liste d'athlètes indisponible : le bandeau d'erreur l'a déjà dit, on n'affiche
            pas une liste vide qui laisserait croire que le coach n'a aucun athlète. */}
        {rows == null ? null : (
          <View className="gap-3">
            <CmvText className="text-cmv-text-mid text-xs uppercase">
              {t("dashboard.section.athletes")}
            </CmvText>

            {rows.length === 0 ? (
              <CmvText className="text-cmv-text-lo text-sm">{t("athlete.empty")}</CmvText>
            ) : (
              rows.map((row) => <AthleteRowCard key={row.athleteId} row={row} />)
            )}
          </View>
        )}
      </ScrollView>
    </CmvScreen>
  );
}
