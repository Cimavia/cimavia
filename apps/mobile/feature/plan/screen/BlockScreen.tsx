import {
  type BlockCheck,
  flowPhrase,
  type ReadBlock,
  readScheduledBlocks,
  type SessionBlockTracking,
} from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { BlockCard } from "@/feature/plan/component/BlockCard";
import { BlockTimerOverlay } from "@/feature/plan/component/BlockTimerOverlay";
import { BlockTrackingList } from "@/feature/plan/component/BlockTrackingList";
import { useBlockTimer } from "@/feature/plan/hook/useBlockTimer";
import { useLocalBlockTracking } from "@/feature/plan/hook/useLocalBlockTracking";
import { useScheduledSession } from "@/feature/plan/hook/useMyPlan";
import { CmvButton, CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { usePhraseText } from "@/shared/hook/usePhraseText";

/**
 * L'écran d'un bloc (#722, frames 3 et 6) : le bloc lu en entier, « Un tour » en codes, « Mon
 * suivi » toujours ouvert, et le chrono à lancer quand le bloc en a un. Le suivi se coche ici, à
 * l'avance, pendant ou après : il part avec le débrief.
 */
export function BlockScreen() {
  const { t } = useTranslation();
  const { id, blockId } = useLocalSearchParams<{ id: string; blockId: string }>();
  const { data: session, isPending, isError, refetch } = useScheduledSession(id);

  const read = useMemo(
    () =>
      session == null
        ? null
        : (readScheduledBlocks(session).find((candidate) => candidate.block.id === blockId) ??
          null),
    [session, blockId],
  );
  const local = useLocalBlockTracking(id, session?.blocks);
  const timer = useBlockTimer(read);

  const step = timer.current;

  return (
    <CmvScreen>
      <View className="flex-row items-center gap-3 border-cmv-border border-b px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("plan.blocks.back")}
          className="rounded-lg border border-cmv-border bg-cmv-surface p-2"
        >
          <Ionicons name="chevron-back" size={18} color={cmvColors.text.hi} />
        </Pressable>
        <CmvText className="flex-1 font-cmv-display text-cmv-text-hi" numberOfLines={1}>
          {session?.title ?? ""}
        </CmvText>
      </View>

      <ScrollView contentContainerClassName="gap-6 p-4">
        {isPending ? <ActivityIndicator /> : null}
        {isError && session == null ? <CmvErrorState onRetry={() => refetch()} /> : null}

        {/* Le coach a pu retirer le bloc pendant que l'athlète avait l'écran ouvert : on le dit,
            plutôt qu'un écran vide sans explication. */}
        {session != null && read == null ? (
          <CmvText className="text-cmv-text-mid">{t("plan.blocks.missing")}</CmvText>
        ) : null}

        {read == null || session == null ? null : (
          <BlockBody
            read={read}
            planId={session.planId}
            sessionId={session.id}
            tracking={local.tracking[read.block.id] ?? null}
            onToggle={(check) => local.toggle(read.block.id, check)}
          />
        )}
      </ScrollView>

      {timer.steps.length === 0 || timer.active ? null : (
        <View className="border-cmv-border border-t p-4">
          <CmvButton label={t("plan.blocks.runTimer")} onPress={timer.run} />
        </View>
      )}

      {/* Le bloc LANCÉ, pas celui relu depuis : une séance rafraîchie en cours de chrono (bloc
          retiré ou modifié) ne fait ni disparaître le chrono, ni changer ses exercices. */}
      {timer.context == null || step == null ? null : (
        <BlockTimerOverlay
          read={timer.context}
          step={step}
          remaining={timer.remaining}
          total={timer.total}
          isPaused={timer.isPaused}
          armed={timer.armed}
          onConfirm={timer.confirm}
          onPause={timer.pause}
          onResume={timer.resume}
          onSkip={timer.skip}
          onAdd={timer.add}
          onStop={timer.stop}
        />
      )}
    </CmvScreen>
  );
}

/** Le bloc, « Un tour » et « Mon suivi » — extrait de l'écran pour sa complexité. */
function BlockBody({
  read,
  planId,
  sessionId,
  tracking,
  onToggle,
}: Readonly<{
  read: ReadBlock;
  planId: string;
  sessionId: string;
  tracking: SessionBlockTracking | null;
  onToggle: (check: BlockCheck) => void;
}>) {
  const { t } = useTranslation();
  const text = usePhraseText();
  const flow = flowPhrase(read.block.settings, read.labels);

  return (
    <>
      <BlockCard read={read} planId={planId} sessionId={sessionId} tally={null} showFlow={false} />

      {flow == null ? null : (
        <View className="gap-1">
          <CmvText className="font-cmv-display text-cmv-text-hi">
            {t("plan.blocks.oneRound")}
          </CmvText>
          <CmvText className="text-cmv-text-mid text-sm">{text([flow])}</CmvText>
        </View>
      )}

      <BlockTrackingList read={read} tracking={tracking} onToggle={onToggle} />
    </>
  );
}
