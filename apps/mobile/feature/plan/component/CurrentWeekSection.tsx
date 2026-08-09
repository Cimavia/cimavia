import { type PlanWeekDto, PlanWeekType } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { PlanWeekList } from "@/feature/plan/component/PlanWeekList";
import { CmvBadge, CmvText } from "@/shared/component";
import { formatDateRange } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values plan.weekType: PlanWeekType

type CurrentWeekSectionProps = {
  week: PlanWeekDto;
  today: string;
};

// L'en-tête de la semaine en cours et ses séances.
export function CurrentWeekSection({ week, today }: Readonly<CurrentWeekSectionProps>) {
  const { t } = useTranslation();
  const doneCount = week.sessions.filter((session) => session.status === "DONE").length;

  return (
    <>
      <View className="gap-1">
        <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
          {t("plan.thisWeek")}
        </CmvText>

        {/* La semaine de décharge se repère à sa couleur : c'est l'exception du cycle, et la
            confondre avec une semaine d'entraînement fausse l'effort de l'athlète. */}
        <CmvBadge
          label={t("plan.week.numberAndType", {
            number: week.weekNumber,
            type: t(`plan.weekType.${week.type}`),
          })}
          variant={week.type === PlanWeekType.DELOAD ? "info" : "neutral"}
        />

        <CmvText className="text-cmv-text-lo text-sm">
          {formatDateRange(week.startDate, week.endDate)} ·{" "}
          {t("plan.doneCount", { done: doneCount, total: week.sessions.length })}
        </CmvText>

        {week.note == null ? null : (
          <CmvText className="text-cmv-text-mid text-sm">{week.note}</CmvText>
        )}
      </View>

      <PlanWeekList week={week} today={today} />
    </>
  );
}
