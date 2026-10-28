import {
  blockHeading,
  readScheduledBlocks,
  type ScheduledSessionDto,
  sessionBlockTally,
} from "@cmv/shared";
import { router } from "expo-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { BlockCard } from "@/feature/plan/component/BlockCard";
import type { BlockScrollSpy } from "@/feature/plan/hook/useBlockScrollSpy";
import { useLocalBlockTracking } from "@/feature/plan/hook/useLocalBlockTracking";
import { CmvText } from "@/shared/component";

type SessionBlocksProps = {
  session: ScheduledSessionDto;
  /** Le défilement de l'écran : quel bloc est en cours, et où mène chaque puce. */
  spy: BlockScrollSpy;
};

/**
 * La séance lue bloc par bloc (#722, frame 1). Les puces sont un sommaire : un tap fait défiler
 * jusqu'au bloc, et celle du bloc en haut de l'écran ressort. Toute la carte ouvre l'écran du bloc,
 * où se lancent le chrono et le suivi.
 */
export function SessionBlocks({ session, spy }: Readonly<SessionBlocksProps>) {
  const { t } = useTranslation();
  const blocks = useMemo(() => readScheduledBlocks(session), [session]);
  // La pastille lit le suivi LOCAL : ce qui vient d'être coché sur l'écran du bloc s'y voit au retour.
  const { tracking } = useLocalBlockTracking(session.id, session.blocks);

  return (
    <View className="gap-3" onLayout={(event) => spy.measureList(event.nativeEvent.layout.y)}>
      <CmvText className="text-cmv-text-mid text-xs">
        {t("plan.blocks.count", { count: blocks.length })}
      </CmvText>

      <ScrollView
        accessibilityRole="tablist"
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        {blocks.map((read, index) => (
          <Pressable
            key={read.block.id}
            onPress={() => spy.scrollTo(index)}
            // Le sommaire se lit comme des onglets : celui du bloc en cours est « sélectionné ».
            accessibilityRole="tab"
            aria-selected={index === spy.current}
            className={`min-h-9 justify-center rounded-md border px-3 ${
              index === spy.current
                ? "border-cmv-accent-line bg-cmv-accent-soft"
                : "border-cmv-border bg-cmv-surface"
            }`}
          >
            <CmvText
              className={
                index === spy.current ? "text-cmv-accent-on text-sm" : "text-cmv-text-mid text-sm"
              }
            >
              {blockHeading(read)}
            </CmvText>
          </Pressable>
        ))}
      </ScrollView>

      {blocks.map((read, index) => (
        <View
          key={read.block.id}
          onLayout={(event) => spy.measureBlock(index, event.nativeEvent.layout.y)}
        >
          <BlockCard
            read={read}
            planId={session.planId}
            sessionId={session.id}
            tally={sessionBlockTally(read.block, tracking)}
            onOpen={() => router.push(`/session/${session.id}/block/${read.block.id}`)}
          />
        </View>
      ))}
    </View>
  );
}
