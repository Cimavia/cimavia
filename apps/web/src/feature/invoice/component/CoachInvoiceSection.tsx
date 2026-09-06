import {
  countAthletesBySituation,
  type InvoiceAthleteRow,
  type InvoiceDto,
  type InvoiceRowFilter,
  visibleInvoiceAthleteRows,
} from "@cmv/shared";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { InvoiceAthleteTable } from "@/feature/invoice/component/InvoiceAthleteTable";
import { InvoiceToolbar } from "@/feature/invoice/component/InvoiceToolbar";
import type { InvoicesSearch } from "@/routes/invoices";
import { CmvEmptyState } from "@/shared/component";

const route = getRouteApi("/invoices");

/**
 * Le tableau de facturation du coach et sa barre d'outils (#120).
 *
 * La section possède l'état de sa vue — lu dans l'URL, pas dans un `useState` — plutôt que de le
 * recevoir en props : les quatre décisions qui en dépendent (que filtrer, quoi rendre, quel vide,
 * quel athlète est déplié) tiennent alors dans un seul endroit, et l'écran n'a pas à connaître un
 * réglage d'affichage qui ne le regarde pas. Même découpe que `AthleteTrackingSection` (#123).
 */

type CoachInvoiceSectionProps = {
  /** Toutes les lignes, NON filtrées : les décomptes des segments se comptent dessus. */
  rows: readonly InvoiceAthleteRow<InvoiceDto>[];
  onOpenInvoice: (invoiceId: string) => void;
};

export function CoachInvoiceSection({ rows, onOpenInvoice }: Readonly<CoachInvoiceSectionProps>) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { as, q, situation, athlete } = route.useSearch();

  const filter: InvoiceRowFilter = situation ?? "ALL";
  const visible = visibleInvoiceAthleteRows(rows, {
    search: q ?? "",
    filter,
    locale: i18n.language,
  });
  const counts = countAthletesBySituation(rows);

  /**
   * `replace` partout : la barre est un RÉGLAGE DE VUE, pas une étape de navigation. Sans lui,
   * chaque frappe au clavier empilerait une entrée d'historique, et le bouton Retour rembobinerait
   * la saisie au lieu de quitter la facturation.
   *
   * `as` est RECOPIÉ dans chaque navigation : il dit à quel titre on lit la ressource, et l'API
   * l'exige d'un compte à double capacité. L'omettre ferait basculer l'écran d'un rôle à l'autre à
   * la première frappe.
   */
  const go = (next: Partial<Pick<InvoicesSearch, "q" | "situation" | "athlete">>) =>
    navigate({ to: "/invoices", search: { as, q, situation, athlete, ...next }, replace: true });

  return (
    <div className="flex flex-col gap-cmv-lg">
      <InvoiceToolbar
        search={q ?? ""}
        filter={filter}
        counts={counts}
        onSearchChange={(next) => go({ q: next || undefined })}
        // « Tous » ne s'écrit pas dans l'URL : c'est la valeur par défaut, l'y laisser serait du bruit.
        onFilterChange={(next) => go({ situation: next === "ALL" ? undefined : next })}
      />

      {visible.length === 0 ? (
        /* Aucun athlète ne correspond — ce n'est PAS « aucune facture émise ». Les confondre
           enverrait le coach chercher un cycle à diffuser alors qu'il lui suffit de vider sa
           recherche. */
        <CmvEmptyState
          title={t("invoice.noMatch.title")}
          description={t("invoice.noMatch.description")}
        />
      ) : (
        <InvoiceAthleteTable
          rows={visible}
          expandedAthleteId={athlete ?? null}
          // Recliquer sur l'athlète déplié le referme : un seul historique ouvert à la fois.
          onToggle={(athleteId) => go({ athlete: athleteId === athlete ? undefined : athleteId })}
          onOpenInvoice={onOpenInvoice}
        />
      )}
    </div>
  );
}
