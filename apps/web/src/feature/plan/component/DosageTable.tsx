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
  type Phrase,
  type ScheduledSessionBlockDto,
  type ScheduledSessionCopyDto,
  SettingValue,
  sameJson,
  settingsPhrase,
  shownSeries,
} from "@cmv/shared";
import type { TFunction } from "i18next";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdjustmentMarker } from "@/feature/library/component/AdjustmentMarker";
import { BlockMark } from "@/feature/library/component/BlockMark";
import { DOSAGE_SETTING_LABEL, DosageCellEditor } from "@/feature/plan/component/DosageCellEditor";
import { CmvMenu } from "@/shared/component";
import { usePhraseText } from "@/shared/hook/usePhraseText";
import { cn } from "@/shared/util/cn.util";
import { formatDayLabel } from "@/shared/util/date.util";

/** Le plancher d'une semaine : partagées à parts égales au-delà, elle s'élargit si une valeur l'exige. */
const COLUMN_MIN = "min-w-28";

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
  const byId = useMemo(() => new Map(copies.map((copy) => [copy.id, copy])), [copies]);
  const copyOf = useCallback(
    (column: DosageColumn) =>
      column.kind === DosageColumnKind.COPY ? (byId.get(column.copyId) ?? null) : null,
    [byId],
  );
  // Ne referme que la cellule qui le demande : un clic sur une autre vient de l'ouvrir.
  const close = useCallback(
    (cellId: string) => setOpen((current) => (current === cellId ? null : current)),
    [],
  );
  // Numérotés comme la séance les montre : un bloc sans valeur, absent d'ici, garde son rang.
  const longest = copies.reduce<ScheduledSessionCopyDto | null>(
    (kept, copy) => (kept == null || copy.blocks.length > kept.blocks.length ? copy : kept),
    null,
  );
  const numbers = blockNumbers(longest?.blocks ?? []);

  const rowProps = { ...props, rows, copyOf, open, setOpen, close };
  return (
    // Le cadre prend toute la page, et le tableau y défile : la fenêtre d'une cellule y a la place
    // de s'ouvrir, et les semaines restent en vue.
    <div className="min-h-0 flex-1 overflow-auto rounded-cmv-md border border-cmv-border bg-cmv-bg-1">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-20">
          <tr className="border-cmv-border border-b bg-cmv-surface">
            <th
              scope="col"
              className="w-56 min-w-44 px-cmv-md py-cmv-sm text-left text-cmv-caption text-cmv-text-lo uppercase"
            >
              {t("plan.dosage.value")}
            </th>
            {columns.map((column) => (
              <ColumnHead
                key={column.kind === DosageColumnKind.COPY ? column.copyId : column.weekNumber}
                column={column}
                copy={copyOf(column)}
                width={`${100 / columns.length}%`}
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
  /** La part de la semaine dans la largeur : toutes la même, plancher `COLUMN_MIN`. */
  width: string;
};

/** « S2 », son jour, ses valeurs ajustées ; et son menu : revenir à la séance-type, composer. */
function ColumnHead({ column, copy, width, readOnly, onRevertCopy, onCompose }: ColumnHeadProps) {
  const { t } = useTranslation();
  const week = t("plan.composition.week", { number: column.weekNumber });
  if (column.kind === DosageColumnKind.ABSENT || copy === null) {
    return (
      <th scope="col" style={{ width }} className={cn("px-cmv-md py-cmv-sm text-left", HATCHED)}>
        <span className={cn("block text-cmv-body text-cmv-text-lo", COLUMN_MIN)}>{week}</span>
        <span className="block text-cmv-caption text-cmv-text-lo">
          {t("plan.dosage.notPlaced")}
        </span>
      </th>
    );
  }
  const count = dosageAdjustedCount(copy);
  // Posée deux fois la même semaine, la séance a deux colonnes : son jour les distingue.
  const name = column.showDay
    ? t("plan.dosage.weekOnDay", { week, day: formatDayLabel(column.date) })
    : week;
  return (
    <th
      scope="col"
      style={{ width }}
      className={cn("px-cmv-md py-cmv-sm text-left align-top", column.deload && "bg-cmv-bg-0")}
    >
      <div className={cn("flex items-start gap-cmv-xs", COLUMN_MIN)}>
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
  close: (cell: string) => void;
};

/** Un bloc : son en-tête, ses valeurs, puis chaque métrique de chacun de ses exercices. */
function GroupRows({
  group,
  number,
  ...props
}: RowProps & { group: DosageGroup<ScheduledSessionBlockDto>; number: string | null }) {
  const { t } = useTranslation();
  const text = usePhraseText();
  const { block, blockIndex, received } = group;
  const { columns, copyOf, rows } = props;
  // Un mot pour tout le bloc, dans ses lignes comme dans chaque phrase. Dosage ne change pas la
  // composition : il ne bouge pas sous la saisie.
  const sets = isSets(group, props.copies);
  // Relues à chaque frappe du brouillon sinon : une phrase par semaine et par bloc.
  const phrases = useMemo(
    () => blockPhrases(group, columns, copyOf, rows, text, sets),
    [group, columns, copyOf, rows, text, sets],
  );
  const codes = exerciseCodes(number, received.length);

  return (
    <tbody>
      <tr className="border-cmv-border border-t">
        <th
          colSpan={phrases.perWeek == null ? props.columns.length + 1 : 1}
          scope="colgroup"
          className="px-cmv-md pt-cmv-md pb-cmv-xs text-left"
        >
          <span className="flex flex-wrap items-center gap-cmv-sm">
            {number == null ? (
              <span className="text-cmv-subtitle text-cmv-text-hi">{block.label}</span>
            ) : (
              <BlockMark mark={number} kind="block" />
            )}
            <span className="rounded-cmv-pill border border-cmv-border border-dashed px-cmv-sm text-cmv-caption text-cmv-text-mid">
              {block.name}
            </span>
            {phrases.received == null ? null : (
              <span className="text-cmv-caption text-cmv-text-lo">{phrases.received}</span>
            )}
          </span>
        </th>
        {phrases.perWeek?.map(({ key, phrase, absent }) => (
          <td
            key={key}
            className={cn(
              "px-cmv-sm pt-cmv-md pb-cmv-xs align-bottom text-cmv-caption text-cmv-text-mid",
              absent && HATCHED,
            )}
          >
            {phrase}
          </td>
        ))}
      </tr>
      {group.settings.map((field) => (
        <ValueRow
          key={field}
          {...props}
          id={`${blockIndex}:${field}`}
          name={t(settingLabel(field, sets))}
          note={roundsNote(field, sets, t)}
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
            name={titleOf(rows, line.rowId)}
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

/** Le nom d'une valeur du bloc : ses tours, et le repos entre eux, sont des séries pour un exercice seul. */
function settingLabel(field: SettingValue, sets: boolean): string {
  if (sets && field === SettingValue.ROUNDS) return "plan.dosage.setting.SETS";
  if (sets && field === SettingValue.REST_BETWEEN_ROUNDS) {
    return "plan.dosage.setting.REST_BETWEEN_SETS";
  }
  return DOSAGE_SETTING_LABEL[field];
}

/** Sous les tours, combien de lignes ils donnent : des séries pour un exercice seul. */
function roundsNote(field: SettingValue, sets: boolean, t: TFunction): string | null {
  if (field !== SettingValue.ROUNDS) return null;
  return t(sets ? "plan.dosage.setsNote" : "plan.dosage.roundsNote");
}

type BlockPhrases = {
  /** Ce que dit la séance-type reçue — seule, tant qu'aucune semaine n'en change le sens. */
  received: string | null;
  /** Une phrase par colonne, dès qu'une semaine se lit autrement ; vide où le bloc n'est pas. */
  perWeek: { key: string; phrase: string | null; absent: boolean }[] | null;
};

/**
 * La phrase du bloc. Celle de la séance-type tant que chaque semaine la dit encore ; une par
 * semaine, sur SES valeurs, dès que l'une a bougé — « 5 séries » en S1, « 10 séries » en S2 —
 * plutôt qu'une phrase que plus aucune semaine ne fait.
 */
function blockPhrases(
  group: DosageGroup<ScheduledSessionBlockDto>,
  columns: readonly DosageColumn[],
  copyOf: (column: DosageColumn) => ScheduledSessionCopyDto | null,
  rows: RowIndex,
  text: (phrases: readonly Phrase[]) => string,
  sets: boolean,
): BlockPhrases {
  const { reference, blockIndex } = group;
  // Un exercice retiré de toutes les semaines n'a plus de ligne, donc plus de titre.
  const names = reference.exercises.map(({ key }) => {
    const line = group.exercises.find((each) => each.key === key);
    return line == null ? "—" : titleOf(rows, line.rowId);
  });
  const said = settingsPhrase(reference.settings, reference.exercises.length, names, sets);
  const weeks = columns.map((column) => ({
    key: columnKey(column),
    absent: column.kind === DosageColumnKind.ABSENT,
    said: weekPhrase(copyOf(column)?.blocks[blockIndex], rows, sets),
  }));
  // Comparées avant d'être mises en mots : « 5 séries » et « 4 séries » ne diffèrent que d'un nombre.
  const moved = weeks.some((week) => week.said !== null && !sameJson(week.said, said));
  if (!moved) return { received: said == null ? null : text(said), perWeek: null };
  return {
    received: null,
    perWeek: weeks.map((week) => ({
      key: week.key,
      absent: week.absent,
      phrase: week.said == null ? null : text(week.said),
    })),
  };
}

/** Ce que dit le bloc d'une semaine, sur ses valeurs et ses exercices ; rien où il n'est pas. */
function weekPhrase(
  block: ScheduledSessionBlockDto | undefined,
  rows: RowIndex,
  sets: boolean,
): Phrase[] | null {
  if (block == null) return null;
  const names = block.exercises.map((exercise) => titleOf(rows, exercise.id));
  return settingsPhrase(block.settings, block.exercises.length, names, sets);
}

/**
 * « Séries » si le bloc n'a qu'un exercice partout, dans la séance-type comme dans chaque semaine ;
 * « tours » dès que l'une le fait à plusieurs — même là où il est resté seul.
 */
function isSets(
  group: DosageGroup<ScheduledSessionBlockDto>,
  copies: readonly ScheduledSessionCopyDto[],
): boolean {
  if (group.reference.exercises.length !== 1) return false;
  return copies.every((copy) => (copy.blocks[group.blockIndex]?.exercises.length ?? 1) === 1);
}

const columnKey = (column: DosageColumn) =>
  column.kind === DosageColumnKind.COPY ? column.copyId : String(column.weekNumber);

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

function titleOf(rows: RowIndex, rowId: string): string {
  return rows.byId.get(rowId)?.title ?? "—";
}

type RowIndex = {
  byId: ReadonlyMap<string, ScheduledSessionCopyDto["exercises"][number]>;
  /** Les métriques maison figées des lignes d'un exercice : elles disent ce que valent ses colonnes. */
  metricsOf: (key: string) => readonly CustomMetric[];
};

/** Les lignes de toutes les copies, lues une fois par rendu et non à chaque cellule. */
function rowIndex(copies: readonly ScheduledSessionCopyDto[]): RowIndex {
  const byId = new Map(copies.flatMap((copy) => copy.exercises.map((row) => [row.id, row])));
  // Chaque copie fige les mêmes définitions : une par identifiant suffit.
  const byKey = new Map<string, Map<string, CustomMetric>>();
  for (const exercise of copies.flatMap((copy) =>
    copy.blocks.flatMap((block) => block.exercises),
  )) {
    const metrics = byKey.get(exercise.key) ?? new Map<string, CustomMetric>();
    for (const metric of byId.get(exercise.id)?.customMetrics ?? []) {
      if (!metrics.has(metric.id)) metrics.set(metric.id, metric);
    }
    byKey.set(exercise.key, metrics);
  }
  return { byId, metricsOf: (key) => [...(byKey.get(key)?.values() ?? [])] };
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
        {columns.map((column, index) => (
          <ValueCell
            key={column.kind === DosageColumnKind.COPY ? column.copyId : column.weekNumber}
            {...props}
            // La fenêtre de la dernière semaine s'ouvre vers la gauche : le tableau s'arrête là.
            alignEnd={columns.length > 1 && index === columns.length - 1}
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
  alignEnd: boolean;
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
          "flex min-h-8 items-center gap-cmv-xs rounded-cmv-sm border px-cmv-sm py-cmv-xs text-left font-cmv-mono text-cmv-caption",
          "w-full",
          COLUMN_MIN,
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
          label={props.name}
          values={cell.values}
          reference={cell.adjusted ? cell.reference : null}
          referenceText={cell.reference == null ? null : show(cell.reference)}
          customMetrics={customMetrics}
          onChange={(values) => props.onChange(copy.id, target, values)}
          alignEnd={props.alignEnd}
          onClose={() => props.close(cellId)}
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
