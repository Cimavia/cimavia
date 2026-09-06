import type { PlanSummaryDto } from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CMV_TABLE, CmvBadge } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";
import { formatDate } from "@/shared/util/date.util";

/**
 * Le bac des brouillons SANS destinataire, en tête de l'écran (#225, maquette frame 1).
 *
 * Ils n'appartiennent à personne : le coach construit un cycle avant de savoir pour qui (#144), et
 * c'est un ÉTAT actionnable — il affecte quand il a décidé. Les ranger sous un athlète « à
 * définir » contredirait la règle dure n°5, `null` n'étant pas une valeur ; les laisser dans le
 * tableau des athlètes leur inventerait un destinataire.
 *
 * Le bac est aussi ce qui rend visible le prix assumé de #207 (« des brouillons vides vont
 * s'accumuler ») : un clic sur « Nouvelle planification » vaut une ligne en base, et elle atterrit
 * ici plutôt que de disparaître.
 *
 * Rend `null` quand il n'y en a aucun : un bac vide annoncerait un travail en attente qui n'existe
 * pas.
 */

type UnassignedDraftsSectionProps = {
  drafts: readonly PlanSummaryDto[];
};

export function UnassignedDraftsSection({ drafts }: Readonly<UnassignedDraftsSectionProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (drafts.length === 0) return null;

  return (
    <section className={cn(CMV_TABLE.frame, "bg-cmv-bg-1")}>
      <div className="flex flex-wrap items-center gap-cmv-sm border-cmv-border border-b bg-cmv-surface px-cmv-lg py-cmv-sm">
        <h2 className="text-cmv-subtitle text-cmv-text-hi">{t("plan.drafts.title")}</h2>
        <CmvBadge>{String(drafts.length)}</CmvBadge>
        <p className="text-cmv-caption text-cmv-text-lo">{t("plan.drafts.hint")}</p>
      </div>

      {drafts.map((draft) => (
        <button
          key={draft.id}
          type="button"
          onClick={() => navigate({ to: "/plans/$planId", params: { planId: draft.id } })}
          className={cn(
            CMV_TABLE.row,
            "flex w-full flex-wrap items-center gap-cmv-md px-cmv-lg py-cmv-sm text-left transition-colors hover:bg-cmv-surface",
          )}
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-cmv-text-hi">{draft.title}</span>
            <span className="text-cmv-caption text-cmv-text-lo">
              {t("plan.card.counts", { weeks: draft.weekCount, sessions: draft.sessionCount })}
            </span>
          </span>

          <span className="text-cmv-caption text-cmv-text-mid">
            {t("plan.drafts.startsOn", { date: formatDate(draft.startDate) })}
          </span>

          {/* « À définir » est un CHOIX que le coach n'a pas encore fait — actionnable, il ouvre le
              cycle et l'affecte. Ce n'est pas un nom qu'on n'a pas su résoudre, qui serait « — ». */}
          <CmvBadge>{t("plan.unassigned")}</CmvBadge>
        </button>
      ))}
    </section>
  );
}
