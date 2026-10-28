import {
  type BlockCheck,
  type BlockSessionTracking,
  blockHeading,
  type ReadBlock,
  sessionBlockTally,
} from "@cmv/shared";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { BlockMark } from "@/feature/library/component/BlockMark";
import { TallyBadge } from "@/feature/plan/component/AthleteBlockSession";
import { BlockTrackingList } from "@/feature/plan/component/BlockTrackingList";
import { CmvCard } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

type BlockRailSectionProps = {
  blocks: readonly ReadBlock[];
  tracking: BlockSessionTracking;
  selected: string | null;
  onSelect: (blockId: string) => void;
  onToggle: (blockId: string, check: BlockCheck) => void;
  /** Le panneau « Mon suivi », que l'écran amène à la vue quand un bloc l'ouvre. */
  trackingRef?: Ref<HTMLElement>;
};

/**
 * Le rail d'une séance par blocs (#722, frames 7 et 8) : les blocs et leur décompte, puis « Mon
 * suivi » du bloc choisi. Pas de chrono sur le web : il lit et coche seulement (*Tranché en #722*).
 */
export function BlockRailSection({
  blocks,
  tracking,
  selected,
  onSelect,
  onToggle,
  trackingRef,
}: Readonly<BlockRailSectionProps>) {
  const { t } = useTranslation();
  const current = blocks.find((read) => read.block.id === selected) ?? null;

  return (
    <>
      <CmvCard>
        <nav className="flex flex-col gap-cmv-xs">
          <span className="text-cmv-caption text-cmv-text-mid">
            {t("plan.athlete.blocks.title")}
          </span>
          {blocks.map((read) => (
            <a
              key={read.block.id}
              href={`#block-${read.block.id}`}
              onClick={() => onSelect(read.block.id)}
              className={cn(
                "flex items-center gap-cmv-sm rounded-cmv-sm px-cmv-xs py-cmv-xs text-cmv-body hover:text-cmv-text-hi",
                read.block.id === selected ? "text-cmv-text-hi" : "text-cmv-text-mid",
              )}
            >
              {read.number == null ? null : <BlockMark mark={read.number} kind="block" />}
              <span className="flex-1 truncate">
                {read.number == null ? blockHeading(read) : read.block.name}
              </span>
              <TallyBadge tally={sessionBlockTally(read.block, tracking)} />
            </a>
          ))}
        </nav>
      </CmvCard>

      <CmvCard>
        <section
          ref={trackingRef}
          tabIndex={-1}
          aria-label={t("plan.athlete.blocks.tracking")}
          className="flex flex-col gap-cmv-sm"
        >
          <span className="text-cmv-caption text-cmv-text-mid">
            {t("plan.athlete.blocks.tracking")}
          </span>
          {current == null ? (
            <p className="text-cmv-body text-cmv-text-lo">{t("plan.athlete.blocks.choose")}</p>
          ) : (
            <BlockTrackingList
              read={current}
              tracking={tracking[current.block.id] ?? null}
              onToggle={(check) => onToggle(current.block.id, check)}
            />
          )}
        </section>
      </CmvCard>
    </>
  );
}
