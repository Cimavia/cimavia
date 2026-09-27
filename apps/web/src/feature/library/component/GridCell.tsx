import {
  type BlockMetric,
  type CustomMetric,
  formatDecimal,
  formatTrainingDuration,
  type MetricValue,
  MetricValueType,
  metricValueTypeOf,
  parseDecimal,
  parseTrainingDuration,
  scaleFor,
} from "@cmv/shared";
import { type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/util/cn.util";

type GridCellProps = {
  metric: BlockMetric;
  customMetrics: readonly CustomMetric[];
  value: MetricValue;
  onChange: (value: MetricValue) => void;
  /**
   * Entrée : valide, et crée la ligne suivante si on est sur la dernière.
   *
   * Reçoit la valeur VALIDÉE (#299) : la ligne créée doit la contenir, or l'état du parent ne l'a
   * pas encore — l'écriture de la cellule et l'ajout de la ligne partent dans le même rendu, et un
   * ajout calculé sur l'ancien état effaçait ce qu'on venait de taper.
   */
  onCommitLine: (value: MetricValue) => void;
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

/**
 * Nombre : « 12,5 » comme « 12.5 », remis en forme dans la langue du lecteur à la sortie du champ.
 *
 * Le texte reste LOCAL tant qu'on tape (#298). Contrôlé par la valeur numérique, le champ se
 * réécrivait à chaque frappe : « 12, » devenait 12, la virgule disparaissait avant le « 5 », et
 * « 12,5 » kg arrivait à 125 kg sans un signal.
 */
function NumberCell(props: Readonly<GridCellProps>) {
  const { i18n } = useTranslation();
  return (
    <DraftCell
      {...props}
      inputMode="decimal"
      parse={parseDecimal}
      format={(value) => formatDecimal(value, i18n.language)}
    />
  );
}

function TextCell({ value, onChange, onCommitLine }: Readonly<GridCellProps>) {
  return (
    <input
      value={value == null ? "" : String(value)}
      onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
      onKeyDown={(event) => onEnter(event, () => onCommitLine(value))}
      className={CELL_CLASS}
    />
  );
}

/**
 * Durée : saisie tolérante (`150`, `2:30`, `2m30`), remise en forme à la sortie du champ. Propager
 * à chaque frappe ferait remonter des durées intermédiaires que personne n'a voulues.
 */
function DurationCell(props: Readonly<GridCellProps>) {
  return <DraftCell {...props} parse={parseTrainingDuration} format={formatTrainingDuration} />;
}

type DraftCellProps = GridCellProps & {
  /** Le texte tapé → une valeur, ou `null` s'il n'en est pas une. */
  parse: (text: string) => number | null;
  format: (value: number) => string | null;
  inputMode?: "decimal";
};

/**
 * Une cellule dont le texte reste LOCAL tant qu'on tape, et n'est lu qu'à la validation — sortie
 * du champ ou Entrée. Une saisie illisible n'écrase rien : le champ la garde, se signale, et la
 * valeur enregistrée reste celle d'avant.
 *
 * Un champ VIDÉ vaut `null`, jamais `0` (règle dure n°5).
 */
function DraftCell({
  value,
  onChange,
  onCommitLine,
  parse,
  format,
  inputMode,
}: Readonly<DraftCellProps>) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  const shown = draft ?? (typeof value === "number" ? (format(value) ?? "") : "");

  /** La valeur retenue, ou `undefined` quand la saisie est refusée. */
  function commit(): MetricValue | undefined {
    if (draft == null) return value;
    const text = draft.trim();
    const parsed = text === "" ? null : parse(text);
    if (text !== "" && parsed == null) {
      setInvalid(true);
      return undefined;
    }
    setInvalid(false);
    setDraft(null);
    // Retaper la valeur déjà enregistrée n'est pas une modification : côté séance, elle poserait
    // un marqueur d'ajustement sur une cellule qui n'a pas bougé.
    if (parsed !== value) onChange(parsed);
    return parsed;
  }

  return (
    <input
      value={shown}
      inputMode={inputMode}
      aria-invalid={invalid}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        onEnter(event, () => {
          const committed = commit();
          // Une saisie refusée ne crée pas de ligne : l'erreur reste sous les yeux du coach.
          if (committed !== undefined) onCommitLine(committed);
        });
      }}
      className={cn(CELL_CLASS, invalid && "border-cmv-error")}
    />
  );
}

function ScaleCell({ metric, customMetrics, value, onChange }: Readonly<GridCellProps>) {
  const { t } = useTranslation();
  const scale = scaleFor(metric, customMetrics) ?? [];

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
