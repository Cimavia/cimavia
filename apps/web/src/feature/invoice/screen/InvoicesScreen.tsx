import {
  type InvoiceDto,
  InvoiceState,
  InvoiceStatus,
  resolveInvoiceState,
  todayIsoDate,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { InvoiceDetailPanel } from "@/feature/invoice/component/InvoiceDetailPanel";
import { InvoiceStatusBadge } from "@/feature/invoice/component/InvoiceStatusBadge";
import {
  useCancelInvoice,
  useInvoices,
  useUpdateInvoiceStatus,
} from "@/feature/invoice/hook/useInvoices";
import { CmvAppShell, CmvCard, CmvEmptyState, CmvErrorState } from "@/shared/component";
import { useActingCapability } from "@/shared/hook/useCapabilities";
import { cn } from "@/shared/util/cn.util";
import { formatDate } from "@/shared/util/date.util";
import { formatMoney, formatPeriod } from "@/shared/util/money.util";

/**
 * Suivi des factures ÉMISES (p6-2). L'émission n'est PAS ici : elle se fait à la diffusion d'un
 * cycle (la facturation se saisit dans le builder). Cet écran ne fait que suivre le statut.
 *
 * Les gestes vivent désormais dans `InvoiceDetailPanel` (#120), plus sur la carte : ils y étaient
 * empilés à droite de chaque ligne, et le tableau qui remplace ces cartes ne peut pas les porter.
 * L'écran garde les MUTATIONS — c'est lui qui possède le cache — et ne passe au panneau que la
 * facture ouverte et de quoi agir dessus.
 *
 * La MÊME ressource sert les deux rôles (#27) : `GET /invoices` est scopée par le tenant, le coach
 * y lit ce qu'il a émis et l'athlète ce qu'il doit. Ce qui diffère, c'est ce qu'on peut en faire —
 * d'où `canManage` plutôt qu'un second écran qui recopierait la lecture pour n'en changer que les
 * boutons.
 *
 * `useCapabilities` est lu ici pour la PRÉSENTATION, jamais pour garder : qui entre est décidé par
 * la route (`CmvRoleGate`), qui ne monte pas cet écran sans l'une des deux capacités.
 */
export function InvoicesScreen() {
  const { t } = useTranslation();
  // Le titre EXERCÉ, pas la capacité possédée : un compte qui cumule lit à un titre à la fois.
  const isCoach = useActingCapability() === "coach";
  const { data: invoices, isPending, isError, refetch } = useInvoices();
  const updateStatus = useUpdateInvoiceStatus();
  const cancel = useCancelInvoice();

  /**
   * L'ID de la facture ouverte, et non l'objet : marquée payée, elle est REMPLACÉE dans le cache
   * par la version renvoyée par l'API. Garder une copie figerait le panneau sur l'état d'avant, et
   * il proposerait encore « Marquer payée » sur une facture qui vient de l'être.
   */
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const openInvoice = invoices?.find((invoice) => invoice.id === openInvoiceId) ?? null;

  // Erreur, vide et chargement sont trois états distincts : « Aucune facture » sur une panne
  // réseau serait un mensonge.
  const hasInvoices = invoices != null && invoices.length > 0;

  return (
    <CmvAppShell
      title={isCoach ? t("invoice.title") : t("invoice.athlete.title")}
      subtitle={isCoach ? t("invoice.subtitle") : t("invoice.athlete.subtitle")}
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

      {/* Le vide ne dit pas la même chose des deux côtés : au coach qu'il n'a rien émis (et où le
          faire), à l'athlète qu'on ne lui demande rien. Clés littérales et non assemblées — c'est
          ce qui les rend visibles de TypeScript et de `check:i18n`. */}
      {!isPending && !isError && !hasInvoices ? (
        <CmvEmptyState
          title={isCoach ? t("invoice.empty.title") : t("invoice.athlete.empty.title")}
          description={
            isCoach ? t("invoice.empty.description") : t("invoice.athlete.empty.description")
          }
        />
      ) : null}

      <InvoiceDetailPanel
        invoice={openInvoice}
        canManage={isCoach}
        busy={updateStatus.isPending || cancel.isPending}
        onClose={() => setOpenInvoiceId(null)}
        onMarkPaid={() =>
          openInvoice == null
            ? undefined
            : updateStatus.mutate({ id: openInvoice.id, status: InvoiceStatus.PAID })
        }
        onReopen={() =>
          openInvoice == null
            ? undefined
            : updateStatus.mutate({ id: openInvoice.id, status: InvoiceStatus.PENDING })
        }
        onCancel={() => (openInvoice == null ? undefined : cancel.mutate(openInvoice.id))}
      />

      {hasInvoices ? (
        <div className="flex flex-col gap-cmv-sm">
          {invoices.map((invoice) => (
            <InvoiceRow
              key={invoice.id}
              invoice={invoice}
              canManage={isCoach}
              onOpen={() => setOpenInvoiceId(invoice.id)}
            />
          ))}
        </div>
      ) : null}
    </CmvAppShell>
  );
}

type InvoiceRowProps = {
  invoice: InvoiceDto;
  /**
   * De qui la carte porte le nom. Ce qu'on peut FAIRE de la facture est passé au panneau, plus à
   * la carte : elle n'a plus qu'à savoir quel nom écrire.
   */
  canManage: boolean;
  onOpen: () => void;
};

function InvoiceRow({ invoice, canManage, onOpen }: Readonly<InvoiceRowProps>) {
  const { t } = useTranslation();
  const isPaid = invoice.status === InvoiceStatus.PAID;
  // Annulée = terminal (l'API refuse tout retour en 409) : le montant est barré, plus personne ne
  // doit rien. Le panneau, lui, ne propose alors aucune action.
  const isCancelled = invoice.status === InvoiceStatus.CANCELLED;
  // L'échéance dépassée se colore aussi (maquette pd-8) : c'est elle que le coach cherche des yeux.
  const isOverdue = resolveInvoiceState(invoice, todayIsoDate()) === InvoiceState.OVERDUE;

  return (
    <CmvCard onClick={onOpen}>
      <div className="flex items-start gap-cmv-md">
        <div className="flex flex-1 flex-col gap-cmv-xs">
          {/* La facture porte les deux noms : chacun lit celui de l'AUTRE partie. Le coach suit
              N athlètes, l'athlète n'a qu'un coach — d'où le préfixe « De » de son côté, qui dit
              d'où vient la facture plutôt que de répéter son propre nom sur chaque carte. */}
          <div className="flex items-center gap-cmv-sm">
            <h3 className="text-cmv-subtitle text-cmv-text-hi">
              {canManage ? invoice.athleteName : t("invoice.byCoach", { name: invoice.coachName })}
            </h3>
            <InvoiceStatusBadge invoice={invoice} />
          </div>

          <p
            className={cn(
              "font-cmv-display text-cmv-title",
              isCancelled ? "text-cmv-text-lo line-through" : "text-cmv-text-hi",
            )}
          >
            {formatMoney(invoice.amountCents, invoice.currency)}
          </p>

          <p className="text-cmv-caption text-cmv-text-mid">
            {/* Le cycle facturé — cœur du lien facture ↔ planification. */}
            {invoice.planTitle ?? "—"} ·{" "}
            {t("invoice.periodLabel", { period: formatPeriod(invoice.period) })}
          </p>

          <p
            className={cn("text-cmv-caption", isOverdue ? "text-cmv-error-on" : "text-cmv-text-lo")}
          >
            {t("invoice.dueLabel", { date: formatDate(invoice.dueDate) })}
            {/* paidAt null tant qu'impayée : rendu « — » (jamais un fallback silencieux). */}
            {isPaid && invoice.paidAt != null
              ? ` · ${t("invoice.paidAtLabel", { date: formatDate(invoice.paidAt.slice(0, 10)) })}`
              : ""}
          </p>

          {invoice.note == null ? null : <p className="text-cmv-text-mid">{invoice.note}</p>}
        </div>
      </div>
    </CmvCard>
  );
}
