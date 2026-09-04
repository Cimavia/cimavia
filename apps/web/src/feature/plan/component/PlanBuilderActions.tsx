import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useDeletePlan, usePublishPlan } from "@/feature/plan/hook/usePlans";
import { CmvButton, CmvConfirmButton } from "@/shared/component";

type PlanBuilderActionsProps = {
  planId: string;
  isPublished: boolean;
  hasWeeks: boolean;
  /** Un cycle sans destinataire n'a personne à qui être diffusé (#144) — l'API refuse en 400. */
  hasAthlete: boolean;
  /** Termes de facturation saisis (facture DRAFT existante) : verrou de la diffusion. */
  isBillingFilled: boolean;
  /** Faux en auto-coaching : on ne se facture pas soi-même, l'API lève le gating (#14). */
  requiresBilling: boolean;
  isBusy: boolean;
};

/**
 * Ce qui manque pour diffuser, dans l'ORDRE des verrous de l'API — destinataire, puis facturation.
 * `null` quand rien ne bloque.
 *
 * Une fonction nommée plutôt qu'une chaîne de ternaires dans le rendu : cet ordre est une décision
 * (le message doit dire ce qui manque VRAIMENT, cf. #144), pas une commodité d'écriture.
 */
function publishBlockedKey(
  isPublished: boolean,
  hasAthlete: boolean,
  billingBlocks: boolean,
): string | null {
  if (isPublished) return null;
  if (!hasAthlete) return "plan.builder.athleteRequired";
  return billingBlocks ? "plan.builder.billingRequired" : null;
}

/**
 * Les deux actions destructrices/irréversibles du builder, sorties de l'écran : ce sont elles qui
 * portent tout le gating (diffusion conditionnée aux semaines, au destinataire ET à la
 * facturation, suppression interdite après diffusion), et l'écran n'a pas à connaître ces règles
 * pour disposer sa page.
 */
export function PlanBuilderActions({
  planId,
  isPublished,
  hasWeeks,
  hasAthlete,
  isBillingFilled,
  requiresBilling,
  isBusy,
}: Readonly<PlanBuilderActionsProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const publish = usePublishPlan();
  const removePlan = useDeletePlan();

  // Info-bulle expliquant pourquoi la diffusion est bloquée. Le destinataire passe AVANT la
  // facturation, dans le même ordre que les verrous de l'API : un cycle sans athlète ni
  // facturation manque d'abord de quelqu'un à qui parler, pas d'un montant.
  const billingBlocks = requiresBilling && !isBillingFilled;
  const publishBlockedTitle = publishBlockedKey(isPublished, hasAthlete, billingBlocks);

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
      <span title={publishBlockedTitle == null ? undefined : t(publishBlockedTitle)}>
        <CmvButton
          onClick={() => publish.mutate(planId)}
          disabled={isPublished || !hasWeeks || !hasAthlete || billingBlocks || publish.isPending}
        >
          {isPublished ? t("plan.builder.published") : t("plan.builder.publish")}
        </CmvButton>
      </span>
    </>
  );
}
