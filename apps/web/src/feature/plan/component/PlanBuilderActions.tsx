import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useDeletePlan, usePublishPlan } from "@/feature/plan/hook/usePlans";
import { CmvButton, CmvConfirmButton } from "@/shared/component";

type PlanBuilderActionsProps = {
  planId: string;
  isPublished: boolean;
  hasWeeks: boolean;
  /** Termes de facturation saisis (facture DRAFT existante) : verrou de la diffusion. */
  isBillingFilled: boolean;
  isBusy: boolean;
};

/**
 * Les deux actions destructrices/irréversibles du builder, sorties de l'écran : ce sont elles qui
 * portent tout le gating (diffusion conditionnée aux semaines ET à la facturation, suppression
 * interdite après diffusion), et l'écran n'a pas à connaître ces règles pour disposer sa page.
 */
export function PlanBuilderActions({
  planId,
  isPublished,
  hasWeeks,
  isBillingFilled,
  isBusy,
}: Readonly<PlanBuilderActionsProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const publish = usePublishPlan();
  const removePlan = useDeletePlan();

  // Info-bulle expliquant pourquoi la diffusion est bloquée (facturation à saisir d'abord).
  const publishBlockedTitle =
    !isPublished && !isBillingFilled ? t("plan.builder.billingRequired") : undefined;

  return (
    <>
      {/* Un cycle diffusé ne se supprime pas : sa facture est émise et l'athlète s'entraîne dessus.
          Info-bulle sur un span (le `title` d'un bouton désactivé ne s'affiche pas partout). */}
      <span title={isPublished ? t("plan.builder.deleteDisabledPublished") : undefined}>
        <CmvConfirmButton
          label={t("plan.builder.delete")}
          confirmLabel={t("common.confirmDelete")}
          cancelLabel={t("common.cancel")}
          disabled={isBusy || isPublished}
          onConfirm={() =>
            removePlan.mutate(planId, { onSuccess: () => navigate({ to: "/plans" }) })
          }
        />
      </span>

      {/* La diffusion est irréversible et exige au moins une semaine ET une facturation saisie
          (l'API refuse sinon). Info-bulle sur un span : un bouton désactivé ne déclenche pas
          toujours le `title` natif selon le navigateur. */}
      <span title={publishBlockedTitle}>
        <CmvButton
          onClick={() => publish.mutate(planId)}
          disabled={isPublished || !hasWeeks || !isBillingFilled || publish.isPending}
        >
          {isPublished ? t("plan.builder.published") : t("plan.builder.publish")}
        </CmvButton>
      </span>
    </>
  );
}
