import {
  blockHeading,
  blockTrackingOf,
  readScheduledBlocks,
  type ScheduledSessionDto,
  sessionBlockTally,
} from "@cmv/shared";
import { router } from "expo-router";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { BlockCard } from "@/feature/plan/component/BlockCard";
import { useLocalBlockTracking } from "@/feature/plan/hook/useLocalBlockTracking";
import { CmvText } from "@/shared/component";

type SessionBlocksProps = {
  session: ScheduledSessionDto;
  /** Le défilement de l'écran, pour savoir quel bloc est en haut. */
  scrollY: number;
  /** Fait défiler l'écran jusqu'à cette hauteur, comptée dans son contenu. */
  onScrollTo: (y: number) => void;
};

/**
 * La séance lue bloc par bloc (#722, frame 1). Les puces sont un sommaire : un tap fait défiler
 * jusqu'au bloc, et celle du bloc en haut de l'écran ressort. Toute la carte ouvre l'écran du bloc,
 * où se lancent le chrono et le suivi.
 */
export function SessionBlocks({ session, scrollY, onScrollTo }: Readonly<SessionBlocksProps>) {
  const { t } = useTranslation();
  const blocks = useMemo(() => readScheduledBlocks(session), [session]);
  const remote = useMemo(() => blockTrackingOf(session.blocks), [session]);
  // La pastille lit le suivi LOCAL : ce qui vient d'être coché sur l'écran du bloc s'y voit au retour.
  const { tracking } = useLocalBlockTracking(session.id, remote);
  // Les hauteurs se mesurent au rendu : la liste dans l'écran, chaque carte dans la liste.
  const listTop = useRef(0);
  const tops = useRef<number[]>([]);
  // Les hauteurs de blocs retirés depuis restent dans `tops` : seules comptent celles affichées.
  const current = currentBlock(tops.current.slice(0, blocks.length), scrollY - listTop.current);

  return (
    <View className="gap-3" onLayout={(event) => (listTop.current = event.nativeEvent.layout.y)}>
      <CmvText className="text-cmv-text-mid text-xs">
        {t("plan.blocks.count", { count: blocks.length })}
      </CmvText>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        {blocks.map((read, index) => (
          <Pressable
            key={read.block.id}
            onPress={() => onScrollTo(listTop.current + (tops.current[index] ?? 0))}
            accessibilityRole="button"
            className={`min-h-9 justify-center rounded-md border px-3 ${
              index === current
                ? "border-cmv-accent-line bg-cmv-accent-soft"
                : "border-cmv-border bg-cmv-surface"
            }`}
          >
            <CmvText
              className={
                index === current ? "text-cmv-accent-on text-sm" : "text-cmv-text-mid text-sm"
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
          onLayout={(event) => {
            tops.current[index] = event.nativeEvent.layout.y;
          }}
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

/** Le dernier bloc dont le haut est passé sous le haut de l'écran ; le premier au départ. */
function currentBlock(tops: readonly number[], offset: number): number {
  let current = 0;
  tops.forEach((top, index) => {
    if (top <= offset) current = index;
  });
  return current;
}
