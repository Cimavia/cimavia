import {
  METRIC_CATALOG,
  METRIC_UNIT_LABEL_KEY,
  type MetricKey,
  type MetricUnit,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/util/cn.util";

type UnitChoiceProps = {
  metric: { readonly key: MetricKey; readonly unit: MetricUnit };
  label: string;
  /** Le libellé reste lu par un lecteur d'écran, sans s'afficher : la ligne nomme déjà la métrique. */
  hideLabel?: boolean;
  onChange: (unit: MetricUnit) => void;
};

/**
 * L'unité d'une métrique du catalogue, parmi celles qu'elle admet : celle d'une colonne de grille,
 * ou celle qu'un exercice suggère (#718). Rien quand elle n'en admet qu'une.
 */
export function UnitChoice({
  metric,
  label,
  hideLabel = false,
  onChange,
}: Readonly<UnitChoiceProps>) {
  const { t } = useTranslation();
  const units = METRIC_CATALOG[metric.key].units;
  // Une seule unité admise = aucun choix à offrir. Un select à une option est du bruit.
  if (units.length < 2) return null;

  return (
    <label className="flex flex-col gap-cmv-xs">
      <span className={cn("text-cmv-caption text-cmv-text-mid", hideLabel && "sr-only")}>
        {label}
      </span>
      <select
        value={metric.unit}
        onChange={(event) => onChange(event.target.value as MetricUnit)}
        className="rounded-cmv-sm border border-cmv-border bg-cmv-bg-1 px-cmv-sm py-cmv-xs text-cmv-body text-cmv-text-hi outline-none focus:border-cmv-accent"
      >
        {units.map((unit) => (
          <option key={unit} value={unit}>
            {t(METRIC_UNIT_LABEL_KEY[unit])}
          </option>
        ))}
      </select>
    </label>
  );
}
