import { type InvoiceDto, MAX_INVOICE_DOCUMENT_SIZE_BYTES } from "@cmv/shared";
import { Link } from "@tanstack/react-router";
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useAttachInvoiceDocument,
  usePlanBilling,
  useRemoveInvoiceDocument,
  useSavePlanBilling,
} from "@/feature/invoice/hook/useInvoices";
import { CmvButton, CmvCard, CmvTextArea, CmvTextField, useToast } from "@/shared/component";

type PlanBillingSectionProps = {
  planId: string;
  // Une fois le cycle diffusé, la facturation est émise et figée : on n'affiche plus le formulaire.
  isPublished: boolean;
};

/**
 * Section « Facturation » du builder, sous les semaines (p6-1). Édite la facture DRAFT du cycle ;
 * la diffusion l'exige (gating). Le coach saisit un montant en euros, converti en centimes (entier)
 * au dernier moment — jamais de float stocké. La période (mois de début) et l'athlète sont dérivés
 * côté API : rien à saisir ici.
 */
export function PlanBillingSection({ planId, isPublished }: Readonly<PlanBillingSectionProps>) {
  const { t } = useTranslation();
  const { data: billing } = usePlanBilling(planId);
  const save = useSavePlanBilling(planId);

  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");

  // Pré-remplit depuis les termes déjà enregistrés dès qu'ils arrivent (montant affiché en euros).
  useEffect(() => {
    if (billing == null) return;
    setAmount(String(billing.amountCents / 100));
    setDueDate(billing.dueDate);
    setNote(billing.note ?? "");
  }, [billing]);

  // Euros saisis → centimes entiers. `Math.round` absorbe l'imprécision du float de saisie
  // (49.90 * 100 = 4989.999…) : la seule multiplication par 100 du flux vit ici.
  function toAmountCents(euros: string): number | null {
    const value = Number(euros);
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.round(value * 100);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const amountCents = toAmountCents(amount);
    if (amountCents == null || dueDate === "") return;
    save.mutate({ amountCents, dueDate, note: note.trim() || null });
  }

  const canSubmit = toAmountCents(amount) != null && dueDate !== "";

  if (isPublished) {
    return (
      <CmvCard>
        <div className="flex flex-col gap-cmv-xs">
          <h2 className="text-cmv-subtitle text-cmv-text-hi">{t("invoice.billing.title")}</h2>
          <p className="text-cmv-caption text-cmv-text-mid">{t("invoice.billing.issuedHint")}</p>
          <Link to="/invoices" className="text-cmv-caption text-cmv-accent hover:underline">
            {t("invoice.billing.trackLink")}
          </Link>
        </div>
      </CmvCard>
    );
  }

  return (
    <CmvCard>
      <form onSubmit={onSubmit} className="flex flex-col gap-cmv-md">
        <div className="flex flex-col gap-cmv-xs">
          <h2 className="text-cmv-subtitle text-cmv-text-hi">{t("invoice.billing.title")}</h2>
          <p className="text-cmv-caption text-cmv-text-lo">{t("invoice.billing.hint")}</p>
        </div>

        <div className="grid gap-cmv-md md:grid-cols-2">
          <CmvTextField
            label={t("invoice.billing.amount")}
            name="amount"
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={t("invoice.billing.amountPlaceholder")}
            min={0}
            required
            requiredMark
          />
          <CmvTextField
            label={t("invoice.billing.dueDate")}
            name="dueDate"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            required
            requiredMark
          />
        </div>

        <p className="text-cmv-caption text-cmv-text-lo">{t("invoice.billing.requiredLegend")}</p>

        <CmvTextArea
          label={t("invoice.billing.note")}
          name="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("invoice.billing.notePlaceholder")}
          rows={2}
        />

        <div>
          <CmvButton type="submit" variant="secondary" disabled={!canSubmit || save.isPending}>
            {save.isPending ? t("invoice.billing.saving") : t("invoice.billing.save")}
          </CmvButton>
        </div>
      </form>

      {/* Justificatif PDF : disponible une fois les termes enregistrés (l'API le rattache à la
          facture DRAFT). Tant que rien n'est saisi, on invite à enregistrer d'abord. */}
      <div className="mt-cmv-md flex flex-col gap-cmv-xs border-cmv-border border-t pt-cmv-md">
        <h3 className="text-cmv-body text-cmv-text-hi">{t("invoice.billing.document")}</h3>
        {billing == null ? (
          <p className="text-cmv-caption text-cmv-text-lo">
            {t("invoice.billing.documentAfterSave")}
          </p>
        ) : (
          <BillingDocument planId={planId} billing={billing} />
        )}
      </div>
    </CmvCard>
  );
}

function BillingDocument({ planId, billing }: Readonly<{ planId: string; billing: InvoiceDto }>) {
  const { t } = useTranslation();
  const toast = useToast();
  const attach = useAttachInvoiceDocument(planId);
  const remove = useRemoveInvoiceDocument(planId);
  const inputRef = useRef<HTMLInputElement>(null);

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Réinitialise pour pouvoir resélectionner le même fichier après un retrait.
    event.target.value = "";
    if (file == null) return;
    if (file.type !== "application/pdf") {
      toast.error(t("invoice.billing.documentPdfOnly"));
      return;
    }
    if (file.size > MAX_INVOICE_DOCUMENT_SIZE_BYTES) {
      toast.error(t("invoice.billing.documentTooBig"));
      return;
    }
    attach.mutate(file);
  }

  const busy = attach.isPending || remove.isPending;

  return (
    <div className="flex flex-col gap-cmv-sm">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={onPick}
      />

      {billing.documentUrl == null || billing.documentFileName == null ? (
        <div className="flex flex-col gap-cmv-xs">
          <CmvButton variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
            {attach.isPending
              ? t("invoice.billing.documentUploading")
              : t("invoice.billing.documentAdd")}
          </CmvButton>
          <p className="text-cmv-caption text-cmv-text-lo">{t("invoice.billing.documentHint")}</p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-cmv-sm">
          <a
            href={billing.documentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cmv-body text-cmv-accent hover:underline"
          >
            {billing.documentFileName}
          </a>
          <CmvButton variant="ghost" disabled={busy} onClick={() => inputRef.current?.click()}>
            {t("invoice.billing.documentReplace")}
          </CmvButton>
          <CmvButton variant="ghost" disabled={busy} onClick={() => remove.mutate()}>
            {t("invoice.billing.documentRemove")}
          </CmvButton>
        </div>
      )}
    </div>
  );
}
