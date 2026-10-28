import {
  type BlockGrid,
  type CustomMetric,
  exerciseCodes,
  flowPhrase,
  formatMetricValue,
  type GridCell,
  GridLayout,
  type GridReading,
  gridLinePhrases,
  gridReading,
  metricLabel,
  metricUnitLabel,
  type Phrase,
  phraseId,
  type StructureSettings,
  settingsPhrase,
} from "@cmv/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BlockMark } from "@/feature/library/component/BlockMark";
import { usePhraseText } from "@/shared/hook/usePhraseText";

export type BlockReadingExercise = {
  id: string;
  name: string;
  grid: BlockGrid;
  note: string | null;
  customMetrics: readonly CustomMetric[];
  /** Ce qui suit l'exercice : sa consigne et ses documents, sur la séance planifiée (#722). */
  extras?: ReactNode;
};

type BlockReadingProps = {
  number: string | null;
  label: string | null;
  settings: StructureSettings;
  instructions: string | null;
  exercises: readonly BlockReadingExercise[];
  /** Ce qui s'aligne à droite du numéro : la structure, le décompte. */
  aside?: ReactNode;
};

/**
 * Un bloc tel que l'athlète le lit (#719, #722) : le rythme une fois en tête, chaque exercice sous
 * son code. Une valeur absente ne s'affiche pas ; sans valeur, l'athlète voit juste le nom. Commun
 * à l'aperçu du constructeur et à la séance planifiée.
 */
export function BlockReading({
  number,
  label,
  settings,
  instructions,
  exercises,
  aside,
}: Readonly<BlockReadingProps>) {
  const text = usePhraseText();
  const count = exercises.length;
  const codes = exerciseCodes(number, count);
  const names = exercises.map((exercise) => exercise.name);
  const labels = names.map((name, index) => codes[index] ?? name);
  const phrase = settingsPhrase(settings, count, names);
  const flow = flowPhrase(settings, labels);

  return (
    <section className="flex flex-col gap-cmv-sm">
      <div className="flex items-center gap-cmv-sm">
        <h3 className="text-cmv-h3 text-cmv-text-hi">
          {number == null ? label : <BlockMark mark={number} kind="block" />}
        </h3>
        {aside}
      </div>
      {phrase == null ? null : <p className="text-cmv-body text-cmv-text-hi">{text(phrase)}</p>}
      {flow == null ? null : <p className="text-cmv-caption text-cmv-text-mid">{text([flow])}</p>}
      {instructions == null ? null : (
        <p className="whitespace-pre-line text-cmv-caption text-cmv-text-mid">{instructions}</p>
      )}
      <ol className="flex flex-col gap-cmv-sm border-cmv-border border-l pl-cmv-md">
        {exercises.map((exercise, index) => (
          <li key={exercise.id} className="flex flex-col gap-cmv-xs">
            <span className="text-cmv-body text-cmv-text-hi">
              {codes[index] == null ? null : (
                <span className="mr-cmv-sm text-cmv-text-mid tabular-nums">{codes[index]}</span>
              )}
              {exercise.name}
            </span>
            <ExerciseValues
              reading={gridReading(exercise.grid, settings, count)}
              customMetrics={exercise.customMetrics}
            />
            {exercise.note == null ? null : (
              <span className="text-cmv-caption text-cmv-text-lo">{exercise.note}</span>
            )}
            {exercise.extras}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ExerciseValues({
  reading,
  customMetrics,
}: Readonly<{ reading: GridReading; customMetrics: readonly CustomMetric[] }>) {
  const { t, i18n } = useTranslation();
  const text = usePhraseText();
  const line = (cells: readonly GridCell[]) =>
    text(
      gridLinePhrases(cells, (cell) => ({
        label: metricLabel(cell.metric, customMetrics, t),
        value: formatMetricValue(cell.value, cell.metric, customMetrics, i18n.language),
        unit: metricUnitLabel(cell.metric, customMetrics, t),
      })),
    );

  if (reading.layout === GridLayout.NONE) return null;
  if (reading.layout === GridLayout.LINE) {
    const each: Phrase[] = reading.each == null ? [] : [reading.each];
    return (
      <span className="text-cmv-caption text-cmv-text-mid">
        {[...(each.length === 0 ? [] : [text(each)]), line(reading.cells)].join(" ")}
      </span>
    );
  }
  return (
    <ul className="flex flex-col text-cmv-caption text-cmv-text-mid">
      {reading.rows.map((row) => (
        <li key={phraseId(row.label)}>
          {text([row.label])} · {line(row.cells)}
        </li>
      ))}
    </ul>
  );
}
