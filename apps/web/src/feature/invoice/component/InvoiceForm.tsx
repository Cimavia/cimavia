import { DEFAULT_INVOICE_CURRENCY, INVOICE_PERIOD_PATTERN } from "@cmv/shared";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAthletes } from "@/feature/athlete/hook/useAthletes";
import { useCreateInvoice } from "@/feature/invoice/hook/useInvoices";
import { CmvButton, CmvPanel, CmvSelect, CmvTextArea, CmvTextField } from "@/shared/component";

type InvoiceFormProps = {
  open: boolean;
  onClose: () => void;
};

// Émission d'une facture (p6-1). Le coach saisit un montant en euros ; on le convertit en centimes
// (entier) au dernier moment — jamais de float stocké. `type="month"` donne directement "YYYY-MM".
export function InvoiceForm({ open, onClose }: Readonly<InvoiceFormProps>) {
  const { t } = useTranslation();
  const { data: athletes } = useAthletes();
  const createInvoice = useCreateInvoice();

  const [athleteId, setAthleteId] = useState("");
  const [period, setPeriod] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");

  function reset() {
    setAthleteId("");
    setPeriod("");
    setAmount("");
    setDueDate("");
    setNote("");
  }

  // Euros saisis → centimes entiers. `Math.round` absorbe l'imprécision du float de saisie
  // (49.90 * 100 = 4989.999…) : la seule multiplication par 100 de tout le flux vit ici.
  function toAmountCents(euros: string): number | null {
    const value = Number(euros);
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.round(value * 100);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const amountCents = toAmountCents(amount);
    if (
      athleteId === "" ||
      !INVOICE_PERIOD_PATTERN.test(period) ||
      amountCents == null ||
      dueDate === ""
    ) {
      return;
    }

    createInvoice.mutate(
      {
        athleteId,
        period,
        amountCents,
        currency: DEFAULT_INVOICE_CURRENCY,
        dueDate,
        note: note.trim() || null,
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
      },
    );
  }

  const canSubmit =
    athleteId !== "" &&
    INVOICE_PERIOD_PATTERN.test(period) &&
    toAmountCents(amount) != null &&
    dueDate !== "";

  return (
    <CmvPanel
      open={open}
      title={t("invoice.form.title")}
      description={t("invoice.form.description")}
      onClose={onClose}
      footer={
        <>
          <CmvButton variant="ghost" onClick={onClose} disabled={createInvoice.isPending}>
            {t("common.cancel")}
          </CmvButton>
          <CmvButton
            type="submit"
            onClick={onSubmit}
            disabled={!canSubmit || createInvoice.isPending}
          >
            {createInvoice.isPending ? t("invoice.form.submitting") : t("invoice.form.submit")}
          </CmvButton>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-cmv-lg">
        <CmvSelect
          label={t("invoice.form.athlete")}
          name="athleteId"
          value={athleteId}
          onChange={(event) => setAthleteId(event.target.value)}
          placeholder={t("invoice.form.athletePlaceholder")}
          options={(athletes ?? []).map((relation) => ({
            value: relation.athleteId,
            label: relation.athleteName,
          }))}
          required
        />

        <CmvTextField
          label={t("invoice.form.period")}
          name="period"
          type="month"
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
          required
        />

        <CmvTextField
          label={t("invoice.form.amount")}
          name="amount"
          type="number"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder={t("invoice.form.amountPlaceholder")}
          min={0}
          required
        />

        <CmvTextField
          label={t("invoice.form.dueDate")}
          name="dueDate"
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          required
        />

        <CmvTextArea
          label={t("invoice.form.note")}
          name="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("invoice.form.notePlaceholder")}
          rows={3}
        />
      </form>
    </CmvPanel>
  );
}
