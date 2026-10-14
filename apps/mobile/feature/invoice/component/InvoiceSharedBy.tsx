import { type InvoiceDto, isOwner, MyAccessLevel } from "@cmv/shared";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { CmvText } from "@/shared/component";

type InvoiceOwnership = Pick<InvoiceDto, "coachName" | "myAccess">;

/**
 * « Partagé par M · Lecture via F » : la facture d'un cycle partagé nomme son propriétaire, et ce
 * que le Coach en peut (#607). `null` sur la sienne, et pour l'athlète, qui n'a pas de droit : il en
 * est le destinataire.
 */
export function invoiceSharedByText(invoice: InvoiceOwnership, t: TFunction): string | null {
  const access = invoice.myAccess;
  if (access == null || isOwner(access)) return null;
  const level =
    access.level === MyAccessLevel.READ
      ? t("invoice.coach.rightRead")
      : t("invoice.coach.rightWrite");
  const right =
    access.via == null
      ? level
      : t("invoice.coach.rightVia", { right: level, organization: access.via.name });
  return t("invoice.coach.sharedBy", { owner: invoice.coachName, right });
}

/** La ligne, sous une facture qui n'est pas au Coach ; rien sous les siennes. */
export function InvoiceSharedBy({ invoice }: Readonly<{ invoice: InvoiceOwnership }>) {
  const { t } = useTranslation();
  const text = invoiceSharedByText(invoice, t);
  if (text == null) return null;
  return (
    <CmvText className="text-cmv-text-lo text-xs" numberOfLines={1}>
      {text}
    </CmvText>
  );
}
