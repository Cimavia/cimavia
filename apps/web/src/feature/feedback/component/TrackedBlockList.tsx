import { blockNumbers, type TrackedBlockDto, trackedBlockTally } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { BlockTallyText } from "@/feature/feedback/component/BlockTallyText";
import { BlockMark } from "@/feature/library/component/BlockMark";

/**
 * Le décompte d'une séance par blocs tel que le COACH le lit (#722) : un bloc par ligne, en
 * lecture, sans jugement — le pendant de `TrackedExerciseList`.
 */
export function TrackedBlockList({ blocks }: Readonly<{ blocks: readonly TrackedBlockDto[] }>) {
  const { t } = useTranslation();
  if (blocks.length === 0) return null;
  const numbers = blockNumbers(blocks);

  return (
    <section className="flex flex-col gap-cmv-xs">
      <h4 className="text-cmv-caption text-cmv-accent uppercase tracking-wide">
        {t("feedback.detail.tracking")}
      </h4>
      <ul className="flex flex-col gap-cmv-xs">
        {blocks.map((block, index) => {
          const number = numbers[index] ?? null;
          return (
            <li key={block.blockId} className="flex items-center gap-cmv-md">
              {number == null ? null : <BlockMark mark={number} kind="block" />}
              <span className="min-w-0 flex-1 truncate text-cmv-body text-cmv-text-hi">
                {number == null ? block.label : block.name}
              </span>
              <BlockTallyText tally={trackedBlockTally(block)} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
