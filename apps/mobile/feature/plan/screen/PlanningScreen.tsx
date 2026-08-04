import type { PlanDto, PlanWeekDto } from "@cmv/shared";
import { todayIsoDate } from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, RefreshControl, ScrollView } from "react-native";
import { useMyCoach } from "@/feature/coach";
import { CurrentWeekSection } from "@/feature/plan/component/CurrentWeekSection";
import { PlanningNotice } from "@/feature/plan/component/PlanningNotice";
import { currentWeek, useMyPlan } from "@/feature/plan/hook/useMyPlan";
import { CmvErrorState, CmvScreen } from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";

/**
 * Ce que l'écran a à montrer, en un seul état — les six cas s'excluent, et l'exclusivité vaut
 * mieux affirmée ici que reconstituée à chaque bloc par une conjonction de négations.
 *
 * Deux nuances qui ne se devinent pas :
 *  - « sans coach » et « coach sans cycle diffusé » sont DIFFÉRENTS : dire à un athlète non
 *    rattaché que son coach n'a rien diffusé le laisserait attendre pour rien ;
 *  - hors-ligne, le cache sert encore le cycle — l'erreur n'a donc de sens que sans données.
 */
type PlanningState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "noCoach" }
  | { kind: "noPlan" }
  | { kind: "outOfCycle"; plan: PlanDto }
  | { kind: "week"; week: PlanWeekDto };

function resolvePlanningState(
  isPending: boolean,
  isError: boolean,
  plan: PlanDto | null | undefined,
  hasCoach: boolean,
  week: PlanWeekDto | null,
): PlanningState {
  if (isPending) return { kind: "loading" };
  if (plan == null) {
    if (isError) return { kind: "error" };
    return hasCoach ? { kind: "noPlan" } : { kind: "noCoach" };
  }
  // Un cycle existe mais aucune semaine ne contient aujourd'hui : il est fini ou à venir. On le
  // dit, plutôt que d'afficher la semaine 1 comme si c'était la semaine courante.
  return week == null ? { kind: "outOfCycle", plan } : { kind: "week", week };
}

// Vue semaine de l'athlète (p3-4) : la semaine EN COURS de son cycle diffusé.
export function PlanningScreen() {
  const { t } = useTranslation();
  const { data: plan, isPending, isError, isRefetching, refetch } = useMyPlan();
  const { data: coach } = useMyCoach();

  const today = todayIsoDate();
  const state = resolvePlanningState(isPending, isError, plan, coach != null, currentWeek(plan));

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
          <PlanningNotice title={state.plan.title} description={t("plan.outOfCycle")} />
        ) : null}

        {state.kind === "week" ? <CurrentWeekSection week={state.week} today={today} /> : null}
      </ScrollView>
    </CmvScreen>
  );
}
