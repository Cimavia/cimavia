import {
  type CustomMetric,
  type GridCell,
  gridCellsAt,
  gridLinePhrases,
  type ReadBlock,
  type ReadExercise,
  type RunStep,
  RunStepKind,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useDescribeCell } from "@/feature/plan/component/GridValues";
import { CmvText } from "@/shared/component";
import { usePhraseText } from "@/shared/hook/usePhraseText";

/**
 * Ce que l'étape du chrono a à faire (#722, frame 4) :
 *  - un compte à rebours ou une limite durent tout le bloc : « Un tour », ses exercices dans
 *    l'ordre ;
 *  - un repos annonce ce qui vient — « Ensuite », l'exercice et ses valeurs du tour ;
 *  - un bip, un effort ou un exercice sans durée désignent l'exercice en cours, s'il n'y en a
 *    qu'un à la fois.
 */
export function StepExercises({ read, step }: Readonly<{ read: ReadBlock; step: RunStep }>) {
  const { t } = useTranslation();

  if (step.kind === RunStepKind.CAP || step.kind === RunStepKind.UP) {
    return (
      <View className="items-center gap-1">
        <CmvText className="text-cmv-text-lo text-xs uppercase">
          {t("plan.blocks.oneRound")}
        </CmvText>
        {read.exercises.map((exercise) => (
          <ExerciseLine key={exercise.row.id} exercise={exercise} cells={null} />
        ))}
      </View>
    );
  }

  const exercise = step.exerciseIndex == null ? null : read.exercises[step.exerciseIndex];
  if (exercise == null) return null;

  return (
    <View className="items-center gap-1">
      {step.kind === RunStepKind.REST ? (
        <CmvText className="text-cmv-text-lo text-xs uppercase">{t("plan.clock.next")}</CmvText>
      ) : null}
      <ExerciseLine
        exercise={exercise}
        cells={step.row == null ? null : gridCellsAt(exercise.row.grid, step.row)}
      />
    </View>
  );
}

function ExerciseLine({
  exercise,
  cells,
}: Readonly<{ exercise: ReadExercise; cells: readonly GridCell[] | null }>) {
  const { code, content } = exercise;
  return (
    <View className="items-center">
      <CmvText className="text-center text-cmv-text-hi">
        {code == null ? null : <CmvText className="text-cmv-text-mid">{`${code}  `}</CmvText>}
        {content.title}
      </CmvText>
      {cells == null ? null : <CellsLine cells={cells} customMetrics={content.customMetrics} />}
    </View>
  );
}

function CellsLine({
  cells,
  customMetrics,
}: Readonly<{ cells: readonly GridCell[]; customMetrics: readonly CustomMetric[] }>) {
  const text = usePhraseText();
  const phrases = gridLinePhrases(cells, useDescribeCell(customMetrics));
  return <CmvText className="text-center text-cmv-text-mid text-sm">{text(phrases)}</CmvText>;
}
