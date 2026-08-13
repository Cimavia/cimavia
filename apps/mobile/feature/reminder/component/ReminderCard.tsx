import {
  REMINDER_BADGE,
  REMINDER_TARGET_LABEL_KEY,
  type ReminderDto,
  ReminderEntityType,
  ReminderStatus,
  reminderBadgeState,
  reminderLabel,
} from "@cmv/shared";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { SnoozeReminderButton } from "@/feature/reminder/component/SnoozeReminderButton";
import { CmvBadge, CmvText } from "@/shared/component";
import { formatDateTime } from "@/shared/util/date.util";
import { formatPeriod } from "@/shared/util/money.util";

/**
 * Le titre d'un rappel : la note du coach, ou le libellé de son MOTIF s'il a été auto-généré (#47).
 * `null` si ni l'un ni l'autre — l'API garantit que ça n'arrive pas, on n'invente pas de texte pour
 * autant, la carte rend « — ».
 */
function reminderTitle(reminder: ReminderDto, t: (key: string) => string): string | null {
  const label = reminderLabel(reminder);
  if (label == null) return null;
  return label.kind === "key" ? t(label.value) : label.value;
}

type ReminderCardProps = {
  reminder: ReminderDto;
  busy: boolean;
  onMarkDone: () => void;
  onDismiss: () => void;
  onReopen: () => void;
};

/**
 * Une ligne de « Mes rappels ». La note est le TITRE : c'est le contenu entier du rappel, la cible
 * n'est qu'un contexte. Pendant mobile de la carte web — mêmes règles, mêmes tokens, rendu distinct.
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
  const { variant, labelKey } = REMINDER_BADGE[reminderBadgeState(reminder, new Date())];
  const title = reminderTitle(reminder, t);

  return (
    <View className="gap-2 rounded-lg border border-cmv-border bg-cmv-bg-1 p-4">
      <View className="flex-row items-start justify-between gap-2">
        {/* La note du coach, ou le libellé du MOTIF si le rappel a été auto-généré (#47). La
            précédence vit dans @cmv/shared : une note ajoutée à un rappel généré l'emporte sur
            l'intitulé système. Le motif voyage comme clé i18n et se traduit ici. */}
        <CmvText className="flex-1 text-cmv-text-hi">{title ?? "—"}</CmvText>
        <CmvBadge label={t(labelKey)} variant={variant} dot />
      </View>

      {/* `dueAt` est un INSTANT : affiché dans le fuseau du lecteur (formatDateTime), jamais via
          formatDate qui lit les dates civiles en UTC. */}
      <CmvText className="text-cmv-text-mid text-xs">
        {t("reminder.dueLabel", { date: formatDateTime(reminder.dueAt) })}
      </CmvText>

      <ReminderTarget reminder={reminder} />

      <View className="flex-row flex-wrap items-center gap-2 pt-1">
        {isPending ? (
          <>
            <Pressable
              onPress={onMarkDone}
              disabled={busy}
              className="rounded-lg border border-cmv-success-line bg-cmv-success-soft px-3 py-2"
            >
              <CmvText className="text-cmv-success-on text-sm">{t("reminder.markDone")}</CmvText>
            </Pressable>

            <SnoozeReminderButton reminderId={reminder.id} />

            <Pressable onPress={onDismiss} disabled={busy} className="px-2 py-2">
              <CmvText className="text-cmv-text-lo text-sm">{t("reminder.dismiss")}</CmvText>
            </Pressable>
          </>
        ) : (
          // Réversible : un rappel marqué par erreur se rouvre, il n'y a pas à en recréer un.
          <Pressable
            onPress={onReopen}
            disabled={busy}
            className="rounded-lg border border-cmv-border px-3 py-2"
          >
            <CmvText className="text-cmv-text-mid text-sm">{t("reminder.reopen")}</CmvText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/**
 * La cible, composée ICI : le DTO ne porte que le libellé brut (titre du cycle, période « YYYY-MM »).
 * Un libellé assemblé côté API serait figé en français.
 *
 * Une FACTURE est cliquable — l'écran existe sur mobile. Un CYCLE ne l'est pas : le builder est
 * web-only (#20), il n'y a pas d'écran à viser. On affiche donc le contexte sans lien, plutôt qu'un
 * lien mort — même règle que `routeForNotification`, qui rend `null` sur `PLAN` côté coach.
 *
 * `targetLabel` à `null` = la cible a disparu (pas de clé étrangère sur `entityId`, dette N-4) :
 * « — », jamais un repli silencieux.
 */
function ReminderTarget({ reminder }: Readonly<{ reminder: ReminderDto }>) {
  const { t } = useTranslation();
  const kind = t(REMINDER_TARGET_LABEL_KEY[reminder.entityType]);

  if (reminder.targetLabel == null) {
    return (
      <CmvText className="text-cmv-text-lo text-xs">
        {t("reminder.targetLine", { kind, label: "—" })}
      </CmvText>
    );
  }

  const isInvoice = reminder.entityType === ReminderEntityType.INVOICE;
  const label = isInvoice ? formatPeriod(reminder.targetLabel) : reminder.targetLabel;
  const line = t("reminder.targetLine", { kind, label });

  if (!isInvoice) {
    return <CmvText className="text-cmv-text-lo text-xs">{line}</CmvText>;
  }

  return (
    <Pressable onPress={() => router.push("/invoices")}>
      <CmvText className="text-cmv-accent text-xs">{line}</CmvText>
    </Pressable>
  );
}
