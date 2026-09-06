import { PlanStatus, type PlanSummaryDto } from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CmvBadge, CmvCard } from "@/shared/component";
import { useAthleteLabel } from "@/shared/hook/useAthleteLabel";
import { formatDate } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values plan.status: PlanStatus

type PlanListProps = {
  plans: PlanSummaryDto[];
};

export function PlanList({ plans }: Readonly<PlanListProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();

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

            {/* Trois états, pas deux. « À définir » est un CHOIX que le coach n'a pas encore
                fait — actionnable, il ouvre le cycle et l'affecte ; « — » est un nom qu'on n'a
                pas su résoudre. Les rendre pareil masquerait le seul des deux sur lequel il y a
                quelque chose à faire.

                Le nom vient du DTO, jamais d'une seconde requête : `PlanSummaryDto` le PORTE
                (`athleteName`, résolu côté API depuis `Plan.athlete`), et c'est même ce pour quoi
                le champ existe. Le résoudre via `GET /athletes` coûtait une requête ET mentait —
                cette liste-là est celle des RELATIONS coach↔athlète, si bien qu'un athlète dont la
                relation a été retirée s'affichait « — » alors que la réponse le nommait. */}
            <p className="text-cmv-caption text-cmv-text-mid">
              <AthleteName plan={plan} />
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

/**
 * Qui reçoit ce cycle, en trois états distincts (cf. le commentaire de la carte).
 *
 * `athleteName` à `null` alors que `athleteId` ne l'est pas ne devrait pas se produire — le mapper
 * pose les trois champs ensemble, ils disent la MÊME absence. Le type l'autorise pourtant, et un
 * rendu qui ne le prévoit pas afficherait « null » en clair : « — » est ce qu'on écrit quand on ne
 * sait pas, jamais « à définir », qui prétendrait qu'il reste un choix à faire.
 */
function AthleteName({ plan }: Readonly<{ plan: PlanSummaryDto }>) {
  const { t } = useTranslation();
  const athleteLabel = useAthleteLabel();

  if (plan.athleteId == null) return <>{t("plan.unassigned")}</>;
  if (plan.athleteName == null) return <>—</>;
  return <>{athleteLabel(plan.athleteId, plan.athleteName)}</>;
}
