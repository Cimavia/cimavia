import {
  type CustomMetric,
  type MetricValue,
  SettingValue,
  STRUCTURE_MAX_ROUNDS,
  STRUCTURE_MIN_ROUNDS,
} from "@cmv/shared";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { GridCell } from "@/feature/library/component/GridCell";
import { DURATION_BOUNDS } from "@/feature/library/component/StructureSettingsForm";
import type { DosageTarget } from "@/feature/plan/component/DosageTable";
import { CmvButton, CmvCountField, CmvDurationField } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

/** Le nom de chaque valeur du bloc, en ligne de Dosage comme dans sa saisie. */
export const DOSAGE_SETTING_LABEL: Record<SettingValue, string> = {
  [SettingValue.ROUNDS]: "plan.dosage.setting.ROUNDS",
  [SettingValue.CAP]: "plan.dosage.setting.CAP",
  [SettingValue.EVERY]: "plan.dosage.setting.EVERY",
  [SettingValue.WORK]: "plan.dosage.setting.WORK",
  [SettingValue.REST]: "plan.dosage.setting.REST",
  [SettingValue.REST_BETWEEN_EXERCISES]: "plan.dosage.setting.REST_BETWEEN_EXERCISES",
  [SettingValue.REST_BETWEEN_ROUNDS]: "plan.dosage.setting.REST_BETWEEN_ROUNDS",
  [SettingValue.LIMIT]: "plan.dosage.setting.LIMIT",
};

type DosageCellEditorProps = {
  target: DosageTarget;
  /** Le nom de la ligne : celui d'une valeur du bloc nomme aussi son champ (« Séries », « Repos »). */
  label: string;
  /** Ouverte vers la gauche, depuis le bord droit de sa cellule : celle de la dernière semaine. */
  alignEnd: boolean;
  /** Une valeur par tour, série ou passage — une seule pour une valeur du bloc. */
  values: readonly MetricValue[];
  /** Les valeurs de la séance-type reçue, quand la cellule en diffère : la bulle les cite. */
  reference: readonly MetricValue[] | null;
  referenceText: string | null;
  customMetrics: readonly CustomMetric[];
  onChange: (values: readonly MetricValue[]) => void;
  onClose: () => void;
};

/**
 * La saisie d'une cellule de Dosage (#721) : un champ par série, « Même valeur partout », et ce
 * que la séance-type avait donné, avec de quoi y revenir. Chaque saisie part dans le brouillon de
 * la page ; « Enregistrer » les envoie toutes.
 */
export function DosageCellEditor(props: Readonly<DosageCellEditorProps>) {
  const { t } = useTranslation();
  const { reference, referenceText, onChange, onClose, alignEnd } = props;
  const dialog = useRef<HTMLDivElement>(null);
  const latestClose = useRef(onClose);
  latestClose.current = onClose;

  // Un clic ailleurs referme, comme un menu. Au clic et non à l'appui : la sortie du champ a déjà
  // validé sa saisie. Où il a COMMENCÉ se lit à l'appui — « Revenir à la séance-type » disparaît
  // dès son clic, et ne serait plus dans la cellule quand le document le reçoit. Sa propre cellule
  // n'en est pas un : son bouton referme déjà, et le compter la rouvrirait aussitôt.
  useEffect(() => {
    let pressedOutside = false;
    function onPress(event: MouseEvent) {
      const cell = dialog.current?.parentElement;
      pressedOutside = cell != null && event.target instanceof Node && !cell.contains(event.target);
    }
    function onClick() {
      if (pressedOutside) latestClose.current();
      pressedOutside = false;
    }
    document.addEventListener("mousedown", onPress, true);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("mousedown", onPress, true);
      document.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-label={t("plan.dosage.editCell")}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className={cn(
        "absolute top-full z-10 flex w-64 flex-col gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-surface-hi p-cmv-md shadow-lg",
        alignEnd ? "right-0" : "left-0",
      )}
    >
      <Fields {...props} />
      {reference == null ? null : (
        <div className="flex flex-col gap-cmv-xs border-cmv-border border-t pt-cmv-sm">
          <span className="font-cmv-mono text-cmv-caption text-cmv-text-mid">
            {t("plan.dosage.sessionTypeValue", { value: referenceText })}
          </span>
          <CmvButton variant="ghost" onClick={() => onChange(reference)}>
            {t("plan.composition.backToSessionType")}
          </CmvButton>
        </div>
      )}
      <div className="flex justify-end">
        <CmvButton variant="ghost" onClick={onClose}>
          {t("common.close")}
        </CmvButton>
      </div>
    </div>
  );
}

function Fields({
  target,
  label,
  values,
  customMetrics,
  onChange,
}: Readonly<DosageCellEditorProps>) {
  const { t } = useTranslation();
  const at = (index: number, value: MetricValue) =>
    onChange(values.map((each, rank) => (rank === index ? value : each)));

  if (target.kind === "setting") {
    const [value] = values;
    // Une valeur exigée du bloc est toujours là ; sans elle, rien à saisir (règle 5).
    if (typeof value !== "number") {
      return (
        <span className="text-cmv-caption text-cmv-text-mid">
          {t("plan.dosage.missing", { label })}
        </span>
      );
    }
    if (target.field === SettingValue.ROUNDS) {
      return (
        <CmvCountField
          label={label}
          value={value}
          min={STRUCTURE_MIN_ROUNDS}
          max={STRUCTURE_MAX_ROUNDS}
          onChange={(count) => onChange([count])}
        />
      );
    }
    return (
      <CmvDurationField
        label={label}
        value={value}
        bounds={DURATION_BOUNDS}
        nullable={false}
        onChange={(seconds) => {
          // Exigée (`nullable={false}`), la durée n'arrive jamais vide.
          if (seconds != null) onChange([seconds]);
        }}
      />
    );
  }

  return (
    <>
      {values.map((value, index) => {
        const series = t("plan.dosage.series", { number: index + 1 });
        return (
          // Une série n'a que son rang, qui ne bouge pas tant que la fenêtre est ouverte.
          <fieldset key={series} className="flex items-center gap-cmv-sm">
            <legend className="float-left w-16 shrink-0 text-cmv-caption text-cmv-text-mid">
              {series}
            </legend>
            <GridCell
              metric={target.metric}
              customMetrics={customMetrics}
              value={value}
              onChange={(next) => at(index, next)}
              onCommitLine={() => undefined}
              framed
            />
          </fieldset>
        );
      })}
      {values.length > 1 ? (
        <CmvButton variant="ghost" onClick={() => onChange(values.map(() => values[0] ?? null))}>
          {t("plan.dosage.sameEverywhere")}
        </CmvButton>
      ) : null}
    </>
  );
}
