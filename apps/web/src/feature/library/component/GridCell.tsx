import {
  type BlockMetric,
  type CustomMetric,
  formatTrainingDuration,
  type MetricValue,
  MetricValueType,
  metricValueTypeOf,
  parseTrainingDuration,
} from "@cmv/shared";
import { type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/util/cn.util";

type GridCellProps = {
  metric: BlockMetric;
  customMetrics: readonly CustomMetric[];
  value: MetricValue;
  onChange: (value: MetricValue) => void;
  /** Entrée : valide, et crée la ligne suivante si on est sur la dernière. */
  onCommitLine: () => void;
};

const CELL_CLASS =
  "w-full rounded-cmv-sm border border-transparent bg-transparent px-cmv-sm py-cmv-xs text-cmv-body text-cmv-text-hi outline-none hover:border-cmv-border focus:border-cmv-accent focus:bg-cmv-surface";

/**
 * Une cellule de la grille. Le type de valeur décide de la saisie — un nombre, une durée, du
 * texte, ou un palier d'échelle — parce qu'une même case ne peut pas accepter « 12 » et « 6b »
 * avec les mêmes règles.
 *
 * Une cellule VIDE est légitime et fréquente : la dernière série n'a pas de repos, un étirement
 * n'a pas de charge. Elle vaut `null`, jamais `0` (règle dure n°5).
 */
export function GridCell(props: Readonly<GridCellProps>) {
  const valueType = metricValueTypeOf(props.metric, props.customMetrics);
  if (valueType === MetricValueType.SCALE) return <ScaleCell {...props} />;
  if (valueType === MetricValueType.DURATION) return <DurationCell {...props} />;
  if (valueType === MetricValueType.NUMBER) return <NumberCell {...props} />;
  return <TextCell {...props} />;
}

function onEnter(event: KeyboardEvent, commit: () => void) {
  if (event.key !== "Enter") return;
  // `preventDefault` : sans lui, Entrée soumettrait le formulaire porteur au lieu d'ajouter
  // une ligne.
  event.preventDefault();
  commit();
}

function NumberCell({ value, onChange, onCommitLine }: Readonly<GridCellProps>) {
  return (
    <input
      inputMode="decimal"
      value={value == null ? "" : String(value)}
      onChange={(event) => {
        const text = event.target.value.trim();
        if (text === "") return onChange(null);
        const parsed = Number(text.replace(",", "."));
        // Une saisie non numérique n'écrase pas la valeur : le champ la refuse, simplement.
        if (Number.isFinite(parsed)) onChange(parsed);
      }}
      onKeyDown={(event) => onEnter(event, onCommitLine)}
      className={CELL_CLASS}
    />
  );
}

function TextCell({ value, onChange, onCommitLine }: Readonly<GridCellProps>) {
  return (
    <input
      value={value == null ? "" : String(value)}
      onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
      onKeyDown={(event) => onEnter(event, onCommitLine)}
      className={CELL_CLASS}
    />
  );
}

/**
 * Durée : saisie tolérante (`150`, `2:30`, `2m30`), remise en forme à la sortie du champ. Le
 * texte reste local tant qu'on tape — propager à chaque frappe ferait remonter des durées
 * intermédiaires que personne n'a voulues.
 */
function DurationCell({ value, onChange, onCommitLine }: Readonly<GridCellProps>) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  const seconds = typeof value === "number" ? value : null;
  const shown = draft ?? formatTrainingDuration(seconds) ?? "";

  function commit() {
    if (draft == null) return;
    const text = draft.trim();
    if (text === "") {
      setInvalid(false);
      setDraft(null);
      return onChange(null);
    }
    const parsed = parseTrainingDuration(text);
    if (parsed == null) return setInvalid(true);
    setInvalid(false);
    setDraft(null);
    onChange(parsed);
  }

  return (
    <input
      value={shown}
      aria-invalid={invalid}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        onEnter(event, () => {
          commit();
          onCommitLine();
        });
      }}
      className={cn(CELL_CLASS, invalid && "border-cmv-error")}
    />
  );
}

function ScaleCell({ metric, customMetrics, value, onChange }: Readonly<GridCellProps>) {
  const { t } = useTranslation();
  const scale =
    metric.source === "CUSTOM"
      ? (customMetrics.find((custom) => custom.id === metric.customMetricId)?.scale ?? [])
      : [];

  return (
    <select
      value={value == null ? "" : String(value)}
      onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
      className={CELL_CLASS}
    >
      {/* L'option vide n'est pas un défaut : c'est le moyen de RETIRER une valeur posée. */}
      <option value="">{t("library.builder.grid.emptyValue")}</option>
      {scale.map((step) => (
        <option key={step} value={step}>
          {step}
        </option>
      ))}
    </select>
  );
}
