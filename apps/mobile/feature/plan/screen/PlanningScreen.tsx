import type { AthleteCalendarWeek, PlanDto, ScheduledSessionSummaryDto } from "@cmv/shared";
import { athleteCalendarWeek, mondayOfIsoWeek, todayIsoDate } from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, RefreshControl, ScrollView } from "react-native";
import { useMyCoach } from "@/feature/coach";
import { CurrentWeekSection } from "@/feature/plan/component/CurrentWeekSection";
import { PlanningNotice } from "@/feature/plan/component/PlanningNotice";
import { useMyPlans } from "@/feature/plan/hook/useMyPlan";
import { useOfflineDocuments } from "@/feature/plan/hook/useOfflineDocuments";
import { CmvErrorState, CmvScreen } from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";

/**
 * Ce que l'écran a à montrer, en un seul état — les six cas s'excluent, et l'exclusivité vaut
 * mieux affirmée ici que reconstituée à chaque bloc par une conjonction de négations.
 *
 * Trois nuances qui ne se devinent pas :
 *  - « sans coach » et « coach sans cycle diffusé » sont DIFFÉRENTS : dire à un athlète non
 *    rattaché que son coach n'a rien diffusé le laisserait attendre pour rien ;
 *  - hors-ligne, le cache sert encore les cycles — l'erreur n'a donc de sens que sans données ;
 *  - « aucun cycle n'a cours cette semaine » n'est pas « semaine de repos ». Les deux montrent
 *    zéro séance et disent l'inverse l'un de l'autre : seul `cycles` les sépare (#172).
 */
type PlanningState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "noCoach" }
  | { kind: "noPlan" }
  | { kind: "outOfCycle" }
  | { kind: "week"; week: AthleteCalendarWeek<ScheduledSessionSummaryDto> };

export function resolvePlanningState(
  isPending: boolean,
  isError: boolean,
  plans: PlanDto[] | undefined,
  hasCoach: boolean,
  week: AthleteCalendarWeek<ScheduledSessionSummaryDto> | null,
): PlanningState {
  if (isPending) return { kind: "loading" };
  if (plans == null) return isError ? { kind: "error" } : { kind: "noCoach" };
  if (plans.length === 0) return hasCoach ? { kind: "noPlan" } : { kind: "noCoach" };
  // Des cycles existent, mais aucun ne couvre la semaine en cours : ils sont finis, ou pas encore
  // commencés. On le dit — sept lignes de « Repos » diraient exactement le contraire.
  if (week == null || week.cycles.length === 0) return { kind: "outOfCycle" };
  return { kind: "week", week };
}

// Vue semaine de l'athlète (p3-4) : la semaine CIVILE en cours, alimentée par tous ses cycles.
export function PlanningScreen() {
  const { t } = useTranslation();
  const { data: plans, isPending, isError, isRefetching, refetch } = useMyPlans();
  const { data: coach } = useMyCoach();

  // Le planning est l'écran d'accueil de l'athlète, donc le dernier passage en ligne avant la
  // salle : c'est là qu'on met séances et documents sur l'appareil, pas à l'ouverture d'une séance.
  useOfflineDocuments();

  const today = todayIsoDate();
  const monday = mondayOfIsoWeek(today);
  // Toujours la semaine en cours, jamais un repli sur le début d'un cycle : l'écran s'intitule
  // « Cette semaine », et lui montrer une autre semaine sous ce titre serait un mensonge.
  const week = monday == null || plans == null ? null : athleteCalendarWeek(plans, monday);
  const state = resolvePlanningState(isPending, isError, plans, coach != null, week);

  return (
    <CmvScreen>
      <OfflineBanner />

      {/* Tirer pour rafraîchir : le geste attendu sur mobile, et le seul contrôle DIRECT de
          l'athlète sur la fraîcheur — les autres refetch (retour au premier plan, retour du
          réseau) sont automatiques et invisibles. */}
      <ScrollView
        contentContainerClassName="gap-6 p-4"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            // Le spinner est natif : il ignore les className, d'où la valeur (issue des tokens).
            tintColor={cmvColors.accent.DEFAULT}
          />
        }
      >
        {state.kind === "loading" ? <ActivityIndicator /> : null}

        {state.kind === "error" ? <CmvErrorState onRetry={() => refetch()} /> : null}

        {state.kind === "noCoach" ? (
          <PlanningNotice
            title={t("coach.missing.title")}
            description={t("coach.missing.description")}
            actionLabel={t("coach.missing.action")}
            onAction={() => router.push("/join")}
          />
        ) : null}

        {state.kind === "noPlan" ? (
          <PlanningNotice title={t("plan.empty.title")} description={t("plan.empty.description")} />
        ) : null}

        {state.kind === "outOfCycle" ? (
          <PlanningNotice title={t("plan.thisWeek")} description={t("plan.outOfCycle")} />
        ) : null}

        {state.kind === "week" ? <CurrentWeekSection week={state.week} today={today} /> : null}
      </ScrollView>
    </CmvScreen>
  );
}
