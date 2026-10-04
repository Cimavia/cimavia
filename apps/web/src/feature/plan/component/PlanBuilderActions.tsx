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
  /**
   * L'en-tête, ou la facturation, montre une saisie que l'API n'a pas (#326). La diffusion part
   * avec le cycle et la facture ENREGISTRÉS : sans ce verrou, un destinataire corrigé mais pas
   * enregistré laissait le cycle partir chez l'ancien — et l'API refuse ensuite d'en changer.
   */
  isHeaderUnsaved: boolean;
  isBillingUnsaved: boolean;
  /** Une écriture du builder est en vol — dont l'enregistrement de l'en-tête. */
  isBusy: boolean;
};

type PublishGate = {
  isHeaderUnsaved: boolean;
  hasAthlete: boolean;
  isBillingUnsaved: boolean;
  billingBlocks: boolean;
};

/**
 * Ce qui empêche de diffuser, `null` quand rien ne bloque.
 *
 * Une fonction nommée plutôt qu'une chaîne de ternaires dans le rendu : cet ORDRE est une décision
 * (le message doit dire ce qui manque VRAIMENT, cf. #144), pas une commodité d'écriture.
 *
 * - L'en-tête non enregistré passe AVANT le destinataire : un coach qui vient de le choisir sans
 *   enregistrer lirait sinon « choisis le destinataire », qu'il croit avoir fait (#326).
 * - Puis les verrous de l'API, dans son ordre : destinataire, facturation.
 * - La facturation non enregistrée passe avant la facturation manquante, pour la même raison que
 *   l'en-tête : elle est saisie, il reste à l'enregistrer.
 */
function publishBlockedKey(gate: PublishGate): string | null {
  if (gate.isHeaderUnsaved) return "plan.builder.headerUnsaved";
  if (!gate.hasAthlete) return "plan.builder.athleteRequired";
  if (gate.isBillingUnsaved) return "plan.builder.billingUnsaved";
  return gate.billingBlocks ? "plan.builder.billingRequired" : null;
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
  isHeaderUnsaved,
  isBillingUnsaved,
  isBusy,
}: Readonly<PlanBuilderActionsProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const publish = usePublishPlan();
  const removePlan = useDeletePlan();

  // Info-bulle expliquant pourquoi la diffusion est bloquée — muette sur un cycle déjà diffusé,
  // dont le bouton dit lui-même l'état.
  const publishBlockedTitle = isPublished
    ? null
    : publishBlockedKey({
        isHeaderUnsaved,
        hasAthlete,
        isBillingUnsaved,
        billingBlocks: requiresBilling && !isBillingFilled,
      });
  const deleteBlocked = isPublished
    ? { disabledReason: t("plan.builder.deleteDisabledPublished") }
    : {};

  return (
    <>
      {/* Un cycle diffusé ne se supprime pas : sa facture est émise et l'athlète s'entraîne dessus.
          Le span qui portait la raison restait muet : le bouton y posait son propre `title`. */}
      <CmvConfirmButton
        label={t("plan.builder.delete")}
        confirmLabel={t("common.confirmDelete")}
        cancelLabel={t("common.cancel")}
        disabled={isBusy}
        {...deleteBlocked}
        onConfirm={() =>
          removePlan.mutate(planId, {
            onSuccess: () =>
              navigate({
                to: "/plans",
                search: { q: undefined, state: undefined, athlete: undefined },
              }),
          })
        }
      />

      {/* La diffusion est irréversible et exige au moins une semaine ET une facturation saisie
          (l'API refuse sinon), et ne part pas sur une saisie non enregistrée ni pendant une
          écriture. Info-bulle sur un span : un bouton désactivé ne déclenche pas toujours le
          `title` natif selon le navigateur. */}
      <span title={publishBlockedTitle == null ? undefined : t(publishBlockedTitle)}>
        <CmvButton
          onClick={() => publish.mutate(planId)}
          disabled={
            isPublished || !hasWeeks || publishBlockedTitle != null || isBusy || publish.isPending
          }
        >
          {isPublished ? t("plan.builder.published") : t("plan.builder.publish")}
        </CmvButton>
      </span>
    </>
  );
}
