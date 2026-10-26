import {
  type CustomMetric,
  metricLabel,
  type SuggestedMetric,
  suggestedMetricIdentity,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MetricPicker } from "@/feature/library/component/MetricPicker";
import { CMV_EDIT, CmvButton } from "@/shared/component";

type SuggestedMetricsSectionProps = {
  metrics: readonly SuggestedMetric[];
  /** Où se nomment les métriques : le catalogue, et les définitions que l'exercice embarque. */
  customMetrics: readonly CustomMetric[];
  /**
   * Ce qui se CHOISIT : le catalogue vivant seul. Une définition embarquée a pu le quitter —
   * supprimée, elle se nomme encore, mais choisie, l'enregistrement la refuserait.
   */
  pickable: readonly CustomMetric[] | null;
  /** Le Coach à qui appartient le catalogue, quand ce n'est pas l'acteur (#606). */
  catalogOwner?: string | null;
  onChange: (metrics: SuggestedMetric[]) => void;
};

/**
 * Les métriques que l'exercice suggère (#718), dans l'ordre des colonnes qu'elles préremplissent
 * quand il entre dans un bloc de séance. Sans valeur : l'exercice ne porte plus de dosage, la
 * séance le dose. Aucune n'est un état valide.
 */
export function SuggestedMetricsSection({
  metrics,
  customMetrics,
  pickable,
  catalogOwner = null,
  onChange,
}: Readonly<SuggestedMetricsSectionProps>) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);

  return (
    <section className="flex flex-col gap-cmv-sm">
      <span className="text-cmv-caption text-cmv-text-mid">
        {t("library.builder.suggested.title")}
      </span>
      <p className="text-cmv-caption text-cmv-text-lo">{t("library.builder.suggested.hint")}</p>

      {metrics.length === 0 ? (
        <p className="text-cmv-body text-cmv-text-lo">{t("library.builder.suggested.none")}</p>
      ) : (
        <ol className="flex flex-col gap-cmv-xs">
          {metrics.map((metric, index) => (
            <li
              key={suggestedMetricIdentity(metric)}
              className="flex items-baseline gap-cmv-sm text-cmv-body text-cmv-text-hi"
            >
              <span className="text-cmv-caption text-cmv-text-lo">{index + 1}</span>
              {metricLabel(metric, customMetrics, t)}
            </li>
          ))}
        </ol>
      )}

      <div className={CMV_EDIT.only}>
        <CmvButton variant="secondary" onClick={() => setPicking(true)}>
          {t("library.builder.metrics.edit")}
        </CmvButton>
      </div>

      <MetricPicker
        open={picking}
        metrics={metrics}
        create={(metric) => metric}
        customMetrics={customMetrics}
        pickable={pickable}
        catalogOwner={catalogOwner}
        onChange={onChange}
        onClose={() => setPicking(false)}
      />
    </section>
  );
}
