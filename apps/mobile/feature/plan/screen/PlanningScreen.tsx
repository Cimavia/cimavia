import type { AthleteCalendarWeek, PlanDto, ScheduledSessionSummaryDto } from "@cmv/shared";
import {
  athleteCalendarBounds,
  athleteCalendarWeek,
  defaultAthleteMonday,
  todayIsoDate,
} from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, RefreshControl, ScrollView } from "react-native";
import { useMyCoach } from "@/feature/coach";
import { CurrentWeekSection } from "@/feature/plan/component/CurrentWeekSection";
import { PlanningNotice } from "@/feature/plan/component/PlanningNotice";
import { WeekNavHeader } from "@/feature/plan/component/WeekNavHeader";
import { useMyPlans } from "@/feature/plan/hook/useMyPlan";
import { useOfflineDocuments } from "@/feature/plan/hook/useOfflineDocuments";
import { CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";

/**
 * Ce que l'écran a à montrer, en un seul état — les cinq cas s'excluent, et l'exclusivité vaut
 * mieux affirmée ici que reconstituée à chaque bloc par une conjonction de négations.
 *
 * Deux nuances qui ne se devinent pas :
 *  - « sans coach » et « coach sans cycle diffusé » sont DIFFÉRENTS : dire à un athlète non
 *    rattaché que son coach n'a rien diffusé le laisserait attendre pour rien ;
 *  - hors-ligne, le cache sert encore les cycles — l'erreur n'a donc de sens que sans données.
 *
 * « Aucun cycle n'a cours cette semaine-là » n'est plus un cas ici depuis #236 : c'est une semaine
 * comme une autre, `cycles` vide, que le rendu COMMENTE au lieu de la remplacer. En faire un état
 * exclusif retirait ses commandes à l'écran, et « suivant » menait à un cul-de-sac.
 */
type PlanningState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "noCoach" }
  | { kind: "noPlan" }
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
  // Aucun cycle, ou aucun cycle SITUABLE dans le temps : dans les deux cas il n'y a pas de semaine
  // à parcourir, et sept cases muettes ne diraient rien de plus que l'état vide.
  if (plans.length === 0 || week == null) {
    return hasCoach ? { kind: "noPlan" } : { kind: "noCoach" };
  }
  return { kind: "week", week };
}

// Vue semaine de l'athlète (p3-4) : une semaine CIVILE, alimentée par tous ses cycles, et de quoi
// passer à la précédente ou à la suivante (#236).
export function PlanningScreen() {
  const { t } = useTranslation();
  const { data: plans, isPending, isError, isRefetching, refetch } = useMyPlans();
  const { data: coach } = useMyCoach();

  // Le planning est l'écran d'accueil de l'athlète, donc le dernier passage en ligne avant la
  // salle : c'est là qu'on met séances et documents sur l'appareil, pas à l'ouverture d'une séance.
  useOfflineDocuments();

  // La semaine CHOISIE, pas la semaine affichée : `null` veut dire « le défaut », qui se recalcule
  // à chaque rendu. Initialiser l'état depuis `plans` le figerait sur le premier rendu, où la
  // requête n'a pas encore répondu — l'écran resterait alors sur ce défaut-là pour toujours.
  const [chosenMonday, setChosenMonday] = useState<string | null>(null);

  const today = todayIsoDate();
  // Le défaut n'est pas le calendrier mais « la semaine où il y a quelque chose à voir » : la
  // semaine d'aujourd'hui dès qu'un cycle a cours, sinon le début du cycle servi. C'est ce qui
  // fait disparaître l'écran muet du dimanche soir, la veille d'un cycle qui commence.
  const monday = chosenMonday ?? defaultAthleteMonday(plans ?? [], today);
  const week = monday == null || plans == null ? null : athleteCalendarWeek(plans, monday);
  const state = resolvePlanningState(isPending, isError, plans, coach != null, week);

  return (
    <CmvScreen>
      <OfflineBanner />

      {/* Le bandeau reste HORS du `ScrollView` : les sept jours défilent dessous, et les commandes
          de semaine restent atteignables sans remonter. */}
      {state.kind === "week" ? (
        <WeekNavHeader
          week={state.week}
          bounds={plans == null ? null : athleteCalendarBounds(plans)}
          isDefault={chosenMonday == null}
          onGoToMonday={setChosenMonday}
        />
      ) : null}

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

        {state.kind === "week" ? (
          <>
            {/* Aucun cycle n'a cours cette semaine-là. On rend quand même les sept jours — c'est la
                navigation qui a mené ici —, mais on le DIT : sinon une semaine hors cycle se lirait
                comme une semaine de repos, qui est l'exact contraire (#172). */}
            {state.week.cycles.length === 0 ? (
              <CmvText className="text-cmv-text-mid text-sm">{t("plan.outOfCycle")}</CmvText>
            ) : null}

            <CurrentWeekSection week={state.week} today={today} />
          </>
        ) : null}
      </ScrollView>
    </CmvScreen>
  );
}
