import { isReminderDue, type ReminderDto, ReminderEntityType, ReminderStatus } from "@cmv/shared";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { REMINDER_BADGE, REMINDER_TARGET_LABEL_KEY } from "@/feature/reminder/constant";
import { CmvBadge, CmvButton, CmvCard } from "@/shared/component";
import { formatDateTime } from "@/shared/util/date.util";
import { formatPeriod } from "@/shared/util/money.util";

type ReminderCardProps = {
  reminder: ReminderDto;
  busy: boolean;
  onMarkDone: () => void;
  onDismiss: () => void;
  onReopen: () => void;
};

/**
 * Une ligne de « Mes rappels ». La note est le titre : c'est le contenu du rappel, la cible n'est
 * qu'un contexte.
 */
export function ReminderCard({
  reminder,
  busy,
  onMarkDone,
  onDismiss,
  onReopen,
}: Readonly<ReminderCardProps>) {
  const { t } = useTranslation();
  const isPending = reminder.status === ReminderStatus.PENDING;

  return (
    <CmvCard>
      <div className="flex items-start gap-cmv-md">
        <div className="flex flex-1 flex-col gap-cmv-xs">
          <div className="flex items-center gap-cmv-sm">
            <h3 className="text-cmv-subtitle text-cmv-text-hi">{reminder.note}</h3>
            <ReminderStateBadge reminder={reminder} />
          </div>

          {/* `dueAt` est un INSTANT : affiché dans le fuseau du lecteur (formatDateTime), jamais
              via formatDate qui lit en UTC les dates civiles. */}
          <p className="text-cmv-caption text-cmv-text-mid">
            {t("reminder.dueLabel", { date: formatDateTime(reminder.dueAt) })}
          </p>

          <ReminderTarget reminder={reminder} />
        </div>

        <div className="flex flex-col items-end gap-cmv-sm">
          {isPending ? (
            <>
              <CmvButton variant="secondary" onClick={onMarkDone} disabled={busy}>
                {t("reminder.markDone")}
              </CmvButton>
              <CmvButton variant="ghost" onClick={onDismiss} disabled={busy}>
                {t("reminder.dismiss")}
              </CmvButton>
            </>
          ) : (
            // Réversible : un rappel marqué par erreur se rouvre, il n'y a pas à en recréer un.
            <CmvButton variant="ghost" onClick={onReopen} disabled={busy}>
              {t("reminder.reopen")}
            </CmvButton>
          )}
        </div>
      </div>
    </CmvCard>
  );
}

// « En retard » n'est pas un statut stocké : c'est un rappel à traiter dont l'échéance est passée.
// La dérivation vient de @cmv/shared, la même que celle appliquée en SQL par le centre (#51).
function ReminderStateBadge({ reminder }: Readonly<{ reminder: ReminderDto }>) {
  const { t } = useTranslation();
  const state = isReminderDue(reminder, new Date()) ? "OVERDUE" : reminder.status;
  const { variant, labelKey } = REMINDER_BADGE[state];

  return (
    <CmvBadge variant={variant} dot>
      {t(labelKey)}
    </CmvBadge>
  );
}

/**
 * La cible, composée ICI : le DTO ne porte que le libellé brut (titre du cycle, période « YYYY-MM »).
 * Un cycle est cliquable — c'est là que le coach va agir ; une facture renvoie au suivi.
 *
 * `targetLabel` à `null` = la cible a disparu (pas de clé étrangère sur `entityId`, dette N-4). On
 * rend « — » sans lien plutôt qu'un lien mort.
 */
function ReminderTarget({ reminder }: Readonly<{ reminder: ReminderDto }>) {
  const { t } = useTranslation();
  const kind = t(REMINDER_TARGET_LABEL_KEY[reminder.entityType]);

  if (reminder.targetLabel == null) {
    return (
      <p className="text-cmv-caption text-cmv-text-lo">
        {t("reminder.targetLine", { kind, label: "—" })}
      </p>
    );
  }

  const label =
    reminder.entityType === ReminderEntityType.INVOICE
      ? formatPeriod(reminder.targetLabel)
      : reminder.targetLabel;
  const line = t("reminder.targetLine", { kind, label });

  if (reminder.entityType === ReminderEntityType.PLAN) {
    return (
      <Link
        to="/plans/$planId"
        params={{ planId: reminder.entityId }}
        className="text-cmv-caption text-cmv-accent-on hover:underline"
      >
        {line}
      </Link>
    );
  }

  return (
    <Link to="/invoices" className="text-cmv-caption text-cmv-accent-on hover:underline">
      {line}
    </Link>
  );
}
