import { type InvoiceDto, InvoiceStatus } from "@cmv/shared";
import { useState } from "react";
import { useCancelInvoice, useUpdateInvoiceStatus } from "@/feature/invoice/hook/useInvoices";

/**
 * Le panneau de détail, câblé : quelle facture est ouverte, et ce qu'on peut lui faire.
 *
 * Un hook plutôt que six lignes dans l'écran, parce que c'est UNE seule affaire — la facture
 * ouverte et ses mutations ne se comprennent pas l'une sans l'autre — et parce que les deux vues
 * (le tableau du coach, les cartes de l'athlète) ouvrent le MÊME panneau : le câblage n'appartient
 * à aucune des deux.
 *
 * Retient un ID, et non la facture : marquée payée, elle est REMPLACÉE dans le cache par la version
 * renvoyée par l'API. Garder une copie figerait le panneau sur l'état d'avant, et il proposerait
 * encore « Marquer payée » sur une facture qui vient de l'être.
 */

export type InvoicePanelProps = {
  invoice: InvoiceDto;
  busy: boolean;
  onClose: () => void;
  onMarkPaid: () => void;
  onReopen: () => void;
  onCancel: () => void;
};

export type InvoicePanel = {
  /** Ce qu'il faut passer au panneau, ou `null` quand aucune facture n'est ouverte. */
  props: InvoicePanelProps | null;
  open: (invoiceId: string) => void;
};

export function useInvoicePanel(invoices: readonly InvoiceDto[] | undefined): InvoicePanel {
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const updateStatus = useUpdateInvoiceStatus();
  const cancel = useCancelInvoice();

  /**
   * Relu dans la liste à chaque rendu. Une facture qui en disparaît (liste rafraîchie, athlète
   * détaché) referme donc le panneau d'elle-même, plutôt que d'y laisser un fantôme sur lequel
   * agir.
   */
  const invoice = invoices?.find((entry) => entry.id === openInvoiceId) ?? null;

  return {
    open: setOpenInvoiceId,
    props:
      invoice == null
        ? null
        : {
            invoice,
            busy: updateStatus.isPending || cancel.isPending,
            onClose: () => setOpenInvoiceId(null),
            onMarkPaid: () => updateStatus.mutate({ id: invoice.id, status: InvoiceStatus.PAID }),
            onReopen: () => updateStatus.mutate({ id: invoice.id, status: InvoiceStatus.PENDING }),
            onCancel: () => cancel.mutate(invoice.id),
          },
  };
}
