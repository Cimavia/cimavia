import { type InvoiceDto, InvoiceStatus, ReminderEntityType } from "@cmv/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { InvoiceStatusBadge } from "@/feature/invoice/component/InvoiceStatusBadge";
import { ScheduleReminderButton } from "@/feature/reminder";
import { CmvButton, CmvConfirmButton, CmvPanel } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";
import { formatDate } from "@/shared/util/date.util";
import { formatMoney, formatPeriod } from "@/shared/util/money.util";

/**
 * Le détail d'une facture, et les gestes qu'on peut poser dessus (#120, maquette frames 2, 3, 4
 * et 6).
 *
 * Il existe parce que le tableau ne peut pas tout porter : la note du coach, le cycle facturé et
 * le justificatif ne tiennent pas dans une ligne, et les quatre actions encore moins. La reprise
 * de design déplace donc ici ce que la carte affichait en vrac — c'est le MÊME contenu, rangé.
 *
 * Servi aux deux titres, comme l'écran (« une ressource = un écran », tranché en #20) : l'athlète
 * y lit sa facture et son PDF, le coach y agit. `canManage` gouverne le pied de panneau, et lui
 * seul — la lecture est identique des deux côtés.
 */

type InvoiceDetailPanelProps = {
  /** `null` = aucun panneau ouvert. La facture vient de la LISTE, pas d'une copie : marquée payée,
   * elle se re-rend ici même, et le pied propose alors le geste inverse. */
  invoice: InvoiceDto | null;
  /**
   * Le coach pilote, l'athlète consulte. Un booléen plutôt que le rôle : le panneau n'a pas à
   * savoir QUI regarde, seulement ce qui lui est permis.
   */
  canManage: boolean;
  busy: boolean;
  onClose: () => void;
  onMarkPaid: () => void;
  onReopen: () => void;
  onCancel: () => void;
};

export function InvoiceDetailPanel({
  invoice,
  canManage,
  busy,
  onClose,
  onMarkPaid,
  onReopen,
  onCancel,
}: Readonly<InvoiceDetailPanelProps>) {
  const { t } = useTranslation();
  if (invoice == null) return null;

  const isPaid = invoice.status === InvoiceStatus.PAID;
  // Annulée = terminal (l'API refuse tout retour en 409) : aucune action, et le montant barré —
  // plus personne ne doit rien.
  const isCancelled = invoice.status === InvoiceStatus.CANCELLED;

  /**
   * Le titre nomme l'AUTRE partie : le coach suit N athlètes, l'athlète n'a qu'un coach — d'où le
   * préfixe « De », qui dit d'où vient la facture plutôt que de répéter son propre nom.
   */
  const counterpart = canManage
    ? invoice.athleteName
    : t("invoice.byCoach", { name: invoice.coachName });

  return (
    <CmvPanel
      open
      title={`${counterpart} · ${formatPeriod(invoice.period)}`}
      onClose={onClose}
      footer={
        <InvoiceActions
          invoice={invoice}
          canManage={canManage}
          busy={busy}
          onMarkPaid={onMarkPaid}
          onReopen={onReopen}
          onCancel={onCancel}
        />
      }
    >
      <div className="flex flex-col gap-cmv-lg">
        <div className="flex flex-col gap-cmv-sm">
          <InvoiceStatusBadge invoice={invoice} />
          <p
            className={cn(
              "font-cmv-display text-cmv-title",
              isCancelled ? "text-cmv-text-lo line-through" : "text-cmv-text-hi",
            )}
          >
            {formatMoney(invoice.amountCents, invoice.currency)}
          </p>
        </div>

        <Field label={t("invoice.panel.dueDate")}>{formatDate(invoice.dueDate)}</Field>

        {/* `paidAt` reste null tant qu'impayée : la ligne DISPARAÎT, au lieu d'un « — » qui
            annoncerait un règlement introuvable. Un instant tronqué en date civile — le panneau
            parle d'un jour, comme partout ailleurs. */}
        {isPaid && invoice.paidAt != null ? (
          <Field label={t("invoice.panel.paidAt")}>{formatDate(invoice.paidAt.slice(0, 10))}</Field>
        ) : null}

        {/* Le cycle facturé — cœur du lien facture ↔ planification (tranché en P6). Nullable au
            DTO pour rester ouvert à une facture hors-cycle ; en MVP toujours renseigné. */}
        {invoice.planTitle == null ? null : (
          <Field label={t("invoice.panel.plan")}>{invoice.planTitle}</Field>
        )}

        {invoice.note == null ? null : (
          <Field label={t("invoice.panel.note")}>{invoice.note}</Field>
        )}

        {/* URL GET signée, régénérée à chaque lecture, ouverte dans un onglet. Le nom d'origine
            accompagne le bouton : c'est lui que le coach reconnaît. */}
        {invoice.documentUrl == null ? null : (
          <Field label={t("invoice.panel.document")}>
            <span className="flex flex-wrap items-center gap-cmv-sm">
              <CmvButton
                variant="secondary"
                onClick={() => window.open(invoice.documentUrl ?? "", "_blank", "noopener")}
              >
                {t("invoice.viewDocument")}
              </CmvButton>
              {invoice.documentFileName == null ? null : (
                <span className="text-cmv-caption text-cmv-text-lo">
                  {invoice.documentFileName}
                </span>
              )}
            </span>
          </Field>
        )}
      </div>
    </CmvPanel>
  );
}

/** Intitulé en petites capitales au-dessus de sa valeur (maquette) : un panneau se PARCOURT. */
function Field({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-cmv-xs">
      <span className="text-cmv-caption uppercase tracking-wide text-cmv-text-lo">{label}</span>
      <span className="text-cmv-text-mid">{children}</span>
    </div>
  );
}

type InvoiceActionsProps = {
  invoice: InvoiceDto;
  canManage: boolean;
  busy: boolean;
  onMarkPaid: () => void;
  onReopen: () => void;
  onCancel: () => void;
};

/**
 * Le pied de panneau. Rien pour l'athlète, rien non plus sur une facture annulée : un pied vide
 * vaut mieux qu'un bouton éteint, qui laisse chercher ce qui le rallumerait.
 *
 * Les gestes sont réservés au coach, et pas seulement par politesse : `PATCH /invoices/:id/status`
 * et `POST /invoices/:id/cancel` sont gardées `@Roles([COACH])`, et `ScheduleReminderButton`
 * touche `Reminder` — la seule entité scopée `coachId` SEUL. Un athlète qui l'atteindrait prendrait
 * une erreur, pas un 403.
 */
function InvoiceActions({
  invoice,
  canManage,
  busy,
  onMarkPaid,
  onReopen,
  onCancel,
}: Readonly<InvoiceActionsProps>) {
  const { t } = useTranslation();
  if (!canManage || invoice.status === InvoiceStatus.CANCELLED) return null;

  // Payée : un seul geste, le retour arrière. Poser un paiement à tort se corrige, mais pas à la
  // légère — d'où la confirmation en deux temps.
  if (invoice.status === InvoiceStatus.PAID) {
    return (
      <CmvConfirmButton
        label={t("invoice.reopen")}
        confirmLabel={t("invoice.reopenConfirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={onReopen}
        disabled={busy}
      />
    );
  }

  return (
    <>
      <CmvButton variant="secondary" onClick={onMarkPaid} disabled={busy}>
        {t("invoice.markPaid")}
      </CmvButton>
      {/* Rappel contextuel (#45) : offert sur les factures qui restent à régler seulement — se
          rappeler de relancer une facture payée ou annulée n'a aucun sens. La période nomme la
          cible, comme dans la liste des rappels. */}
      <ScheduleReminderButton
        entityType={ReminderEntityType.INVOICE}
        entityId={invoice.id}
        targetLabel={formatPeriod(invoice.period)}
        variant="ghost"
      />
      <CmvConfirmButton
        label={t("invoice.cancel")}
        confirmLabel={t("invoice.cancelConfirm")}
        cancelLabel={t("common.cancel")}
        confirmHint={t("invoice.cancelHint")}
        onConfirm={onCancel}
        disabled={busy}
      />
    </>
  );
}
