import { type InvoiceDto, MyAccessLevel, sharedRight } from "@cmv/shared";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { CmvText } from "@/shared/component";

type InvoiceOwnership = Pick<InvoiceDto, "coachName" | "myAccess">;

/**
 * « Partagé par M · Lecture via F » : la facture d'un cycle partagé nomme son propriétaire, et ce
 * que le Coach en peut (#607). Ce qui s'en dit, et quand, est décidé par `sharedRight`, comme sur
 * le web ; ici, seule la traduction.
 */
export function invoiceSharedByText(invoice: InvoiceOwnership, t: TFunction): string | null {
  const right = sharedRight(invoice.myAccess);
  if (right == null) return null;
  const level =
    right.level === MyAccessLevel.READ
      ? t("invoice.coach.rightRead")
      : t("invoice.coach.rightWrite");
  return t("invoice.coach.sharedBy", {
    owner: invoice.coachName,
    right:
      right.via == null
        ? level
        : t("invoice.coach.rightVia", { right: level, organization: right.via.name }),
  });
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
