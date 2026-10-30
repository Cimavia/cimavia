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
import { BlockTallyText } from "@/feature/feedback/component/BlockTallyText";
import { PencilIcon } from "@/feature/feedback/component/FeedbackTrackingSection";
import { BlockMark } from "@/feature/library/component/BlockMark";
import { BlockTrackingList } from "@/feature/plan/component/BlockTrackingList";
import { CmvCard } from "@/shared/component";

type FeedbackBlocksSectionProps = {
  session: ScheduledSessionDto;
  tracking: BlockSessionTracking;
  onToggle: (blockId: string, check: BlockCheck) => void;
};

/**
 * Le décompte d'une séance par blocs, RAPPELÉ dans le débrief (#722) : une ligne par bloc, son
 * décompte, et le crayon qui rouvre ses cases. Un bloc où rien n'est coché le dit, « pas de
 * décompte », en gris.
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
    <section className="flex flex-col gap-cmv-sm">
      <h2 className="text-cmv-caption text-cmv-text-mid uppercase tracking-wide">
        {t("feedback.tracking.title")}
      </h2>

      {blocks.map((read) => {
        const { block } = read;
        const isEditing = editing === block.id;
        return (
          <CmvCard key={block.id}>
            <div className="flex flex-col gap-cmv-sm">
              <div className="flex items-center gap-cmv-md">
                {read.number == null ? null : <BlockMark mark={read.number} kind="block" />}
                <span className="min-w-0 flex-1 truncate text-cmv-body text-cmv-text-hi">
                  {read.number == null ? blockHeading(read) : block.name}
                </span>
                <BlockTallyText tally={sessionBlockTally(block, tracking)} />
                <button
                  type="button"
                  aria-label={t("feedback.tracking.edit", { exercise: blockHeading(read) })}
                  aria-expanded={isEditing}
                  onClick={() => setEditing(isEditing ? null : block.id)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-cmv-md border border-cmv-border bg-cmv-bg-1 text-cmv-text-mid hover:border-cmv-border-hi hover:text-cmv-text-hi"
                >
                  <PencilIcon />
                </button>
              </div>

              {isEditing ? (
                <BlockTrackingList
                  read={read}
                  tracking={tracking[block.id] ?? null}
                  onToggle={(check) => onToggle(block.id, check)}
                />
              ) : null}
            </div>
          </CmvCard>
        );
      })}

      <p className="text-cmv-caption text-cmv-text-lo">{t("feedback.tracking.hint")}</p>
    </section>
  );
}
