import {
  DosageCellKind,
  type DosageProgression,
  dosageColumnKey,
  dosageProgression,
  type MetricValue,
  ProgressionCellKind,
  ProgressionDirection,
  type ProgressionMeasure,
  ProgressionMeasureKind,
  type ProgressionSlot,
  parseDecimal,
  parseTrainingDuration,
} from "@cmv/shared";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CmvButton, CmvSegmented } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

type DosageProgressionRowProps = {
  slots: readonly ProgressionSlot[];
  /**
   * La semaine d'où part la ligne (`progressionStart`). Le menu ne s'ouvre que sur une ligne qui en
   * a une ; une saisie dans la ligne peut la lui retirer.
   */
  start: DosageProgression["start"] | null;
  measure: ProgressionMeasure;
  /** Le nom de chaque colonne : « S2 », ou « S2 · lun. » posée deux fois la même semaine. */
  names: readonly string[];
  /** Ce qui suit le pas : l'unité de la colonne, ou « paliers » sur une échelle. */
  unit: string | null;
  show: (values: readonly MetricValue[]) => string;
  /** Les classes d'une cellule hachurée, celles du tableau. */
  hatched: string;
  onApply: (changes: { index: number; values: MetricValue[] }[]) => void;
  onClose: () => void;
};

/**
 * « Progression… » (#724, maquette `coach_planification_blocs` frame 3 bis) : un pas, et sous
 * chaque semaine ce qu'elle deviendrait. « Appliquer » écrit le brouillon ; le pas, lui, n'est
 * enregistré nulle part.
 */
export function DosageProgressionRow(props: Readonly<DosageProgressionRowProps>) {
  const { t } = useTranslation();
  const { slots, start, measure, names, unit, show, hatched, onApply, onClose } = props;
  const stepId = useId();
  const stepRef = useRef<HTMLInputElement>(null);
  // Le pas est la raison d'ouvrir la fenêtre : la saisie y commence.
  useEffect(() => stepRef.current?.focus(), []);
  const [direction, setDirection] = useState<ProgressionDirection>(ProgressionDirection.ADD);
  const [text, setText] = useState("");
  const amount = readAmount(text, measure);
  const progression =
    amount === null ? null : dosageProgression(slots, measure, { direction, amount });
  // Sans départ, rien ne s'applique — mais ce n'est pas le pas qui est en cause.
  const isInvalid = start !== null && text.trim() !== "" && progression === null;

  return (
    <tr
      className="border-cmv-accent border-y bg-cmv-surface"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <td className="px-cmv-md py-cmv-sm align-top">
        <div className="flex flex-col gap-cmv-sm">
          <CmvSegmented
            label={t("plan.dosage.progression.direction")}
            value={direction}
            onChange={setDirection}
            options={[
              { value: ProgressionDirection.ADD, label: t("plan.dosage.progression.add") },
              { value: ProgressionDirection.REMOVE, label: t("plan.dosage.progression.remove") },
            ]}
          />
          <div className="flex items-center gap-cmv-sm">
            <label htmlFor={stepId} className="text-cmv-caption text-cmv-text-mid">
              {t("plan.dosage.progression.step")}
            </label>
            <input
              id={stepId}
              ref={stepRef}
              value={text}
              inputMode={measure.kind === ProgressionMeasureKind.DURATION ? "text" : "decimal"}
              placeholder={t(placeholderOf(measure))}
              aria-invalid={isInvalid}
              onChange={(event) => setText(event.target.value)}
              className="w-20 rounded-cmv-sm border border-cmv-border bg-cmv-bg-1 px-cmv-sm py-cmv-xs text-cmv-body text-cmv-text-hi outline-none focus:border-cmv-accent"
            />
            {unit == null ? null : (
              <span className="text-cmv-caption text-cmv-text-mid">{unit}</span>
            )}
          </div>
          {isInvalid ? (
            <span className="text-cmv-caption text-cmv-error-on">
              {t("plan.dosage.progression.invalidStep")}
            </span>
          ) : null}
          {start === null ? null : (
            <span className="text-cmv-caption text-cmv-text-lo">
              {t("plan.dosage.progression.from", {
                week: names[start.index],
                value: show(start.values),
              })}
            </span>
          )}
          {progression === null || progression.overwritten.length === 0 ? null : (
            <span className="text-cmv-caption text-cmv-warning-on">
              {t("plan.dosage.progression.overwrites", {
                count: progression.overwritten.length,
                weeks: progression.overwritten.map((index) => names[index]).join(", "),
              })}
            </span>
          )}
          <div className="flex gap-cmv-sm">
            <CmvButton
              variant="primary"
              disabled={progression === null}
              onClick={() => {
                if (progression === null) return;
                onApply(steppedOf(progression));
                onClose();
              }}
            >
              {t("plan.dosage.progression.apply")}
            </CmvButton>
            <CmvButton variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </CmvButton>
          </div>
        </div>
      </td>
      {slots.map((slot, index) => (
        <PreviewCell
          key={dosageColumnKey(slot.column)}
          slot={slot}
          cell={progression?.cells[index] ?? null}
          show={show}
          hatched={hatched}
        />
      ))}
    </tr>
  );
}

/** Un pas qu'on tape souvent : « 2,5 » kg, « 15 s », et un entier pour des tours ou des paliers. */
function placeholderOf(measure: ProgressionMeasure): string {
  if (measure.kind === ProgressionMeasureKind.DURATION) {
    return "plan.dosage.progression.placeholder.duration";
  }
  return measure.kind === ProgressionMeasureKind.NUMBER && !measure.integer
    ? "plan.dosage.progression.placeholder.decimal"
    : "plan.dosage.progression.placeholder.count";
}

/** Le pas tapé : des secondes pour une durée (« 15 s », « 1:30 »), sinon un nombre. */
function readAmount(text: string, measure: ProgressionMeasure): number | null {
  return measure.kind === ProgressionMeasureKind.DURATION
    ? parseTrainingDuration(text)
    : parseDecimal(text);
}

const steppedOf = (progression: DosageProgression) =>
  progression.cells.flatMap((cell, index) =>
    cell.kind === ProgressionCellKind.STEPPED ? [{ index, values: cell.values }] : [],
  );

type PreviewCellProps = Pick<DosageProgressionRowProps, "show" | "hatched"> & {
  slot: ProgressionSlot;
  /** Ce que deviendrait la semaine ; `null` tant que le pas ne sert pas — la valeur d'aujourd'hui. */
  cell: DosageProgression["cells"][number] | null;
};

/** Ce qu'une semaine deviendrait, sous sa colonne. */
function PreviewCell({ slot, cell, show, hatched }: Readonly<PreviewCellProps>) {
  const { t } = useTranslation();
  const tdClass = "px-cmv-sm py-cmv-sm align-top font-cmv-mono text-cmv-caption";
  // Une semaine sautée par la progression est celle qui n'a pas de valeur.
  if (slot.cell.kind !== DosageCellKind.VALUE) {
    return (
      <td className={cn(tdClass, hatched)}>
        <span className="font-cmv-sans text-cmv-text-lo italic">
          {t("plan.dosage.progression.skipped")}
        </span>
      </td>
    );
  }
  const values = cell !== null && "values" in cell ? cell.values : slot.cell.values;
  const note = cell === null ? null : NOTE[cell.kind];
  return (
    <td className={cn(tdClass, slot.column.deload && "bg-cmv-bg-0")}>
      <span
        className={cn(
          "block break-words",
          cell?.kind === ProgressionCellKind.STEPPED ? "text-cmv-text-hi" : "text-cmv-text-mid",
        )}
      >
        {show(values)}
      </span>
      {note == null ? null : (
        <span className="block font-cmv-sans text-cmv-text-lo italic">{t(note)}</span>
      )}
    </td>
  );
}

const NOTE: Partial<Record<ProgressionCellKind, string>> = {
  [ProgressionCellKind.START]: "plan.dosage.progression.start",
  [ProgressionCellKind.DELOAD]: "plan.dosage.progression.unchanged",
  [ProgressionCellKind.DEBRIEFED]: "plan.dosage.progression.debriefed",
};
