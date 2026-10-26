import {
  blockLetters,
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
  type SessionBlock,
  settingsPhrase,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvCard } from "@/shared/component";
import { usePhraseText } from "@/shared/hook/usePhraseText";

type BlockSessionPreviewProps = {
  blocks: readonly SessionBlock[];
  /** Le titre de chaque exercice, par clé ; `null` quand il ne se lit pas encore. */
  titleOf: (key: string) => string | null;
  customMetrics: readonly CustomMetric[];
};

/**
 * Ce que l'athlète lira de la séance (#719, maquette `coach_constructeur_seance_v2`, frame 8) :
 * bloc par bloc, le rythme une fois en tête, chaque exercice sous son code. Une valeur absente ne
 * s'affiche pas ; sans valeur, l'athlète voit juste le nom.
 *
 * Il ne lit que des blocs : le constructeur de séance-type le montre, la séance planifiée (#722)
 * le réutilisera.
 */
export function BlockSessionPreview({
  blocks,
  titleOf,
  customMetrics,
}: Readonly<BlockSessionPreviewProps>) {
  const { t } = useTranslation();
  const letters = blockLetters(blocks);

  return (
    <CmvCard>
      <div className="flex flex-col gap-cmv-lg">
        <span className="text-cmv-caption text-cmv-text-mid">
          {t("library.session.blocks.previewTitle")}
        </span>
        {blocks.length === 0 ? (
          <p className="text-cmv-body text-cmv-text-lo">{t("library.session.previewEmpty")}</p>
        ) : (
          blocks.map((block, index) => (
            <PreviewOfBlock
              key={block.id}
              block={block}
              letter={letters[index] ?? null}
              titleOf={titleOf}
              customMetrics={customMetrics}
            />
          ))
        )}
      </div>
    </CmvCard>
  );
}

type PreviewOfBlockProps = {
  block: SessionBlock;
  letter: string | null;
  titleOf: (key: string) => string | null;
  customMetrics: readonly CustomMetric[];
};

function PreviewOfBlock({ block, letter, titleOf, customMetrics }: Readonly<PreviewOfBlockProps>) {
  const text = usePhraseText();
  const count = block.exercises.length;
  const codes = exerciseCodes(letter, count);
  const names = block.exercises.map((exercise) => titleOf(exercise.key) ?? "—");
  const labels = names.map((name, index) => codes[index] ?? name);
  const phrase = settingsPhrase(block.settings, count, names);
  const flow = flowPhrase(block.settings, labels);

  return (
    <section className="flex flex-col gap-cmv-sm">
      <h3 className="text-cmv-h3 text-cmv-text-hi">{letter ?? block.label}</h3>
      {phrase == null ? null : <p className="text-cmv-body text-cmv-text-hi">{text(phrase)}</p>}
      {flow == null ? null : <p className="text-cmv-caption text-cmv-text-mid">{text([flow])}</p>}
      {block.instructions == null ? null : (
        <p className="whitespace-pre-line text-cmv-caption text-cmv-text-mid">
          {block.instructions}
        </p>
      )}
      <ol className="flex flex-col gap-cmv-sm border-cmv-border border-l pl-cmv-md">
        {block.exercises.map((exercise, index) => (
          <li key={exercise.key} className="flex flex-col gap-cmv-xs">
            <span className="text-cmv-body text-cmv-text-hi">
              {codes[index] == null ? null : (
                <span className="mr-cmv-sm text-cmv-text-mid tabular-nums">{codes[index]}</span>
              )}
              {names[index]}
            </span>
            <ExerciseValues
              reading={gridReading(exercise.grid, block.settings, count)}
              customMetrics={customMetrics}
            />
            {exercise.note == null ? null : (
              <span className="text-cmv-caption text-cmv-text-lo">{exercise.note}</span>
            )}
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
        <li key={text([row.label])}>
          {text([row.label])} · {line(row.cells)}
        </li>
      ))}
    </ul>
  );
}
