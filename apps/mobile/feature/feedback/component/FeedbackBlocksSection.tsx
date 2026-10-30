import {
  type BlockCheck,
  type BlockSessionTracking,
  blockHeading,
  readScheduledBlocks,
  type ScheduledSessionDto,
  sessionBlockTally,
} from "@cmv/shared";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { BlockTallyText } from "@/feature/feedback/component/BlockTallyText";
import { BlockMark } from "@/feature/plan/component/BlockCard";
import { BlockTrackingList } from "@/feature/plan/component/BlockTrackingList";
import { CmvText } from "@/shared/component";

type FeedbackBlocksSectionProps = {
  session: ScheduledSessionDto;
  tracking: BlockSessionTracking;
  onToggle: (blockId: string, check: BlockCheck) => void;
};

/**
 * Le décompte d'une séance par blocs, RAPPELÉ dans le débrief (#722) : une ligne par bloc, son
 * décompte, et ses cases à un tap pour corriger. Un bloc où rien n'est coché le dit, « pas de
 * décompte », en gris — la mention du débrief que la frame 6 prévoit à la place de la pastille.
 */
export function FeedbackBlocksSection({
  session,
  tracking,
  onToggle,
}: Readonly<FeedbackBlocksSectionProps>) {
  const { t } = useTranslation();
  const blocks = useMemo(() => readScheduledBlocks(session), [session]);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <View className="gap-2">
      <CmvText className="text-cmv-text-mid text-xs uppercase">
        {t("feedback.tracking.title")}
      </CmvText>

      {blocks.map((read) => {
        const { block } = read;
        const isEditing = editing === block.id;
        const state = tracking[block.id] ?? null;
        return (
          <View
            key={block.id}
            className="gap-2 rounded-lg border border-cmv-border bg-cmv-surface p-3"
          >
            <Pressable
              onPress={() => setEditing(isEditing ? null : block.id)}
              accessibilityRole="button"
              accessibilityLabel={t("feedback.tracking.edit", { exercise: blockHeading(read) })}
              className="flex-row items-center gap-3"
            >
              <BlockMark number={read.number} label={block.label} />
              <CmvText className="flex-1 text-cmv-text-hi text-sm" numberOfLines={1}>
                {block.name}
              </CmvText>
              <BlockTallyText tally={sessionBlockTally(block, tracking)} />
              <CmvText className="text-cmv-accent text-xs">
                {t(isEditing ? "feedback.tracking.close" : "feedback.tracking.open")}
              </CmvText>
            </Pressable>

            {isEditing ? (
              <BlockTrackingList
                read={read}
                tracking={state}
                onToggle={(check) => onToggle(block.id, check)}
              />
            ) : null}
          </View>
        );
      })}

      <CmvText className="text-cmv-text-lo text-xs">{t("feedback.tracking.hint")}</CmvText>
    </View>
  );
}
