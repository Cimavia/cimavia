import type {
  AthleteCalendarCycle,
  AthleteCalendarWeek,
  ScheduledSessionSummaryDto,
} from "@cmv/shared";
import { PlanWeekType } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { PlanWeekList } from "@/feature/plan/component/PlanWeekList";
import { CmvBadge, CmvText } from "@/shared/component";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values plan.weekType: PlanWeekType

type CurrentWeekSectionProps = {
  week: AthleteCalendarWeek<ScheduledSessionSummaryDto>;
  today: string;
};

/**
 * Les cycles qui ont cours dans la semaine affichée, et ses séances.
 *
 * Le numéro de semaine a quitté l'en-tête pour la ligne de son cycle (#172) : « S3/4 » n'a de sens
 * qu'à côté du cycle qui le compte, et deux cycles concurrents n'en sont jamais à la même semaine
 * — coiffer la semaine civile d'un seul numéro en désignerait un au hasard.
 *
 * La plage de dates et le compteur ont suivi, vers `WeekNavHeader` (#236) : ils coiffent l'écran,
 * pas ce bloc, parce qu'ils restent vrais quand on change de semaine et qu'ils doivent rester
 * lisibles quand les sept jours ont défilé.
 */
export function CurrentWeekSection({ week, today }: Readonly<CurrentWeekSectionProps>) {
  return (
    <>
      {/* Ce qui court cette semaine, AVANT les jours : avec deux cycles concurrents, savoir sur
          quoi on est engagé conditionne la lecture des sept lignes. Rien du tout quand aucun n'a
          cours — la phrase de l'écran le dit déjà, un cadre vide n'ajouterait rien. */}
      {week.cycles.length === 0 ? null : (
        <View className="gap-2">
          {week.cycles.map((cycle) => (
            <CycleLine key={cycle.planId} cycle={cycle} />
          ))}
        </View>
      )}

      <PlanWeekList week={week} today={today} />
    </>
  );
}

/** Un cycle en cours : son nom, son avancement, la note que le coach a laissée sur la semaine. */
function CycleLine({ cycle }: Readonly<{ cycle: AthleteCalendarCycle }>) {
  const { t } = useTranslation();

  return (
    <View className="gap-1 rounded-lg border border-cmv-border bg-cmv-surface px-3 py-2">
      <View className="flex-row flex-wrap items-center gap-2">
        <CmvText className="text-cmv-text-hi">{cycle.title}</CmvText>
        {/* La semaine de décharge se repère à sa couleur : c'est l'exception du cycle, et la
            confondre avec une semaine d'entraînement fausse l'effort de l'athlète. */}
        <CmvBadge
          label={t("plan.cycle.week", {
            number: cycle.weekNumber,
            total: cycle.weekCount,
            type: t(`plan.weekType.${cycle.type}`),
          })}
          variant={cycle.type === PlanWeekType.DELOAD ? "info" : "neutral"}
        />
      </View>
      {cycle.note == null ? null : (
        <CmvText className="text-cmv-text-mid text-sm">{cycle.note}</CmvText>
      )}
    </View>
  );
}
