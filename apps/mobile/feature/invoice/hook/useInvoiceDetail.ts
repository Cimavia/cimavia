import type { InvoiceDto } from "@cmv/shared";
import { useState } from "react";

/**
 * QUELLE facture est ouverte — et rien d'autre.
 *
 * Retient un ID, jamais la facture : marquée payée, elle est REMPLACÉE dans le cache par la version
 * renvoyée par l'API. Garder une copie figerait l'écran sur l'état d'avant, et il proposerait
 * encore « Marquer payée » sur une facture qui vient de l'être.
 *
 * Les MUTATIONS n'entrent pas ici, contrairement au `useInvoicePanel` du web : sur mobile le détail
 * est un `Modal` qui possède ses boutons, et les gestes vivent avec eux plutôt qu'à deux fichiers de
 * distance. Ce hook ne décide donc que d'une chose, et le dit par son type de retour.
 */

export type OpenInvoice = {
  /** La facture ouverte, ou `null` quand le détail est fermé. */
  invoice: InvoiceDto | null;
  open: (invoiceId: string) => void;
  close: () => void;
};

export function useInvoiceDetail(invoices: readonly InvoiceDto[] | undefined): OpenInvoice {
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);

  return {
    /**
     * Relue dans la liste à chaque rendu. Une facture qui en disparaît (liste rafraîchie, athlète
     * détaché) referme donc le détail d'elle-même, plutôt que d'y laisser un fantôme sur lequel
     * agir.
     */
    invoice: invoices?.find((entry) => entry.id === openInvoiceId) ?? null,
    open: setOpenInvoiceId,
    close: () => setOpenInvoiceId(null),
  };
}
