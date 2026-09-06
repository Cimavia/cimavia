import {
  buildInvoiceAthleteRows,
  countAthletesBySituation,
  type InvoiceAthleteRow,
  type InvoiceDto,
  type InvoiceRowFilter,
  todayIsoDate,
  visibleInvoiceAthleteRows,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * La facturation du coach, groupée par athlète (#224) : les lignes, le filtre de situation, et les
 * décomptes qu'il porte.
 *
 * Toute la dérivation vient de `@cmv/shared` (#120) — situation, montant dû, ordre des lignes et de
 * l'historique. Rien n'est re-dérivé ici : ce hook ne fait que TENIR le filtre et appliquer ce que
 * le paquet partagé décide. Un tri faux ne se voit pas, et c'est là-bas qu'il est mesuré.
 *
 * Le filtre vit dans un `useState` et non dans l'URL, contrairement au web : le mobile atterrit sur
 * un onglet, pas sur une adresse qu'on partage ou qu'on recharge.
 *
 * Pas de recherche par nom, et c'est assumé (#224) : c'est un confort de web, sur un tableau que le
 * coach parcourt des yeux. `visibleInvoiceAthleteRows` l'exige néanmoins, d'où la chaîne vide —
 * « aucune restriction », et non « rien ne correspond ».
 */

export type InvoiceRows = {
  /** Toutes les lignes, NON filtrées. `null` tant que la liste n'a pas répondu. */
  rows: InvoiceAthleteRow<InvoiceDto>[] | null;
  /** Ce que la liste affiche, dans l'ordre où l'afficher. */
  visible: InvoiceAthleteRow<InvoiceDto>[];
  /** Décomptes des segments, comptés sur les lignes NON filtrées : un segment annonce ce qu'il
   * contient, pas ce qui reste après le filtre en cours. */
  counts: Record<InvoiceRowFilter, number>;
  filter: InvoiceRowFilter;
  setFilter: (filter: InvoiceRowFilter) => void;
};

export function useInvoiceRows(invoices: readonly InvoiceDto[] | undefined): InvoiceRows {
  const { i18n } = useTranslation();
  const [filter, setFilter] = useState<InvoiceRowFilter>("ALL");

  const rows = buildInvoiceAthleteRows(invoices, todayIsoDate());

  return {
    rows,
    visible:
      rows == null
        ? []
        : visibleInvoiceAthleteRows(rows, { search: "", filter, locale: i18n.language }),
    counts: countAthletesBySituation(rows ?? []),
    filter,
    setFilter,
  };
}
