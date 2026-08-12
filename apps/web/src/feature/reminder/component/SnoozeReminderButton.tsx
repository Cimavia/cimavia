import { REMINDER_SNOOZE_OPTIONS, snoozedDueAt } from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateReminder } from "@/feature/reminder/hook/useReminders";
import { CmvButton } from "@/shared/component";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values reminder.snooze: REMINDER_SNOOZE_OPTIONS

type SnoozeReminderButtonProps = {
  reminderId: string;
};

/**
 * « Repousser » (#105) — le geste le plus fréquent après « marquer fait », d'où sa place partout où
 * un rappel dû s'affiche : la liste « Mes rappels » ET le centre de notifications.
 *
 * UN seul composant pour les deux endroits, délibérément. Le recopier dans la cloche aurait donné
 * deux versions à garder en phase, dont une seule serait corrigée le jour où les raccourcis
 * changent — et c'est la règle « une ressource = un écran » (#20) appliquée à un fragment d'UI.
 *
 * Les raccourcis se déplient au clic plutôt que de s'étaler : trois boutons par ligne de rappel
 * feraient d'un outil de suivi une barre d'actions, et « repousser » n'est pas le geste par défaut.
 *
 * La nouvelle échéance est calculée ICI, côté client (`snoozedDueAt`), et envoyée en instant
 * absolu : l'API n'a aucun fuseau, seul le navigateur sait ce que « demain » veut dire pour son
 * lecteur.
 */
export function SnoozeReminderButton({ reminderId }: Readonly<SnoozeReminderButtonProps>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const update = useUpdateReminder();

  if (!open) {
    return (
      <CmvButton variant="ghost" onClick={() => setOpen(true)} disabled={update.isPending}>
        {t("reminder.snooze.label")}
      </CmvButton>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-cmv-xs">
      {REMINDER_SNOOZE_OPTIONS.map((option) => (
        <CmvButton
          key={option}
          variant="secondary"
          disabled={update.isPending}
          onClick={() => {
            update.mutate({ id: reminderId, input: { dueAt: snoozedDueAt(option, new Date()) } });
            setOpen(false);
          }}
        >
          {t(`reminder.snooze.${option}`)}
        </CmvButton>
      ))}
      {/* Se raviser doit être possible : le dépliage est un pas de plus, pas un engagement. */}
      <CmvButton variant="ghost" onClick={() => setOpen(false)}>
        {t("common.cancel")}
      </CmvButton>
    </div>
  );
}
