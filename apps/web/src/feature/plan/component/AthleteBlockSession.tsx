import {
  type BlockSessionTracking,
  type BlockTally,
  BlockTallyState,
  type ReadBlock,
  sessionBlockTally,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { BlockReading } from "@/feature/library/component/BlockReading";
import { AthleteExerciseExtras } from "@/feature/plan/component/AthleteExerciseExtras";
import { CmvBadge, CmvButton, CmvCard } from "@/shared/component";
import { usePhraseText } from "@/shared/hook/usePhraseText";

/** La pastille d'un décompte : verte quand tout est coché. Rien quand rien ne l'est. */
export function TallyBadge({ tally }: Readonly<{ tally: BlockTally | null }>) {
  const text = usePhraseText();
  if (tally == null) return null;
  return (
    <CmvBadge variant={tally.state === BlockTallyState.DONE ? "success" : "accent"}>
      {text([tally.label])}
    </CmvBadge>
  );
}

type AthleteBlockSessionProps = {
  blocks: readonly ReadBlock[];
  tracking: BlockSessionTracking;
  selected: string | null;
  onSelect: (blockId: string) => void;
};

/**
 * La séance lue bloc par bloc sur le web (#722, frame 7) : chaque bloc comme l'aperçu du
 * constructeur le montre, plus la consigne et les documents de ses exercices. « Mon suivi » choisit
 * le bloc : ses cases s'ouvrent dans le rail.
 */
export function AthleteBlockSession({
  blocks,
  tracking,
  selected,
  onSelect,
}: Readonly<AthleteBlockSessionProps>) {
  const { t } = useTranslation();

  return (
    <>
      <h2 className="text-cmv-caption text-cmv-text-mid uppercase tracking-wide">
        {t("plan.athlete.blocks.count", { count: blocks.length })}
      </h2>
      {blocks.map((read) => (
        <div
          key={read.block.id}
          id={`block-${read.block.id}`}
          className={
            selected === read.block.id ? "rounded-cmv-md ring-1 ring-cmv-accent-line" : undefined
          }
        >
          <CmvCard>
            <BlockReading
              number={read.number}
              label={read.block.label}
              settings={read.block.settings}
              instructions={read.block.instructions}
              aside={
                <>
                  <CmvBadge>{read.block.name}</CmvBadge>
                  <TallyBadge tally={sessionBlockTally(read.block, tracking)} />
                  <span className="flex-1" />
                  <CmvButton variant="ghost" onClick={() => onSelect(read.block.id)}>
                    {t("plan.athlete.blocks.tracking")}
                  </CmvButton>
                </>
              }
              exercises={read.exercises.map(({ row, content }) => ({
                id: row.id,
                name: content.title,
                grid: row.grid,
                note: row.note,
                customMetrics: content.customMetrics,
                extras: <AthleteExerciseExtras exercise={content} />,
              }))}
            />
          </CmvCard>
        </div>
      ))}
    </>
  );
}
