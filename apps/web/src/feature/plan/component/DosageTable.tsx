import {
  AdjustmentLevel,
  blockNumbers,
  CompositionOrigin,
  type CustomMetric,
  type DosageCell,
  DosageCellKind,
  type DosageColumn,
  DosageColumnKind,
  type DosageExerciseLine,
  type DosageGroup,
  DosageOff,
  dosageAdjustedCount,
  dosageGroups,
  dosageMetricCell,
  dosageSettingCell,
  exerciseCodes,
  formatMetricValue,
  formatTrainingDuration,
  type GridMetric,
  type MetricValue,
  metricLabel,
  metricUnitLabel,
  type ScheduledSessionCopyDto,
  SettingValue,
  settingsPhrase,
  shownSeries,
} from "@cmv/shared";
import type { TFunction } from "i18next";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdjustmentMarker } from "@/feature/library/component/AdjustmentMarker";
import { BlockMark } from "@/feature/library/component/BlockMark";
import { DOSAGE_SETTING_LABEL, DosageCellEditor } from "@/feature/plan/component/DosageCellEditor";
import { CmvMenu } from "@/shared/component";
import { usePhraseText } from "@/shared/hook/usePhraseText";
import { cn } from "@/shared/util/cn.util";
import { formatDayLabel } from "@/shared/util/date.util";

/** Une seule façon de griser : les hachures — séance non posée, ou rien à régler cette semaine. */
const HATCHED =
  "bg-[repeating-linear-gradient(135deg,theme(colors.cmv.surface)_0_6px,theme(colors.cmv.bg-0)_6px_12px)]";

const OFF_LABEL: Record<DosageOff, string> = {
  [DosageOff.REPLACED]: "plan.dosage.off.REPLACED",
  [DosageOff.REMOVED]: "plan.dosage.off.REMOVED",
  [DosageOff.NOT_THIS_WEEK]: "plan.dosage.off.NOT_THIS_WEEK",
  [DosageOff.NONE]: "plan.dosage.off.NONE",
};

/** Ce qu'une cellule règle : une valeur du bloc, ou une métrique d'un exercice. */
export type DosageTarget =
  | { kind: "setting"; blockIndex: number; field: SettingValue }
  | { kind: "metric"; blockIndex: number; key: string; metric: GridMetric };

type DosageTableProps = {
  columns: readonly DosageColumn[];
  /** Les copies telles que le brouillon les porte. */
  copies: readonly ScheduledSessionCopyDto[];
  /** La séance d'où Dosage a été ouvert : sa colonne est mise en avant. */
  focusId: string;
  readOnly: boolean;
  onChange: (copyId: string, target: DosageTarget, values: readonly MetricValue[]) => void;
  onRevertCopy: (copyId: string) => void;
  onCompose: (copyId: string) => void;
};

/**
 * Le tableau de Dosage (#721, maquette `dosage_tableau`) : une colonne par semaine, une ligne par
 * valeur de bloc puis par métrique d'exercice. Chaque cellule se compare à la séance-type que SA
 * semaine a reçue ; un carré marque ce qui en diffère.
 */
export function DosageTable(props: Readonly<DosageTableProps>) {
  const { t } = useTranslation();
  const { columns, copies } = props;
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => dosageGroups(copies), [copies]);
  const rows = useMemo(() => rowIndex(copies), [copies]);
  const copyOf = (column: DosageColumn) =>
    column.kind === DosageColumnKind.COPY
      ? (copies.find((copy) => copy.id === column.copyId) ?? null)
      : null;
  // Numérotés comme la séance les montre : un bloc sans valeur, absent d'ici, garde son rang.
  const longest = copies.reduce<ScheduledSessionCopyDto | null>(
    (kept, copy) => (kept == null || copy.blocks.length > kept.blocks.length ? copy : kept),
    null,
  );
  const numbers = blockNumbers(longest?.blocks ?? []);

  const rowProps = { ...props, rows, copyOf, open, setOpen };
  return (
    <div className="overflow-x-auto rounded-cmv-md border border-cmv-border bg-cmv-bg-1">
      <table className="w-full min-w-max border-collapse">
        <thead>
          <tr className="border-cmv-border border-b bg-cmv-surface">
            <th
              scope="col"
              className="min-w-44 px-cmv-md py-cmv-sm text-left text-cmv-caption text-cmv-text-lo uppercase"
            >
              {t("plan.dosage.value")}
            </th>
            {columns.map((column) => (
              <ColumnHead
                key={column.kind === DosageColumnKind.COPY ? column.copyId : column.weekNumber}
                column={column}
                copy={copyOf(column)}
                {...props}
              />
            ))}
          </tr>
        </thead>
        {groups.map((group) => (
          <GroupRows
            key={group.block.id}
            group={group}
            number={numbers[group.blockIndex] ?? null}
            {...rowProps}
          />
        ))}
      </table>
    </div>
  );
}

type ColumnHeadProps = DosageTableProps & {
  column: DosageColumn;
  copy: ScheduledSessionCopyDto | null;
};

/** « S2 », son jour, ses valeurs ajustées ; et son menu : revenir à la séance-type, composer. */
function ColumnHead({ column, copy, focusId, readOnly, onRevertCopy, onCompose }: ColumnHeadProps) {
  const { t } = useTranslation();
  const week = t("plan.composition.week", { number: column.weekNumber });
  if (column.kind === DosageColumnKind.ABSENT || copy === null) {
    return (
      <th scope="col" className={cn("min-w-32 px-cmv-md py-cmv-sm text-left", HATCHED)}>
        <span className="block text-cmv-body text-cmv-text-lo">{week}</span>
        <span className="block text-cmv-caption text-cmv-text-lo">
          {t("plan.dosage.notPlaced")}
        </span>
      </th>
    );
  }
  const count = dosageAdjustedCount(copy);
  const focused = column.copyId === focusId;
  // Posée deux fois la même semaine, la séance a deux colonnes : son jour les distingue.
  const name = column.showDay
    ? t("plan.dosage.weekOnDay", { week, day: formatDayLabel(column.date) })
    : week;
  return (
    <th
      scope="col"
      aria-current={focused ? "true" : undefined}
      className={cn(
        "min-w-32 border-t-4 px-cmv-md py-cmv-sm text-left align-top",
        focused ? "border-t-cmv-accent bg-cmv-accent-soft" : "border-t-transparent",
        column.deload && "bg-cmv-bg-0",
      )}
    >
      <div className="flex items-start gap-cmv-xs">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-cmv-body text-cmv-text-hi">{name}</span>
          <span className="text-cmv-caption text-cmv-text-lo">
            {column.deload
              ? t("plan.dosage.deloadDay", { day: formatDayLabel(column.date) })
              : formatDayLabel(column.date)}
          </span>
          <span
            className={cn(
              "flex items-center gap-cmv-xs text-cmv-caption",
              count > 0 ? "text-cmv-info-on" : "text-cmv-text-lo",
            )}
          >
            {count > 0 ? <AdjustmentMarker level={AdjustmentLevel.SCHEDULED} /> : null}
            {t("plan.dosage.adjusted", { count })}
          </span>
          {column.locked ? (
            <span className="text-cmv-caption text-cmv-text-lo">{t("plan.dosage.debriefed")}</span>
          ) : null}
          {focused ? (
            <span className="text-cmv-caption text-cmv-accent-on">
              {t("plan.dosage.openedHere")}
            </span>
          ) : null}
        </div>
        <CmvMenu
          label={t("plan.dosage.columnActions", { week: name })}
          groups={[
            [
              {
                label: t("plan.composition.backToSessionType"),
                onSelect: () => onRevertCopy(copy.id),
                disabled: readOnly || column.locked || count === 0,
              },
              { label: t("plan.dosage.compose"), onSelect: () => onCompose(copy.id) },
            ],
          ]}
        />
      </div>
    </th>
  );
}

type RowProps = DosageTableProps & {
  rows: RowIndex;
  copyOf: (column: DosageColumn) => ScheduledSessionCopyDto | null;
  open: string | null;
  setOpen: (cell: string | null) => void;
};

/** Un bloc : son en-tête, ses valeurs, puis chaque métrique de chacun de ses exercices. */
function GroupRows({
  group,
  number,
  ...props
}: RowProps & { group: DosageGroup; number: string | null }) {
  const { t } = useTranslation();
  const text = usePhraseText();
  const { block, blockIndex } = group;
  const anchor = props.copies.find((copy) => copy.blocks[blockIndex]?.id === block.id);
  const titleOf = (rowId: string) => props.rows.byId.get(rowId)?.title ?? "—";
  const names = block.exercises.map((exercise) => titleOf(exercise.id));
  const phrase = settingsPhrase(block.settings, block.exercises.length, names);
  const received = anchor?.blocks[blockIndex]?.baseline.exercises.map(({ key }) => key) ?? [];
  const codes = exerciseCodes(number, block.exercises.length);
  const shown = anchor?.blocks[blockIndex] ?? null;
  const span = props.columns.length + 1;

  return (
    <tbody>
      <tr className="border-cmv-border border-t">
        <th colSpan={span} scope="colgroup" className="px-cmv-md pt-cmv-md pb-cmv-xs text-left">
          <span className="flex flex-wrap items-center gap-cmv-sm">
            {number == null ? (
              <span className="text-cmv-subtitle text-cmv-text-hi">{shown?.label}</span>
            ) : (
              <BlockMark mark={number} kind="block" />
            )}
            <span className="rounded-cmv-pill border border-cmv-border border-dashed px-cmv-sm text-cmv-caption text-cmv-text-mid">
              {shown?.name}
            </span>
            {phrase == null ? null : (
              <span className="text-cmv-caption text-cmv-text-lo">{text(phrase)}</span>
            )}
          </span>
        </th>
      </tr>
      {group.settings.map((field) => (
        <ValueRow
          key={field}
          {...props}
          id={`${blockIndex}:${field}`}
          name={t(DOSAGE_SETTING_LABEL[field])}
          note={field === SettingValue.ROUNDS ? t("plan.dosage.roundsNote") : null}
          target={{ kind: "setting", blockIndex, field }}
          cellOf={(copy) => dosageSettingCell(copy, blockIndex, field)}
        />
      ))}
      {group.exercises.flatMap((line) =>
        line.metrics.map((metric) => (
          <ValueRow
            key={`${line.key}:${metric.id}`}
            {...props}
            id={`${blockIndex}:${line.key}:${metric.id}`}
            code={received.includes(line.key) ? (codes[received.indexOf(line.key)] ?? null) : null}
            name={titleOf(line.rowId)}
            metricName={metricLabel(metric, props.rows.metricsOf(line.key), t)}
            tag={tagOf(line, received, codes, t)}
            target={{ kind: "metric", blockIndex, key: line.key, metric }}
            cellOf={(copy) => dosageMetricCell(copy, blockIndex, line.key, metric.id)}
          />
        )),
      )}
    </tbody>
  );
}

/** « ajouté », ou « remplace A1 » : ce que certaines semaines seulement portent. */
function tagOf(
  line: DosageExerciseLine,
  received: readonly string[],
  codes: readonly (string | null)[],
  t: TFunction,
): string | null {
  if (line.origin.kind === CompositionOrigin.ADDED) return t("plan.dosage.added");
  if (line.origin.kind !== CompositionOrigin.REPLACEMENT) return null;
  const code = codes[received.indexOf(line.origin.replacesKey)] ?? null;
  return code == null ? t("plan.dosage.replacement") : t("plan.dosage.replaces", { code });
}

type RowIndex = {
  byId: ReadonlyMap<string, ScheduledSessionCopyDto["exercises"][number]>;
  /** Les métriques maison figées des lignes d'un exercice : elles disent ce que valent ses colonnes. */
  metricsOf: (key: string) => readonly CustomMetric[];
};

/** Les lignes de toutes les copies, lues une fois par rendu et non à chaque cellule. */
function rowIndex(copies: readonly ScheduledSessionCopyDto[]): RowIndex {
  const byId = new Map(copies.flatMap((copy) => copy.exercises.map((row) => [row.id, row])));
  const byKey = new Map<string, CustomMetric[]>();
  for (const exercise of copies.flatMap((copy) =>
    copy.blocks.flatMap((block) => block.exercises),
  )) {
    const frozen = byId.get(exercise.id)?.customMetrics ?? [];
    byKey.set(exercise.key, [...(byKey.get(exercise.key) ?? []), ...frozen]);
  }
  return { byId, metricsOf: (key) => byKey.get(key) ?? [] };
}

type ValueRowProps = RowProps & {
  id: string;
  name: string;
  code?: string | null;
  metricName?: string;
  tag?: string | null;
  note?: string | null;
  target: DosageTarget;
  cellOf: (copy: ScheduledSessionCopyDto | null) => DosageCell;
};

function ValueRow(props: Readonly<ValueRowProps>) {
  const { columns, copyOf, id, name, code, metricName, tag, note } = props;
  return (
    <>
      <tr className="border-cmv-surface border-t">
        <th scope="row" className="px-cmv-md py-cmv-xs text-left font-normal">
          <span className="flex flex-wrap items-center gap-x-cmv-sm">
            {code == null ? null : (
              <span className="font-cmv-mono text-cmv-caption text-cmv-text-lo">{code}</span>
            )}
            <span className="text-cmv-body text-cmv-text-hi">{name}</span>
            {metricName == null ? null : (
              <span className="text-cmv-caption text-cmv-text-lo">{metricName}</span>
            )}
            {tag == null ? null : (
              <span className="rounded-cmv-pill border border-cmv-accent px-cmv-sm text-cmv-caption text-cmv-accent-on">
                {tag}
              </span>
            )}
          </span>
        </th>
        {columns.map((column) => (
          <ValueCell
            key={column.kind === DosageColumnKind.COPY ? column.copyId : column.weekNumber}
            {...props}
            column={column}
            copy={copyOf(column)}
            cellId={`${id}@${column.kind === DosageColumnKind.COPY ? column.copyId : column.weekNumber}`}
          />
        ))}
      </tr>
      {note == null ? null : (
        <tr>
          <td
            colSpan={columns.length + 1}
            className="px-cmv-md pb-cmv-xs text-cmv-caption text-cmv-text-lo"
          >
            {note}
          </td>
        </tr>
      )}
    </>
  );
}

type ValueCellProps = ValueRowProps & {
  column: DosageColumn;
  copy: ScheduledSessionCopyDto | null;
  cellId: string;
};

function ValueCell(props: Readonly<ValueCellProps>) {
  const { t } = useTranslation();
  const { column, copy } = props;
  const cell = props.cellOf(copy);
  const deload = column.kind === DosageColumnKind.COPY && column.deload;
  const tdClass = cn("relative px-cmv-sm py-cmv-xs align-middle", deload && "bg-cmv-bg-0");

  if (cell.kind === DosageCellKind.ABSENT) return <td className={cn(tdClass, HATCHED)} />;
  if (cell.kind === DosageCellKind.OFF) {
    return (
      <td className={cn(tdClass, HATCHED)}>
        <span className="text-cmv-caption text-cmv-text-lo italic">
          {t(OFF_LABEL[cell.reason])}
        </span>
      </td>
    );
  }
  return (
    <td className={tdClass}>
      {/* Une colonne COPY porte toujours sa copie : `cell` ne vaut une valeur qu'avec elle. */}
      {copy === null ? null : <ValueButton {...props} copy={copy} cell={cell} />}
    </td>
  );
}

type ValueButtonProps = ValueCellProps & {
  copy: ScheduledSessionCopyDto;
  cell: Extract<DosageCell, { kind: typeof DosageCellKind.VALUE }>;
};

/** La valeur d'une semaine, et sa fenêtre de saisie — fermée sur une semaine débriefée. */
function ValueButton(props: Readonly<ValueButtonProps>) {
  const { t, i18n } = useTranslation();
  const { column, copy, cell, cellId, target, open, setOpen, readOnly } = props;
  const customMetrics = frozenOf(props.rows, copy, target);
  const show = (values: readonly MetricValue[]) =>
    shownText(values, target, customMetrics, t, i18n.language);
  const locked = readOnly || (column.kind === DosageColumnKind.COPY && column.locked);
  const isOpen = open === cellId;

  return (
    <>
      <button
        type="button"
        disabled={locked}
        aria-expanded={isOpen}
        onClick={() => setOpen(isOpen ? null : cellId)}
        className={cn(
          "flex min-h-8 w-full items-center gap-cmv-xs rounded-cmv-sm border px-cmv-sm py-cmv-xs text-left font-cmv-mono text-cmv-caption",
          cell.adjusted
            ? "border-cmv-info-line bg-cmv-info-soft text-cmv-info-on"
            : "border-cmv-border bg-cmv-bg-0 text-cmv-text-hi",
          isOpen && "border-cmv-accent",
          !locked && "hover:border-cmv-accent",
        )}
      >
        {cell.adjusted ? <AdjustmentMarker level={AdjustmentLevel.SCHEDULED} /> : null}
        <span className="min-w-0 break-words">{show(cell.values)}</span>
      </button>
      {isOpen ? (
        <DosageCellEditor
          target={target}
          values={cell.values}
          reference={cell.adjusted ? cell.reference : null}
          referenceText={cell.reference == null ? null : show(cell.reference)}
          customMetrics={customMetrics}
          onChange={(values) => props.onChange(copy.id, target, values)}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

/** Les métriques maison que la ligne de CETTE semaine a figées : elles disent ce que vaut sa cellule. */
function frozenOf(
  rows: RowIndex,
  copy: ScheduledSessionCopyDto,
  target: DosageTarget,
): readonly CustomMetric[] {
  if (target.kind === "setting") return [];
  const exercise = copy.blocks[target.blockIndex]?.exercises.find(({ key }) => key === target.key);
  return (exercise && rows.byId.get(exercise.id)?.customMetrics) ?? [];
}

/** « 60 / 60 / 62,5 kg » : chaque série dans l'ordre, l'unité une fois à la fin. */
function shownText(
  values: readonly MetricValue[],
  target: DosageTarget,
  customMetrics: readonly CustomMetric[],
  t: (key: string) => string,
  locale: string,
): string {
  const series = shownSeries(values);
  if (target.kind === "setting") {
    return series.map((value) => settingText(value, target.field)).join(" / ");
  }
  const shown = series
    .map((value) => formatMetricValue(value, target.metric, customMetrics, locale))
    .join(" / ");
  const unit = series.some((value) => value != null)
    ? metricUnitLabel(target.metric, customMetrics, t)
    : null;
  return unit == null ? shown : `${shown} ${unit}`;
}

/** Des tours se comptent ; tout le reste d'un bloc est une durée. */
function settingText(value: MetricValue, field: SettingValue): string {
  if (typeof value !== "number") return "—";
  return field === SettingValue.ROUNDS ? String(value) : formatTrainingDuration(value);
}
