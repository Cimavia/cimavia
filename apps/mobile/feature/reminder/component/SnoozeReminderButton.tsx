import { REMINDER_SNOOZE_OPTIONS, snoozedDueAt } from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { useUpdateReminder } from "@/feature/reminder/hook/useReminders";
import { CmvText } from "@/shared/component";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values reminder.snooze: REMINDER_SNOOZE_OPTIONS

/**
 * « Repousser » (#105) — pendant mobile du composant web : mêmes raccourcis, mêmes tokens,
 * implémentation distincte (architecture-choice §5, seuls les tokens sont partagés).
 *
 * Le calcul de la nouvelle échéance, lui, n'est PAS réécrit : `snoozedDueAt` vit dans `@cmv/shared`
 * et est testée là-bas. C'est ce qui garantit que « demain » veut dire la même chose des deux
 * côtés — y compris au passage à l'heure d'hiver.
 *
 * `CmvButton` n'est pas utilisé ici : il est pleine largeur, dessiné pour un envoi de formulaire.
 * Trois boutons pleine largeur empilés sur chaque rappel transformeraient la liste en formulaire.
 */
export function SnoozeReminderButton({ reminderId }: Readonly<{ reminderId: string }>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const update = useUpdateReminder();

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        disabled={update.isPending}
        className="rounded-lg border border-cmv-border px-3 py-2"
      >
        <CmvText className="text-cmv-text-mid text-sm">{t("reminder.snooze.label")}</CmvText>
      </Pressable>
    );
  }

  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {REMINDER_SNOOZE_OPTIONS.map((option) => (
        <Pressable
          key={option}
          disabled={update.isPending}
          onPress={() => {
            update.mutate({ id: reminderId, input: { dueAt: snoozedDueAt(option, new Date()) } });
            setOpen(false);
          }}
          className="rounded-lg border border-cmv-accent-line bg-cmv-accent-soft px-3 py-2"
        >
          <CmvText className="text-cmv-accent-on text-sm">{t(`reminder.snooze.${option}`)}</CmvText>
        </Pressable>
      ))}
      {/* Se raviser doit rester possible : déplier n'est pas s'engager. */}
      <Pressable onPress={() => setOpen(false)} className="px-2 py-2">
        <CmvText className="text-cmv-text-lo text-sm">{t("common.cancel")}</CmvText>
      </Pressable>
    </View>
  );
}
