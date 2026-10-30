import { blockNumbers, type TrackedBlockDto, trackedBlockTally } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { BlockTallyText } from "@/feature/feedback/component/BlockTallyText";
import { BlockMark } from "@/feature/plan/component/BlockCard";
import { CmvText } from "@/shared/component";

/**
 * Le décompte d'une séance par blocs tel que le COACH le lit (#722) : un bloc par ligne, en
 * lecture, sans jugement — le pendant de `TrackedExerciseList`.
 */
export function TrackedBlockList({ blocks }: Readonly<{ blocks: readonly TrackedBlockDto[] }>) {
  const { t } = useTranslation();
  if (blocks.length === 0) return null;
  const numbers = blockNumbers(blocks);

  return (
    <View className="gap-2">
      <CmvText className="text-cmv-accent text-xs uppercase">
        {t("feedback.detail.tracking")}
      </CmvText>

      {blocks.map((block, index) => (
        <View key={block.blockId} className="flex-row items-center gap-3">
          <BlockMark number={numbers[index] ?? null} label={block.label} />
          <CmvText className="flex-1 text-cmv-text-hi text-sm" numberOfLines={1}>
            {block.name}
          </CmvText>
          <BlockTallyText tally={trackedBlockTally(block)} />
        </View>
      ))}
    </View>
  );
}
