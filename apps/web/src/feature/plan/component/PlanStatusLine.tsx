import type { PlanAudience, PlanDto } from "@cmv/shared";
import { PlanStatus } from "@cmv/shared";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { CmvBadge } from "@/shared/component";
import { formatDate } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
//
// L'annotation vivait dans `PlanList`, qui n'assemblait pas cette clé — le registre du script
// étant global, elle couvrait ce fichier par accident. La suppression de `PlanList` en #225 l'a
// mise au jour : une annotation appartient au fichier qui BÂTIT la clé.
// i18n-values plan.status: PlanStatus
// i18n-values plan.builder.audience: VISIBLE_UPCOMING, VISIBLE_ALONE, VISIBLE_WITH, ENDED_SUPERSEDED, ENDED_LAST

type PlanStatusLineProps = {
  status: PlanDto["status"];
  /** Un cycle sans destinataire ne se diffuse pas (#144) : c'est ce qui manque en premier. */
  hasAthlete: boolean;
  /** Termes de facturation saisis (facture DRAFT existante) : verrou de la diffusion. */
  isBillingFilled: boolean;
  /**
   * Faux en auto-coaching : on ne se facture pas soi-même, l'API lève alors le gating (#14). Une
   * prop distincte plutôt qu'un `isBillingFilled` forcé à vrai — ce serait mentir sur son nom, et
   * le jour où une troisième condition s'ajoute plus personne ne saurait ce que ce booléen dit.
   */
  requiresBilling: boolean;
  /**
   * Ce que l'athlète voit de CE cycle (#172). `null` = pas encore su (liste des cycles en cours de
   * chargement) ou cycle non situable : on se tait, plutôt que d'affirmer qu'il le voit.
   */
  audience: PlanAudience | null;
  /** De quoi nommer les cycles qu'une audience désigne par leur id. */
  titlesById: ReadonlyMap<string, string>;
};

/**
 * Ce qu'il manque pour diffuser, dit sous le statut plutôt que découvert au clic sur un bouton
 * grisé. `null` quand il n'y a rien à signaler — un cycle en brouillon prêt à partir n'a pas
 * besoin de commentaire.
 */
function draftHintKey(
  hasAthlete: boolean,
  isBillingFilled: boolean,
  requiresBilling: boolean,
): string | null {
  // Le destinataire avant la facturation, comme dans les verrous de l'API : réclamer un montant à
  // qui n'a pas encore choisi à qui il s'adresse, c'est nommer le second manque et taire le premier.
  if (!hasAthlete) return "plan.builder.athleteRequired";
  if (requiresBilling && !isBillingFilled) return "plan.builder.billingRequired";
  return null;
}

// Statut du cycle + l'indice qui l'accompagne.
export function PlanStatusLine({
  status,
  hasAthlete,
  isBillingFilled,
  requiresBilling,
  audience,
  titlesById,
}: Readonly<PlanStatusLineProps>) {
  const { t } = useTranslation();
  const isPublished = status === PlanStatus.PUBLISHED;

  return (
    <div className="flex flex-wrap items-center gap-cmv-sm">
      <CmvBadge variant={isPublished ? "accent" : "neutral"}>{t(`plan.status.${status}`)}</CmvBadge>
      {isPublished ? (
        <AudienceHint audience={audience} titlesById={titlesById} />
      ) : (
        <DraftHint
          hasAthlete={hasAthlete}
          isBillingFilled={isBillingFilled}
          requiresBilling={requiresBilling}
        />
      )}
    </div>
  );
}

function DraftHint({
  hasAthlete,
  isBillingFilled,
  requiresBilling,
}: Readonly<Pick<PlanStatusLineProps, "hasAthlete" | "isBillingFilled" | "requiresBilling">>) {
  const { t } = useTranslation();
  const key = draftHintKey(hasAthlete, isBillingFilled, requiresBilling);
  if (key == null) return null;

  return <span className="text-cmv-caption text-cmv-text-lo">{t(key)}</span>;
}

/**
 * Ce que l'athlète voit du cycle diffusé — six cas, et non l'affirmation unique d'avant #172
 * (« L'athlète voit ce cycle », assénée sans condition alors qu'elle pouvait être fausse).
 *
 * `null` en entrée → rien à l'écran. Se taire est la seule réponse honnête tant qu'on ne sait pas :
 * c'est une affirmation vraie PAR DÉFAUT qui a produit le défaut qu'on corrige.
 */
function AudienceHint({
  audience,
  titlesById,
}: Readonly<Pick<PlanStatusLineProps, "audience" | "titlesById">>) {
  const { t } = useTranslation();
  if (audience == null) return null;

  // Les cycles sont désignés par id — c'est l'écran qui a la liste et peut les nommer, comme le
  // bandeau de chevauchement de la liste des planifications. Un id manquant se tait.
  const names = (ids: readonly string[]) =>
    ids
      .map((id) => titlesById.get(id))
      .filter((title): title is string => title != null)
      .join(", ");

  const text = hintTextOf(audience, t, names);
  if (text == null) return null;

  return <span className="text-cmv-caption text-cmv-text-lo">{text}</span>;
}

/**
 * Le `switch` fait le narrowing que le type porte : chaque cas ne lit que les champs de SA variante,
 * et ajouter une septième situation à `PlanAudience` rendra ce fichier rouge plutôt que muet.
 */
function hintTextOf(
  audience: PlanAudience,
  t: TFunction,
  names: (ids: readonly string[]) => string,
): string | null {
  switch (audience.kind) {
    // Le brouillon parle par `DraftHint`, qui dit ce qui MANQUE — plus utile que « pas encore vu ».
    case "NOT_PUBLISHED":
      return null;
    case "VISIBLE_UPCOMING":
      return t("plan.builder.audience.VISIBLE_UPCOMING", { date: formatDate(audience.startDate) });
    case "VISIBLE_ALONE":
      return t("plan.builder.audience.VISIBLE_ALONE");
    case "VISIBLE_WITH":
      return t("plan.builder.audience.VISIBLE_WITH", { others: names(audience.otherPlanIds) });
    case "ENDED_SUPERSEDED":
      return t("plan.builder.audience.ENDED_SUPERSEDED", {
        instead: names(audience.insteadPlanIds),
      });
    case "ENDED_LAST":
      return t("plan.builder.audience.ENDED_LAST");
  }
}
