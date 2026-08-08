import { ReminderEntityType, ReminderStatus } from "@cmv/shared";

/**
 * Pastille d'état d'un rappel : variant + clé i18n.
 *
 * `OVERDUE` n'est PAS un statut stocké — c'est un rappel `PENDING` dont l'échéance est passée
 * (`isReminderDue`, @cmv/shared). Même dispositif que les factures, où « en retard » est dérivé.
 *
 * Cette table reste côté web tant qu'un seul client la rend (règle de promotion : 2+ apps → package).
 * Le jour où l'écran mobile arrive (#46), elle monte dans @cmv/shared à côté d'`INVOICE_STATE_BADGE`.
 */
export const REMINDER_BADGE = {
  OVERDUE: { variant: "error", labelKey: "reminder.state.overdue" },
  [ReminderStatus.PENDING]: { variant: "warning", labelKey: "reminder.state.pending" },
  [ReminderStatus.DONE]: { variant: "success", labelKey: "reminder.state.done" },
  [ReminderStatus.DISMISSED]: { variant: "neutral", labelKey: "reminder.state.dismissed" },
} as const;

// Clé i18n du type de cible, pour composer « Cycle — … » / « Facture — mars 2026 » à l'affichage.
// Le DTO ne porte que le libellé BRUT : un intitulé assemblé côté API serait figé en français.
export const REMINDER_TARGET_LABEL_KEY = {
  [ReminderEntityType.PLAN]: "reminder.target.plan",
  [ReminderEntityType.INVOICE]: "reminder.target.invoice",
} as const;
