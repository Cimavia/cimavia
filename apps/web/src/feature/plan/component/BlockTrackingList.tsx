import {
  type BlockCheck,
  CheckBoxKind,
  checkOf,
  checksOfBlock,
  phraseId,
  type ReadBlock,
  type SessionBlockTracking,
  tickedRows,
  trackingNote,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { usePhraseText } from "@/shared/hook/usePhraseText";
import { cn } from "@/shared/util/cn.util";

type BlockTrackingListProps = {
  read: ReadBlock;
  tracking: SessionBlockTracking | null;
  onToggle: (check: BlockCheck) => void;
};

/**
 * « Mon suivi » d'un bloc sur le web (#722, frame 8) : les mêmes cases que sur mobile, une par
 * exercice et par tour, une par série ou par bip, ou la seule « Bloc fait ». Rien ne s'y coche
 * tout seul, et le décompte se lit dans le rail, au-dessus.
 */
export function BlockTrackingList({ read, tracking, onToggle }: Readonly<BlockTrackingListProps>) {
  const { t } = useTranslation();
  const text = usePhraseText();
  const checks = checksOfBlock(read.block);
  const ticked = tickedRows(checks, tracking);

  return (
    <div className="flex flex-col gap-cmv-sm">
      {checks.rows.map((row, rowIndex) => (
        <div
          // « Tour 2 », « Série 3 » : chaque rangée a son libellé, sauf quand elle est seule.
          key={row.label == null ? "single" : phraseId(row.label)}
          className="flex flex-wrap items-center gap-cmv-sm"
        >
          {row.label == null ? null : (
            <span className="w-20 text-cmv-caption text-cmv-text-mid">{text([row.label])}</span>
          )}
          {row.boxes.map((box, boxIndex) => {
            const checked = ticked[rowIndex]?.[boxIndex] === true;
            return (
              <button
                key={box.kind === CheckBoxKind.EXERCISE ? box.key : "block"}
                type="button"
                aria-pressed={checked}
                onClick={() => onToggle(checkOf(rowIndex, box))}
                className={cn(
                  "min-h-9 min-w-9 rounded-cmv-sm border px-cmv-sm text-cmv-caption",
                  checked
                    ? "border-cmv-success-line bg-cmv-success-soft text-cmv-success-on"
                    : "border-cmv-border bg-cmv-surface text-cmv-text-hi hover:border-cmv-border-hi",
                )}
              >
                {box.kind === CheckBoxKind.EXERCISE
                  ? (read.labels[box.exerciseIndex] ?? "")
                  : t("plan.athlete.blocks.blockDone")}
              </button>
            );
          })}
        </div>
      ))}
      <p className="text-cmv-caption text-cmv-text-lo">{text([trackingNote(checks)])}</p>
    </div>
  );
}
