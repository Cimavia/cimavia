import { REMINDER_NOTE_MAX_LENGTH, type ReminderEntityTypeType } from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCreateReminder } from "@/feature/reminder/hook/useReminders";
import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/feature/reminder/util/datetime-local.util";
import { CmvButton, CmvPanel, CmvTextArea, CmvTextField } from "@/shared/component";

// Échéance proposée par défaut : dans une semaine, à 9 h. Un rappel se pose presque toujours « plus
// tard », et une valeur pré-remplie évite d'ouvrir un sélecteur de date pour rien — elle reste
// modifiable, c'est un raccourci, pas une décision prise à la place du coach.
const DEFAULT_DAYS_AHEAD = 7;
const DEFAULT_HOUR = 9;

function defaultDueAt(): string {
  const date = new Date();
  date.setDate(date.getDate() + DEFAULT_DAYS_AHEAD);
  date.setHours(DEFAULT_HOUR, 0, 0, 0);
  return toDatetimeLocalValue(date);
}

type ScheduleReminderButtonProps = {
  entityType: ReminderEntityTypeType;
  entityId: string;
  /** Nom de la cible, pour que le panneau dise sur QUOI porte le rappel. */
  targetLabel: string;
  variant?: "secondary" | "ghost";
};

/**
 * « Programmer un rappel » — bouton contextuel, posé sur un cycle et sur une facture (#45).
 *
 * Le bouton ET son panneau vivent dans le même composant : la cible est celle de l'endroit d'où on
 * clique, il n'y a donc rien à choisir dans le formulaire (pas de sélecteur d'entité) et rien à
 * remonter à l'écran appelant. C'est ce qui permet aux deux points d'appel de n'ajouter qu'une ligne.
 */
export function ScheduleReminderButton({
  entityType,
  entityId,
  targetLabel,
  variant = "secondary",
}: Readonly<ScheduleReminderButtonProps>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [dueAtLocal, setDueAtLocal] = useState(defaultDueAt);
  const [note, setNote] = useState("");
  const create = useCreateReminder();

  const dueAt = fromDatetimeLocalValue(dueAtLocal);
  // La note EST le rappel, et l'échéance doit être lisible : sans les deux, rien à envoyer. Le
  // schéma partagé refuserait de toute façon (400) — on éteint le bouton plutôt que d'aller le voir.
  const canSubmit = note.trim() !== "" && dueAt != null && !create.isPending;

  function onOpen() {
    // Réinitialisé à CHAQUE ouverture : un panneau qui garde la note d'un rappel déjà envoyé
    // laisserait croire qu'il en reste un à valider.
    setDueAtLocal(defaultDueAt());
    setNote("");
    setOpen(true);
  }

  function onSubmit() {
    if (dueAt == null) return;
    create.mutate({ entityType, entityId, dueAt, note: note.trim() }, () => setOpen(false));
  }

  return (
    <>
      <CmvButton variant={variant} onClick={onOpen}>
        {t("reminder.schedule")}
      </CmvButton>

      <CmvPanel
        open={open}
        title={t("reminder.form.title")}
        description={t("reminder.form.description", { target: targetLabel })}
        onClose={() => setOpen(false)}
        footer={
          <>
            <CmvButton variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </CmvButton>
            <CmvButton onClick={onSubmit} disabled={!canSubmit}>
              {create.isPending ? t("reminder.form.submitting") : t("reminder.form.submit")}
            </CmvButton>
          </>
        }
      >
        <div className="flex flex-col gap-cmv-lg">
          {/* Aucun astérisque ici, et c'est délibéré : les DEUX champs du panneau sont obligatoires,
              donc le repère ne distinguerait rien — même cas que l'auth (« Tranché en #97 »). */}
          {/* Un instant, pas une date : le rappel se déclenche à une heure, et le champ natif la
              saisit dans le fuseau du coach (converti en UTC à l'envoi). */}
          <CmvTextField
            label={t("reminder.form.dueAt")}
            name="reminder-due-at"
            type="datetime-local"
            value={dueAtLocal}
            onChange={(event) => setDueAtLocal(event.target.value)}
            required
          />

          <CmvTextArea
            label={t("reminder.form.note")}
            name="reminder-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("reminder.form.notePlaceholder")}
            maxLength={REMINDER_NOTE_MAX_LENGTH}
            required
          />

          <p className="text-cmv-caption text-cmv-text-lo">{t("reminder.form.hint")}</p>
        </div>
      </CmvPanel>
    </>
  );
}
