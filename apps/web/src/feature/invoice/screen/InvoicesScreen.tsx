import {
  type InvoiceDto,
  InvoiceState,
  InvoiceStatus,
  ReminderEntityType,
  resolveInvoiceState,
  todayIsoDate,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { InvoiceStatusBadge } from "@/feature/invoice/component/InvoiceStatusBadge";
import {
  useCancelInvoice,
  useInvoices,
  useUpdateInvoiceStatus,
} from "@/feature/invoice/hook/useInvoices";
import { ScheduleReminderButton } from "@/feature/reminder";
import {
  CmvAppShell,
  CmvButton,
  CmvCard,
  CmvConfirmButton,
  CmvEmptyState,
  CmvErrorState,
} from "@/shared/component";
import { useCapabilities } from "@/shared/hook/useCapabilities";
import { cn } from "@/shared/util/cn.util";
import { formatDate } from "@/shared/util/date.util";
import { formatMoney, formatPeriod } from "@/shared/util/money.util";

/**
 * Suivi des factures ÉMISES (p6-2). L'émission n'est PAS ici : elle se fait à la diffusion d'un
 * cycle (la facturation se saisit dans le builder). Cet écran ne fait que suivre le statut. Le
 * marquage « payé » est manuel (paiement réel externe en MVP) ; le retour arrière « impayé » est
 * confirmé en deux temps (CmvConfirmButton) — poser un paiement à tort se corrige, mais pas à la
 * légère.
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
  const { isCoach } = useCapabilities();
  const { data: invoices, isPending, isError, refetch } = useInvoices();
  const updateStatus = useUpdateInvoiceStatus();
  const cancel = useCancelInvoice();

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

      {hasInvoices ? (
        <div className="flex flex-col gap-cmv-sm">
          {invoices.map((invoice) => (
            <InvoiceRow
              key={invoice.id}
              invoice={invoice}
              canManage={isCoach}
              busy={updateStatus.isPending || cancel.isPending}
              onMarkPaid={() => updateStatus.mutate({ id: invoice.id, status: InvoiceStatus.PAID })}
              onReopen={() =>
                updateStatus.mutate({ id: invoice.id, status: InvoiceStatus.PENDING })
              }
              onCancel={() => cancel.mutate(invoice.id)}
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
   * Le coach pilote (marquer payée, rouvrir, annuler, se poser un rappel), l'athlète consulte. Un
   * booléen plutôt que le rôle : la carte n'a pas à savoir QUI regarde, seulement ce qui lui est
   * permis.
   */
  canManage: boolean;
  busy: boolean;
  onMarkPaid: () => void;
  onReopen: () => void;
  onCancel: () => void;
};

function InvoiceRow({
  invoice,
  canManage,
  busy,
  onMarkPaid,
  onReopen,
  onCancel,
}: Readonly<InvoiceRowProps>) {
  const { t } = useTranslation();
  const isPaid = invoice.status === InvoiceStatus.PAID;
  // Annulée = terminal (l'API refuse tout retour en 409) : la carte ne propose plus aucune action,
  // et le montant est barré — plus personne ne doit rien.
  const isCancelled = invoice.status === InvoiceStatus.CANCELLED;
  // L'échéance dépassée se colore aussi (maquette pd-8) : c'est elle que le coach cherche des yeux.
  const isOverdue = resolveInvoiceState(invoice, todayIsoDate()) === InvoiceState.OVERDUE;

  return (
    <CmvCard>
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

        <div className="flex flex-col gap-cmv-sm">
          {/* Tout ce qui suit jusqu'au justificatif est réservé au coach, et pas seulement par
              politesse : `PATCH /invoices/:id/status` et `POST /invoices/:id/cancel` sont gardées
              `@Roles([COACH])`, et surtout `ScheduleReminderButton` touche `Reminder` — la seule
              entité scopée `coachId` SEUL. Un athlète qui l'atteint prend une *erreur*, pas un 403
              (fail closed) : ce test est la seconde des deux gardes qu'exige ce modèle. */}
          {canManage && isPaid ? (
            <div className="flex justify-end">
              <CmvConfirmButton
                label={t("invoice.reopen")}
                confirmLabel={t("invoice.reopenConfirm")}
                cancelLabel={t("common.cancel")}
                onConfirm={onReopen}
                disabled={busy}
              />
            </div>
          ) : null}

          {canManage && !isPaid && !isCancelled ? (
            <>
              <div className="flex justify-end">
                <CmvButton variant="secondary" onClick={onMarkPaid} disabled={busy}>
                  {t("invoice.markPaid")}
                </CmvButton>
              </div>
              {/* Rappel contextuel (#45) : offert sur les factures qui restent à régler seulement —
                  se rappeler de relancer une facture payée ou annulée n'a aucun sens. La période
                  nomme la cible, comme dans la liste des rappels. */}
              <div className="flex justify-end">
                <ScheduleReminderButton
                  entityType={ReminderEntityType.INVOICE}
                  entityId={invoice.id}
                  targetLabel={formatPeriod(invoice.period)}
                  variant="ghost"
                />
              </div>
              {/* Annulation en deux temps : irréversible côté API (409 sur tout retour). */}
              <div className="flex justify-end">
                <CmvConfirmButton
                  label={t("invoice.cancel")}
                  confirmLabel={t("invoice.cancelConfirm")}
                  cancelLabel={t("common.cancel")}
                  onConfirm={onCancel}
                  disabled={busy}
                />
              </div>
            </>
          ) : null}

          {/* Justificatif PDF en pied de carte, aligné à droite. URL GET signée (TTL court), ouverte
          dans un onglet — même geste que le bouton « Voir le PDF » côté athlète mobile. */}
          {invoice.documentUrl == null ? null : (
            <div className="flex justify-end">
              <CmvButton
                variant="secondary"
                onClick={() => window.open(invoice.documentUrl ?? "", "_blank", "noopener")}
              >
                {t("invoice.viewDocument")}
              </CmvButton>
            </div>
          )}
        </div>
      </div>
    </CmvCard>
  );
}
