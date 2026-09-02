import {
  type BlockSegment,
  type BlockStructure,
  BlockType,
  type CustomMetric,
  type ExerciseBlock,
  formatTrainingDuration,
  metricCellText,
  rowForUnit,
  SegmentKind,
} from "@cmv/shared";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { CmvText } from "@/shared/component";

// i18n-values plan.timer.segment: SegmentKind

type RunnerBodyProps = {
  block: ExerciseBlock;
  customMetrics: readonly CustomMetric[];
  current: BlockSegment;
  remaining: number;
  total: number;
  totalRemaining: number;
  /** Les unités déjà cochées — les tops faits, pour la frise d'un EMOM. */
  checked: readonly number[];
  /** Les tours comptés d'un AMRAP. Il se COMPTE, il ne se coche pas. */
  rounds: number;
};

/**
 * Ce que le calque affiche AU MILIEU, selon la nature du segment.
 *
 * Quatre formes, parce qu'un EMOM et un gainage ne demandent pas la même chose : l'un veut savoir
 * combien de temps avant le prochain top, l'autre combien de temps il doit tenir. Une seule vue
 * générique aurait affiché « Intervalle 37 s » à un athlète qui cherche « il me reste 6 tops ».
 */
export function RunnerBody({
  block,
  customMetrics,
  current,
  remaining,
  total,
  totalRemaining,
  checked,
  rounds,
}: Readonly<RunnerBodyProps>) {
  const { t } = useTranslation();

  if (current.kind === SegmentKind.MANUAL) {
    return (
      <>
        <CmvText className="px-4 text-center text-cmv-text-mid">{t("plan.timer.awaiting")}</CmvText>
        <Dosage block={block} customMetrics={customMetrics} segment={current} t={t} />
      </>
    );
  }

  if (current.kind === SegmentKind.INTERVAL) {
    return (
      <EmomBody
        block={block}
        customMetrics={customMetrics}
        current={current}
        remaining={remaining}
        totalRemaining={totalRemaining}
        checked={checked}
      />
    );
  }

  if (current.kind === SegmentKind.COUNTDOWN) {
    return (
      <AmrapBody
        block={block}
        customMetrics={customMetrics}
        current={current}
        remaining={remaining}
        rounds={rounds}
      />
    );
  }

  return (
    <>
      <Chrono seconds={remaining} />
      <CmvText className="text-cmv-text-mid text-sm">
        {t("plan.timer.outOf", { total: formatTrainingDuration(total) ?? "—" })}
      </CmvText>
      <Bar ratio={total === 0 ? 0 : remaining / total} />
      <CmvText className="text-cmv-text-lo text-xs">
        {t("plan.timer.totalRemaining", {
          duration: formatTrainingDuration(totalRemaining) ?? "—",
        })}
      </CmvText>
      <Dosage block={block} customMetrics={customMetrics} segment={current} t={t} />
    </>
  );
}

/** L'EMOM : le temps qui reste AVANT LE PROCHAIN TOP, et les tops déjà faits. */
function EmomBody({
  block,
  customMetrics,
  current,
  remaining,
  totalRemaining,
  checked,
}: Readonly<{
  block: ExerciseBlock;
  customMetrics: readonly CustomMetric[];
  current: BlockSegment;
  remaining: number;
  totalRemaining: number;
  checked: readonly number[];
}>) {
  const { t } = useTranslation();
  const count = topCount(block.structure);

  return (
    <>
      <Chrono seconds={remaining} />
      <CmvText className="text-cmv-text-mid text-sm">{t("plan.timer.beforeNextTop")}</CmvText>
      <CmvText className="text-cmv-text-lo text-xs">
        {t("plan.timer.totalRemaining", {
          duration: formatTrainingDuration(totalRemaining) ?? "—",
        })}
      </CmvText>
      <Dosage block={block} customMetrics={customMetrics} segment={current} t={t} />

      {/* La frise des tops : ce qui est fait, et ce qui reste. Elle remplace un compteur nu —
          l'athlète voit d'un coup d'œil s'il a sauté un top. */}
      <View className="flex-row flex-wrap justify-center gap-2">
        {Array.from({ length: count }, (_unused, index) => (
          <View
            key={`top-${index}`}
            className={`size-8 items-center justify-center rounded-full border ${topStyle(
              checked.includes(index),
              index === current.unitIndex,
            )}`}
          >
            <CmvText className="text-cmv-text-mid text-xs">{String(index + 1)}</CmvText>
          </View>
        ))}
      </View>
    </>
  );
}

/** L'AMRAP : une seule échéance, et des tours qu'on COMPTE — l'objectif n'est qu'indicatif. */
function AmrapBody({
  block,
  customMetrics,
  current,
  remaining,
  rounds,
}: Readonly<{
  block: ExerciseBlock;
  customMetrics: readonly CustomMetric[];
  current: BlockSegment;
  remaining: number;
  rounds: number;
}>) {
  const { t } = useTranslation();
  const target = block.structure.type === BlockType.AMRAP ? block.structure.targetRounds : null;

  return (
    <>
      <CmvText className="text-cmv-text-mid text-sm">{t("plan.timer.timeLeft")}</CmvText>
      <Chrono seconds={remaining} />
      <Dosage block={block} customMetrics={customMetrics} segment={current} t={t} />

      <View className="items-center gap-1">
        <CmvText className="font-cmv-display text-4xl text-cmv-text-hi">{String(rounds)}</CmvText>
        <CmvText className="text-cmv-text-mid text-xs">
          {t("plan.tracking.rounds", { count: rounds })}
        </CmvText>
        {target == null ? null : (
          <CmvText className="text-cmv-text-lo text-xs">
            {t("plan.timer.targetRounds", { count: target })}
          </CmvText>
        )}
      </View>
    </>
  );
}

/** Le dosage de la ligne en cours — sans lui, l'athlète ne sait pas ce qu'il doit faire. */
function Dosage({
  block,
  customMetrics,
  segment,
  t,
}: Readonly<{
  block: ExerciseBlock;
  customMetrics: readonly CustomMetric[];
  segment: BlockSegment;
  t: TFunction;
}>) {
  const row =
    segment.rowId == null
      ? rowForUnit(block, segment.unitIndex ?? 0)
      : (block.rows.find((candidate) => candidate.id === segment.rowId) ?? null);
  if (row == null) return null;

  // Les absences sont sautées ICI, explicitement : la bannière d'un segment en cours tient sur une
  // ligne centrée, et l'athlète a les yeux dessus entre deux séries. `metricCellText` rend TOUJOURS
  // quelque chose — c'est à l'appelant de déclarer ce qu'il omet.
  const detail = block.metrics
    .filter((metric) => row.values[metric.id] != null)
    .map((metric) => metricCellText(row.values[metric.id] ?? null, metric, customMetrics, t))
    .join(" · ");
  if (detail === "") return null;

  return <CmvText className="px-4 text-center text-cmv-text-mid text-sm">{detail}</CmvText>;
}

function Chrono({ seconds }: Readonly<{ seconds: number }>) {
  return (
    <CmvText className="font-cmv-display text-cmv-chrono text-cmv-text-hi">
      {formatTrainingDuration(seconds) ?? "0 s"}
    </CmvText>
  );
}

function Bar({ ratio }: Readonly<{ ratio: number }>) {
  return (
    <View className="h-1 w-full overflow-hidden rounded-full bg-cmv-surface">
      <View
        className="h-full bg-cmv-accent"
        style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }}
      />
    </View>
  );
}

/** Fait · en cours · à venir — les trois états d'un top, dans cet ordre de priorité. */
function topStyle(done: boolean, active: boolean): string {
  if (done) return "border-cmv-success-line bg-cmv-success-soft";
  if (active) return "border-cmv-accent-line bg-cmv-accent-soft";
  return "border-cmv-border";
}

function topCount(structure: BlockStructure): number {
  if (structure.type !== BlockType.EMOM) return 0;
  return Math.floor(structure.totalDurationSeconds / structure.intervalSeconds);
}
