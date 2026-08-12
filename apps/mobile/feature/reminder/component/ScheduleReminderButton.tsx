import {
  REMINDER_NOTE_MAX_LENGTH,
  REMINDER_SNOOZE_OPTIONS,
  type ReminderEntityTypeType,
  snoozedDueAt,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, TextInput, View } from "react-native";
import { useCreateReminder } from "@/feature/reminder/hook/useReminders";
import { CmvButton, CmvScreen, CmvText } from "@/shared/component";
import { formatDateTime } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values reminder.snooze: REMINDER_SNOOZE_OPTIONS

type ScheduleReminderButtonProps = {
  entityType: ReminderEntityTypeType;
  entityId: string;
  /** Nom de la cible, pour que le formulaire dise sur QUOI porte le rappel. */
  targetLabel: string;
};

/**
 * « Programmer un rappel » — bouton CONTEXTUEL, posé là où vit la cible, comme sur le web (#45).
 *
 * Conséquence directe sur mobile : il n'existe qu'**un** point d'appel, la facture. Un rappel sur un
 * cycle se pose depuis le builder, qui est web-only (#20) — et `GET /plans` est une surface coach
 * que le mobile n'a délibérément pas. Ce n'est donc pas un périmètre réduit, c'est la même règle
 * (« la cible est celle de l'endroit d'où l'on clique ») appliquée à une plateforme qui a moins
 * d'écrans, exactement comme `routeForNotification`.
 *
 * L'échéance se choisit parmi les MÊMES raccourcis que le report (`snoozedDueAt`), et non dans un
 * sélecteur de date : le mobile n'a pas d'équivalent de `<input type="datetime-local">`, et un
 * sélecteur natif ferait de ce geste léger un formulaire. Choisir une heure précise reste possible
 * depuis le web.
 */
export function ScheduleReminderButton({
  entityType,
  entityId,
  targetLabel,
}: Readonly<ScheduleReminderButtonProps>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState(() => snoozedDueAt("NEXT_WEEK", new Date()));
  const create = useCreateReminder();

  // La note EST le rappel : sans elle, rien à envoyer. Le schéma partagé refuserait de toute façon
  // (400) — on éteint le bouton plutôt que d'aller le voir.
  const canSubmit = note.trim() !== "" && !create.isPending;

  function onOpen() {
    // Réinitialisé à CHAQUE ouverture : garder la note d'un rappel déjà envoyé laisserait croire
    // qu'il en reste un à valider.
    setNote("");
    setDueAt(snoozedDueAt("NEXT_WEEK", new Date()));
    setOpen(true);
  }

  function onSubmit() {
    if (!canSubmit) return;
    create.mutate(
      { entityType, entityId, dueAt, note: note.trim() },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <>
      <Pressable onPress={onOpen} className="rounded-lg border border-cmv-border px-3 py-2">
        <CmvText className="text-cmv-accent text-sm">{t("reminder.schedule")}</CmvText>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <CmvScreen>
          <View className="gap-4 p-4">
            <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
              {t("reminder.form.title")}
            </CmvText>
            <CmvText className="text-cmv-text-mid text-sm">
              {t("reminder.form.description", { target: targetLabel })}
            </CmvText>

            <View className="gap-2">
              <CmvText className="text-cmv-text-mid text-xs uppercase">
                {t("reminder.form.note")}
              </CmvText>
              <TextInput
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={REMINDER_NOTE_MAX_LENGTH}
                placeholder={t("reminder.form.notePlaceholder")}
                className="min-h-24 rounded-lg border border-cmv-border bg-cmv-bg-1 p-3 text-cmv-text-hi"
              />
            </View>

            <View className="gap-2">
              <CmvText className="text-cmv-text-mid text-xs uppercase">
                {t("reminder.form.dueAt")}
              </CmvText>
              <View className="flex-row flex-wrap gap-2">
                {REMINDER_SNOOZE_OPTIONS.map((option) => {
                  const value = snoozedDueAt(option, new Date());
                  const selected = value.slice(0, 10) === dueAt.slice(0, 10);
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setDueAt(value)}
                      className={`rounded-lg border px-3 py-2 ${
                        selected
                          ? "border-cmv-accent-line bg-cmv-accent-soft"
                          : "border-cmv-border bg-cmv-bg-1"
                      }`}
                    >
                      <CmvText
                        className={`text-sm ${selected ? "text-cmv-accent-on" : "text-cmv-text-mid"}`}
                      >
                        {t(`reminder.snooze.${option}`)}
                      </CmvText>
                    </Pressable>
                  );
                })}
              </View>
              <CmvText className="text-cmv-text-lo text-xs">
                {t("reminder.dueLabel", { date: formatDateTime(dueAt) })}
              </CmvText>
            </View>

            <CmvText className="text-cmv-text-lo text-xs">{t("reminder.form.hint")}</CmvText>

            <CmvButton
              label={create.isPending ? t("reminder.form.submitting") : t("reminder.form.submit")}
              onPress={onSubmit}
              disabled={!canSubmit}
            />
            <Pressable onPress={() => setOpen(false)} className="items-center py-2">
              <CmvText className="text-cmv-text-mid text-sm">{t("common.cancel")}</CmvText>
            </Pressable>
          </View>
        </CmvScreen>
      </Modal>
    </>
  );
}
