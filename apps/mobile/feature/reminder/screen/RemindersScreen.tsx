import { type ReminderDto, ReminderStatus } from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { ReminderCard } from "@/feature/reminder/component/ReminderCard";
import { useReminders, useUpdateReminderStatus } from "@/feature/reminder/hook/useReminders";
import { CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values reminder.segment: SEGMENTS
// i18n-values reminder.empty: SEGMENTS

// Deux vues d'une même liste, servie en UN appel : à traiter (l'ordre de travail, imposé par l'API)
// et traités (l'historique). Un rappel abandonné n'est pas supprimé — il reste une information.
const SEGMENTS = ["PENDING", "HANDLED"] as const;
type Segment = (typeof SEGMENTS)[number];

const isHandled = (reminder: ReminderDto) => reminder.status !== ReminderStatus.PENDING;
const inSegment = (reminder: ReminderDto, segment: Segment) =>
  segment === "PENDING" ? !isHandled(reminder) : isHandled(reminder);

/**
 * « Mes rappels » sur mobile (#46) — outil PRIVÉ du coach.
 *
 * L'écran n'est pas un onglet : il vit sous `app/reminders/`, atteint depuis la tuile du tableau de
 * bord, comme `/feedbacks` (#33). La garde de capacité est dans le `_layout`, JAMAIS ici — les
 * hooks React s'exécutent avant tout `return`, une garde en tête d'écran laisserait donc partir
 * `GET /reminders`, qui répond 403 à un athlète (tranché en #20).
 *
 * La lecture n'est pas réécrite : `createReminderApi` et les clés de cache viennent de
 * `@cmv/shared`, la pastille d'état et le libellé de cible aussi. Seul le rendu est propre au
 * mobile.
 */
export function RemindersScreen() {
  const { t } = useTranslation();
  const { data: reminders, isPending, isError, isRefetching, refetch } = useReminders();
  const updateStatus = useUpdateReminderStatus();
  const [segment, setSegment] = useState<Segment>("PENDING");

  // Refetch au retour au premier plan — notamment à l'arrivée depuis une notification de rappel
  // dû : sans ça, le cache persisté afficherait l'état d'avant l'événement annoncé.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const all = reminders ?? [];
  const shown = all.filter((reminder) => inSegment(reminder, segment));
  const isEmpty = !isPending && !isError && reminders != null && shown.length === 0;

  return (
    <CmvScreen>
      <OfflineBanner />

      <View className="gap-3 px-4 pt-4">
        <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
          {t("reminder.title")}
        </CmvText>

        <View className="flex-row gap-2">
          {SEGMENTS.map((value) => (
            <Pressable
              key={value}
              onPress={() => setSegment(value)}
              className={`rounded-lg border px-3 py-2 ${
                segment === value
                  ? "border-cmv-accent-line bg-cmv-accent-soft"
                  : "border-cmv-border bg-cmv-bg-1"
              }`}
            >
              <CmvText
                className={`text-sm ${segment === value ? "text-cmv-accent-on" : "text-cmv-text-mid"}`}
              >
                {t(`reminder.segment.${value}`, {
                  count: all.filter((reminder) => inSegment(reminder, value)).length,
                })}
              </CmvText>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerClassName="gap-3 px-4 pb-4 pt-4"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            // Le spinner est natif : il ignore les className, d'où la valeur (issue des tokens).
            tintColor={cmvColors.accent.DEFAULT}
          />
        }
      >
        {isPending ? <ActivityIndicator /> : null}

        {/* Erreur, vide et chargement sont trois états distincts : « aucun rappel » sur une panne
            réseau serait un mensonge. */}
        {isError && reminders == null ? <CmvErrorState onRetry={() => refetch()} /> : null}

        {isEmpty ? (
          <View className="gap-2 rounded-lg border border-cmv-border border-dashed p-6">
            <CmvText className="text-cmv-text-hi">{t(`reminder.empty.${segment}.title`)}</CmvText>
            <CmvText className="text-cmv-text-mid text-sm">
              {t(`reminder.empty.${segment}.description`)}
            </CmvText>
          </View>
        ) : null}

        {shown.map((reminder) => (
          <ReminderCard
            key={reminder.id}
            reminder={reminder}
            busy={updateStatus.isPending}
            onMarkDone={() => updateStatus.mutate({ id: reminder.id, status: ReminderStatus.DONE })}
            onDismiss={() =>
              updateStatus.mutate({ id: reminder.id, status: ReminderStatus.DISMISSED })
            }
            onReopen={() =>
              updateStatus.mutate({ id: reminder.id, status: ReminderStatus.PENDING })
            }
          />
        ))}
      </ScrollView>
    </CmvScreen>
  );
}
