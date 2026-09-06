import { type CapabilityName, INVOICE_ROW_FILTERS, type InvoiceRowFilter } from "@cmv/shared";
import { createFileRoute } from "@tanstack/react-router";
import { InvoicesScreen } from "@/feature/invoice";
import { CmvRoleGate } from "@/shared/component";

/**
 * `?as=coach|athlete` — à quel titre on lit cette ressource.
 *
 * Factures émises : les DEUX capacités, une seule route, parce qu'il n'y a qu'une seule ressource
 * — `GET /invoices` est scopée par le tenant, le coach y lit celles qu'il a émises et l'athlète
 * les siennes (#27). Ce que chacun peut en FAIRE diffère, et c'est l'écran qui le tranche.
 *
 * Le titre est dans l'URL, et pas seulement dans l'état de l'écran, pour deux raisons : la nav en
 * fait DEUX entrées distinctes pour un compte à double capacité — sans quoi elles se surligneraient
 * ensemble, visant la même adresse (#129) — et l'API l'exige de ce compte, faute de quoi elle
 * répond 400 plutôt que de choisir à sa place (#10).
 *
 * Clé REQUISE mais possiblement `undefined` (et non `as?:`) : sous `exactOptionalPropertyTypes`,
 * « absente » et « présente à undefined » ne sont pas la même chose, et TanStack construit
 * toujours l'objet.
 */
/**
 * `?q=`, `?situation=` et `?athlete=` — l'état de la barre d'outils et l'athlète déplié vivent
 * dans l'URL, comme ceux du tableau de suivi (#123).
 *
 * Une vue filtrée se recharge, se met en favori et survit à un aller-retour vers un autre écran :
 * un filtre qui ne passe pas F5 n'est pas le même produit. Ce qui n'y est PAS, délibérément : la
 * page de l'historique déplié. Elle appartient à un athlète et meurt avec son dépliage — l'écrire
 * dans l'URL obligerait à la nettoyer à chaque repli, pour un lien que personne ne partage.
 *
 * `situation` absente vaut « Tous ». Une valeur inconnue y est ramenée : un paramètre malformé
 * n'est pas une mesure métier manquante, et refuser de rendre l'écran serait disproportionné.
 */
export type InvoicesSearch = {
  as: CapabilityName | undefined;
  q: string | undefined;
  situation: InvoiceRowFilter | undefined;
  athlete: string | undefined;
};

export function parseAsSearch(value: unknown): CapabilityName | undefined {
  return value === "coach" || value === "athlete" ? value : undefined;
}

// `find` plutôt qu'`includes` : `INVOICE_ROW_FILTERS.includes(x)` exigerait de forcer le type de
// `x` avant de l'avoir vérifié, ce qui vide le contrôle de son sens.
function toSituation(value: unknown): InvoiceRowFilter | undefined {
  return INVOICE_ROW_FILTERS.find((known) => known === value);
}

/**
 * Nommée et exportée plutôt qu'écrite en ligne : c'est la seule chose de ce fichier qui DÉCIDE —
 * ce qu'une URL bricolée à la main devient avant d'atteindre l'écran — et elle s'éprouve alors
 * sans monter de routeur.
 */
export function parseInvoicesSearch(search: Record<string, unknown>): InvoicesSearch {
  return {
    as: parseAsSearch(search.as),
    q: typeof search.q === "string" && search.q.length > 0 ? search.q : undefined,
    situation: toSituation(search.situation),
    athlete:
      typeof search.athlete === "string" && search.athlete.length > 0 ? search.athlete : undefined,
  };
}

export const Route = createFileRoute("/invoices")({
  validateSearch: parseInvoicesSearch,
  component: () => (
    <CmvRoleGate capability={["coach", "athlete"]}>
      <InvoicesScreen />
    </CmvRoleGate>
  ),
});
