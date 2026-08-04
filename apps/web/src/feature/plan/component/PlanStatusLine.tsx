import type { PlanDto } from "@cmv/shared";
import { PlanStatus } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvBadge } from "@/shared/component";

type PlanStatusLineProps = {
  status: PlanDto["status"];
  /** Termes de facturation saisis (facture DRAFT existante) : verrou de la diffusion. */
  isBillingFilled: boolean;
};

/**
 * Ce qu'il manque pour diffuser, dit sous le statut plutôt que découvert au clic sur un bouton
 * grisé. `null` quand il n'y a rien à signaler — un cycle en brouillon prêt à partir n'a pas
 * besoin de commentaire.
 */
function hintKeyFor(isPublished: boolean, isBillingFilled: boolean): string | null {
  if (isPublished) return "plan.builder.publishedHint";
  if (!isBillingFilled) return "plan.builder.billingRequired";
  return null;
}

// Statut du cycle + l'indice qui l'accompagne.
export function PlanStatusLine({ status, isBillingFilled }: Readonly<PlanStatusLineProps>) {
  const { t } = useTranslation();
  const isPublished = status === PlanStatus.PUBLISHED;
  const hintKey = hintKeyFor(isPublished, isBillingFilled);

  return (
    <div className="flex items-center gap-cmv-sm">
      <CmvBadge variant={isPublished ? "accent" : "neutral"}>{t(`plan.status.${status}`)}</CmvBadge>
      {hintKey == null ? null : (
        <span className="text-cmv-caption text-cmv-text-lo">{t(hintKey)}</span>
      )}
    </div>
  );
}
