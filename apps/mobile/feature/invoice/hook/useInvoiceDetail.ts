import { type InvoiceDto, InvoiceStatus } from "@cmv/shared";
import { useState } from "react";
import { useCancelInvoice, useUpdateInvoiceStatus } from "@/feature/invoice/hook/useInvoices";

/**
 * Le détail d'une facture, câblé : laquelle est ouverte, et ce qu'on peut lui faire.
 *
 * Un hook plutôt que quelques lignes dans l'écran, parce que c'est UNE seule affaire — la facture
 * ouverte et ses mutations ne se comprennent pas l'une sans l'autre — et parce que les deux vues
 * (celle du coach, celle de l'athlète) ouvrent le MÊME détail : le câblage n'appartient à aucune
 * des deux. Même découpe qu'`useInvoicePanel` côté web.
 *
 * Retient un ID, et non la facture : marquée payée, elle est REMPLACÉE dans le cache par la version
 * renvoyée par l'API. Garder une copie figerait l'écran sur l'état d'avant, et il proposerait
 * encore « Marquer payée » sur une facture qui vient de l'être.
 */

export type InvoiceDetailProps = {
  invoice: InvoiceDto;
  busy: boolean;
  onClose: () => void;
  onMarkPaid: () => void;
  onReopen: () => void;
  onCancel: () => void;
};

export type InvoiceDetail = {
  /** Ce qu'il faut passer au détail, ou `null` quand aucune facture n'est ouverte. */
  props: InvoiceDetailProps | null;
  open: (invoiceId: string) => void;
};

export function useInvoiceDetail(invoices: readonly InvoiceDto[] | undefined): InvoiceDetail {
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const updateStatus = useUpdateInvoiceStatus();
  const cancel = useCancelInvoice();

  /**
   * Relue dans la liste à chaque rendu. Une facture qui en disparaît (liste rafraîchie, athlète
   * détaché) referme donc le détail d'elle-même, plutôt que d'y laisser un fantôme sur lequel agir.
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
