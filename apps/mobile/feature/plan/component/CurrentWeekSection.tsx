import type {
  AthleteCalendarCycle,
  AthleteCalendarWeek,
  ScheduledSessionSummaryDto,
} from "@cmv/shared";
import { PlanWeekType, weekSessionProgress } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { PlanWeekList } from "@/feature/plan/component/PlanWeekList";
import { CmvBadge, CmvText } from "@/shared/component";
import { formatDateRange } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values plan.weekType: PlanWeekType

type CurrentWeekSectionProps = {
  week: AthleteCalendarWeek<ScheduledSessionSummaryDto>;
  today: string;
};

/**
 * L'en-tête de la semaine en cours et ses séances.
 *
 * Le numéro de semaine a quitté cet en-tête pour la ligne de son cycle (#172) : « S3/4 » n'a de
 * sens qu'à côté du cycle qui le compte, et deux cycles concurrents n'en sont jamais à la même
 * semaine — coiffer la semaine civile d'un seul numéro en désignerait un au hasard.
 */
export function CurrentWeekSection({ week, today }: Readonly<CurrentWeekSectionProps>) {
  const { t } = useTranslation();
  // La dérivation vit dans @cmv/shared, testée : « fait » n'a qu'une définition, et le web
  // affiche le même compteur (#25).
  const progress = weekSessionProgress(
    week.days.flatMap((day) => day.entries.map((entry) => entry.session)),
  );

  return (
    <>
      <View className="gap-1">
        <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
          {t("plan.thisWeek")}
        </CmvText>

        <CmvText className="text-cmv-text-lo text-sm">
          {formatDateRange(week.startDate, week.endDate)} ·{" "}
          {progress == null
            ? "—"
            : t("plan.doneCount", { done: progress.done, total: progress.total })}
        </CmvText>
      </View>

      {/* Ce qui court cette semaine, AVANT les jours : avec deux cycles concurrents, savoir sur
          quoi on est engagé conditionne la lecture des sept lignes. */}
      <View className="gap-2">
        {week.cycles.map((cycle) => (
          <CycleLine key={cycle.planId} cycle={cycle} />
        ))}
      </View>

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
