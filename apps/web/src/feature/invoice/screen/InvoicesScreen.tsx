import { type InvoiceDto, InvoiceStatus, Role } from "@cmv/shared";
import { Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { InvoiceForm } from "@/feature/invoice/component/InvoiceForm";
import { useInvoices, useUpdateInvoiceStatus } from "@/feature/invoice/hook/useInvoices";
import {
  CmvAppShell,
  CmvBadge,
  CmvButton,
  CmvCard,
  CmvConfirmButton,
  CmvEmptyState,
  CmvErrorState,
} from "@/shared/component";
import { authClient } from "@/shared/lib/auth";
import { formatDate } from "@/shared/util/date.util";
import { formatMoney, formatPeriod } from "@/shared/util/money.util";

/**
 * Facturation côté coach (p6-1/p6-2) : émettre une facture et suivre son statut. Le marquage
 * « payé » est manuel (paiement réel externe en MVP) ; le retour arrière « impayé » est confirmé
 * en deux temps (CmvConfirmButton) — poser un paiement à tort se corrige, mais pas à la légère.
 */
export function InvoicesScreen() {
  const { t } = useTranslation();
  const { data: authSession, isPending: isAuthPending } = authClient.useSession();
  const { data: invoices, isPending, isError, refetch } = useInvoices();
  const updateStatus = useUpdateInvoiceStatus();

  const [formOpen, setFormOpen] = useState(false);

  if (isAuthPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cmv-bg-0 text-cmv-text-mid">
        {t("common.loading")}
      </main>
    );
  }
  if (authSession?.user.role !== Role.COACH) {
    return <Navigate to="/" />;
  }

  // Erreur, vide et chargement sont trois états distincts : « Aucune facture » sur une panne
  // réseau serait un mensonge.
  const hasInvoices = invoices != null && invoices.length > 0;

  return (
    <CmvAppShell
      title={t("invoice.title")}
      subtitle={t("invoice.subtitle")}
      actions={<CmvButton onClick={() => setFormOpen(true)}>{t("invoice.new")}</CmvButton>}
    >
      {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

      {isError ? (
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => refetch()}
        />
      ) : null}

      {!isPending && !isError && !hasInvoices ? (
        <CmvEmptyState
          title={t("invoice.empty.title")}
          description={t("invoice.empty.description")}
        />
      ) : null}

      {hasInvoices ? (
        <div className="flex flex-col gap-cmv-sm">
          {invoices.map((invoice) => (
            <InvoiceRow
              key={invoice.id}
              invoice={invoice}
              busy={updateStatus.isPending}
              onMarkPaid={() => updateStatus.mutate({ id: invoice.id, status: InvoiceStatus.PAID })}
              onReopen={() =>
                updateStatus.mutate({ id: invoice.id, status: InvoiceStatus.PENDING })
              }
            />
          ))}
        </div>
      ) : null}

      <InvoiceForm open={formOpen} onClose={() => setFormOpen(false)} />
    </CmvAppShell>
  );
}

type InvoiceRowProps = {
  invoice: InvoiceDto;
  busy: boolean;
  onMarkPaid: () => void;
  onReopen: () => void;
};

function InvoiceRow({ invoice, busy, onMarkPaid, onReopen }: Readonly<InvoiceRowProps>) {
  const { t } = useTranslation();
  const isPaid = invoice.status === InvoiceStatus.PAID;

  return (
    <CmvCard>
      <div className="flex items-start gap-cmv-md">
        <div className="flex flex-1 flex-col gap-cmv-xs">
          <div className="flex items-center gap-cmv-sm">
            <h3 className="text-cmv-subtitle text-cmv-text-hi">{invoice.athleteName}</h3>
            <CmvBadge variant={isPaid ? "neutral" : "accent"}>
              {isPaid ? t("invoice.status.paid") : t("invoice.status.pending")}
            </CmvBadge>
          </div>

          <p className="font-cmv-display text-cmv-title text-cmv-text-hi">
            {formatMoney(invoice.amountCents, invoice.currency)}
          </p>

          <p className="text-cmv-caption text-cmv-text-mid">
            {t("invoice.periodLabel", { period: formatPeriod(invoice.period) })} ·{" "}
            {t("invoice.dueLabel", { date: formatDate(invoice.dueDate) })}
          </p>

          <p className="text-cmv-caption text-cmv-text-lo">
            {/* paidAt null tant qu'impayée : rendu « — » (jamais un fallback silencieux). */}
            {isPaid && invoice.paidAt != null
              ? t("invoice.paidAtLabel", { date: formatDate(invoice.paidAt.slice(0, 10)) })
              : "—"}
          </p>

          {invoice.note == null ? null : <p className="text-cmv-text-mid">{invoice.note}</p>}
        </div>

        {isPaid ? (
          <CmvConfirmButton
            label={t("invoice.reopen")}
            confirmLabel={t("invoice.reopenConfirm")}
            cancelLabel={t("common.cancel")}
            onConfirm={onReopen}
            disabled={busy}
          />
        ) : (
          <CmvButton variant="secondary" onClick={onMarkPaid} disabled={busy}>
            {t("invoice.markPaid")}
          </CmvButton>
        )}
      </div>
    </CmvCard>
  );
}
