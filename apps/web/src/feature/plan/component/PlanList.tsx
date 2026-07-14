import { PlanStatus, type PlanSummaryDto } from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAthletes } from "@/feature/plan/hook/usePlans";
import { CmvBadge, CmvCard } from "@/shared/component";
import { formatDate } from "@/shared/util/date.util";

type PlanListProps = {
  plans: PlanSummaryDto[];
};

export function PlanList({ plans }: Readonly<PlanListProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: athletes } = useAthletes();

  // Le plan porte l'athleteId ; son nom vient de la relation (une seule requête, mise en cache).
  const nameById = new Map(
    (athletes ?? []).map((relation) => [relation.athleteId, relation.athleteName]),
  );

  return (
    <div className="grid gap-cmv-md md:grid-cols-2 xl:grid-cols-3">
      {plans.map((plan) => (
        <CmvCard
          key={plan.id}
          onClick={() => navigate({ to: "/plans/$planId", params: { planId: plan.id } })}
        >
          <div className="flex flex-col gap-cmv-sm">
            <div className="flex items-start gap-cmv-sm">
              <h3 className="flex-1 text-cmv-subtitle text-cmv-text-hi">{plan.title}</h3>
              <CmvBadge variant={plan.status === PlanStatus.PUBLISHED ? "accent" : "neutral"}>
                {t(`plan.status.${plan.status}`)}
              </CmvBadge>
            </div>

            <p className="text-cmv-caption text-cmv-text-mid">
              {nameById.get(plan.athleteId) ?? "—"}
            </p>

            <p className="text-cmv-caption text-cmv-text-lo">
              {t("plan.card.meta", {
                weeks: plan.weekCount,
                sessions: plan.sessionCount,
                date: formatDate(plan.startDate),
              })}
            </p>
          </div>
        </CmvCard>
      ))}
    </div>
  );
}
