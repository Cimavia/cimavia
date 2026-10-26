import {
  BLOCK_MAX_METRICS,
  type CustomMetric,
  defaultUnitOf,
  METRIC_LABEL_KEY,
  type MetricKey,
  MetricSource,
  metricLabel,
  type SuggestedMetric,
  suggestedMetricIdentity,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IoPencil, IoTrashOutline } from "react-icons/io5";
import { CustomMetricForm } from "@/feature/library/component/CustomMetricForm";
import { useDeleteCustomMetric } from "@/feature/library/hook/useCustomMetrics";
import { catalogByFamily, metricHint } from "@/feature/library/util/metric-catalog.util";
import {
  CmvButton,
  CmvCheckmark,
  CmvConfirmButton,
  CmvDragHandle,
  CmvPanel,
} from "@/shared/component";
import { useReorderDrag } from "@/shared/hook/useReorderDrag";
import { cn } from "@/shared/util/cn.util";

// i18n-values exercise.metric: MetricKey
// i18n-values library.builder.family: MetricFamily

/**
 * Une métrique retenue : celle d'une colonne de bloc, ou celle qu'un exercice suggère. Une colonne
 * porte son `id` : un bloc peut citer deux fois la même métrique, quand une copie en a fusionné
 * deux (`remapCustomMetrics`). Une métrique suggérée n'en a pas, et n'a jamais de doublon.
 */
type PickedMetric = SuggestedMetric & { readonly id?: string; readonly label?: string | null };

type MetricPickerProps<M extends PickedMetric> = {
  open: boolean;
  /** Les métriques retenues, dans l'ordre : celui des colonnes qu'elles donneront. */
  metrics: readonly M[];
  /**
   * Combien doivent rester : un bloc garde au moins une colonne, un exercice peut n'en suggérer
   * aucune.
   */
  minMetrics?: number;
  /** La métrique choisie, sous la forme de la liste (une colonne de bloc lui donne un id). */
  create: (metric: SuggestedMetric) => M;
  /**
   * Où se nomment les colonnes déjà posées : le catalogue, et les définitions que l'exercice
   * embarque (#605) — dont une a pu quitter le catalogue depuis.
   */
  customMetrics: readonly CustomMetric[];
  /** Ce qui se POSE en colonne : le catalogue vivant. `null` tant qu'il ne se lit pas. */
  pickable: readonly CustomMetric[] | null;
  /** Le propriétaire du catalogue s'il n'est pas l'acteur : on y choisit, on n'y crée rien. */
  catalogOwner?: string | null;
  onChange: (metrics: M[]) => void;
  onClose: () => void;
};

const FAMILIES = catalogByFamily();

/**
 * Le choix des métriques d'un bloc ou d'un exercice (#718). L'ordre de la liste retenue EST l'ordre
 * des colonnes — d'où la poignée de réordonnancement plutôt qu'un simple jeu de cases à cocher.
 *
 * Une ligne du catalogue est une bascule, sur l'identité de sa métrique (`suggestedMetricIdentity`).
 * Une colonne retenue se retire, elle, par sa position : deux colonnes d'un bloc peuvent citer la
 * même métrique, et retirer l'une ne doit pas emporter l'autre.
 */
export function MetricPicker<M extends PickedMetric>({
  open,
  metrics,
  minMetrics = 0,
  create,
  customMetrics,
  pickable,
  catalogOwner = null,
  onChange,
  onClose,
}: Readonly<MetricPickerProps<M>>) {
  const { t } = useTranslation();
  // La métrique en cours de modification : le formulaire du dessus s'y remplit, et son bouton
  // passe de « Ajouter » à « Modifier ».
  const [editing, setEditing] = useState<CustomMetric | null>(null);
  const removeMetric = useDeleteCustomMetric();

  const chosen = new Set(metrics.map(suggestedMetricIdentity));
  const isFull = metrics.length >= BLOCK_MAX_METRICS;

  /** Bascule : recliquer une métrique déjà retenue la retire, comme une case à cocher. */
  function toggle(metric: SuggestedMetric) {
    const identity = suggestedMetricIdentity(metric);
    if (chosen.has(identity)) {
      return remove(metrics.findIndex((current) => suggestedMetricIdentity(current) === identity));
    }
    // Atteint au plafond : la CRÉATION d'une métrique maison passe aussi par ici, et elle reste
    // ouverte liste pleine — la métrique naît dans la bibliothèque sans être posée. Les autres
    // lignes non retenues y sont fermées.
    if (isFull) return;
    onChange([...metrics, create(metric)]);
  }

  function remove(index: number) {
    if (metrics.length <= minMetrics) return;
    onChange(metrics.filter((_, position) => position !== index));
  }

  function move(index: number, to: number) {
    if (to < 0 || to >= metrics.length) return;
    const next = [...metrics];
    next.splice(to, 0, ...next.splice(index, 1));
    onChange(next);
  }

  return (
    <CmvPanel
      open={open}
      title={t("library.builder.metrics.title")}
      description={t("library.builder.metrics.orderHint")}
      onClose={onClose}
      footer={<CmvButton onClick={onClose}>{t("library.builder.metrics.done")}</CmvButton>}
    >
      <div className="flex flex-col gap-cmv-xl">
        <ChosenColumns
          metrics={metrics}
          minMetrics={minMetrics}
          customMetrics={customMetrics}
          onMove={move}
          onRemove={remove}
        />

        {/* Créée ICI et posée aussitôt en colonne : sortir du constructeur pour définir une
            cotation, puis y revenir, ferait perdre le fil de l'exercice en cours. Pas sur
            l'exercice d'un autre : elle naîtrait chez l'acteur, où cet exercice ne la lit pas. */}
        {catalogOwner == null ? (
          <CustomMetricForm
            editing={editing}
            onCreated={(metric) => toggle(customOf(metric.id))}
            onUpdated={() => setEditing(null)}
            onCancelEdit={() => setEditing(null)}
          />
        ) : null}

        <section className="flex flex-col gap-cmv-xs">
          <span className="text-cmv-body text-cmv-text-hi">
            {catalogOwner == null
              ? t("library.builder.custom.mine")
              : t("library.builder.custom.ofOwner", { owner: catalogOwner })}
          </span>
          {pickable == null || pickable.length === 0 ? (
            <span className="text-cmv-caption text-cmv-text-lo">
              {t(
                pickable == null
                  ? "library.builder.custom.unavailable"
                  : "library.builder.custom.none",
              )}
            </span>
          ) : null}
          {(pickable ?? []).map((custom) => {
            const isChosen = chosen.has(suggestedMetricIdentity(customOf(custom.id)));
            return (
              <div key={custom.id} className="flex items-center gap-cmv-xs">
                <button
                  type="button"
                  disabled={isFull && !isChosen}
                  onClick={() => toggle(customOf(custom.id))}
                  className="flex flex-1 items-baseline gap-cmv-sm rounded-cmv-sm px-cmv-sm py-cmv-xs text-left hover:bg-cmv-surface-hi disabled:opacity-40"
                >
                  <CmvCheckmark checked={isChosen} />
                  <span className="text-cmv-body text-cmv-text-hi">{custom.label}</span>
                  {custom.unit == null ? null : (
                    <span className="text-cmv-caption text-cmv-text-lo">{custom.unit}</span>
                  )}
                </button>

                {catalogOwner == null ? (
                  <>
                    <CmvButton
                      variant="ghost"
                      title={t("library.builder.custom.edit")}
                      onClick={() => setEditing(custom)}
                    >
                      <IoPencil />
                    </CmvButton>
                    <CmvConfirmButton
                      label={t("library.builder.custom.remove")}
                      icon={<IoTrashOutline />}
                      confirmLabel={t("common.confirmDelete")}
                      cancelLabel={t("common.cancel")}
                      disabled={removeMetric.isPending}
                      onConfirm={() => removeMetric.mutate(custom.id)}
                    />
                  </>
                ) : null}
              </div>
            );
          })}
        </section>

        {[...FAMILIES].map(([family, keys]) => (
          <section key={family} className="flex flex-col gap-cmv-xs">
            <span className="text-cmv-body text-cmv-text-hi">
              {t(`library.builder.family.${family}`)}
            </span>
            {keys.map((key) => {
              const isChosen = chosen.has(suggestedMetricIdentity(catalogOf(key)));
              return (
                <CatalogRow
                  key={key}
                  metricKey={key}
                  chosen={isChosen}
                  disabled={isFull && !isChosen}
                  onToggle={() => toggle(catalogOf(key))}
                />
              );
            })}
          </section>
        ))}
      </div>
    </CmvPanel>
  );
}

/**
 * Une métrique du catalogue livré, avec son unité par défaut : sans unité, une colonne ne saurait
 * pas formater ses valeurs.
 */
function catalogOf(key: MetricKey): SuggestedMetric {
  return { source: MetricSource.CATALOG, key, unit: defaultUnitOf(key) };
}

function customOf(customMetricId: string): SuggestedMetric {
  return { source: MetricSource.CUSTOM, customMetricId };
}

function CatalogRow({
  metricKey,
  chosen,
  disabled,
  onToggle,
}: Readonly<{ metricKey: MetricKey; chosen: boolean; disabled: boolean; onToggle: () => void }>) {
  const { t } = useTranslation();
  const hint = metricHint(metricKey, t);

  return (
    <button
      type="button"
      aria-pressed={chosen}
      disabled={disabled}
      onClick={onToggle}
      className="flex items-baseline gap-cmv-sm rounded-cmv-sm px-cmv-sm py-cmv-xs text-left hover:bg-cmv-surface-hi disabled:opacity-40"
    >
      <CmvCheckmark checked={chosen} />
      <span className="text-cmv-body text-cmv-text-hi">{t(METRIC_LABEL_KEY[metricKey])}</span>
      {hint == null ? null : <span className="text-cmv-caption text-cmv-text-lo">{hint}</span>}
    </button>
  );
}

function ChosenColumns({
  metrics,
  minMetrics,
  customMetrics,
  onMove,
  onRemove,
}: Readonly<{
  metrics: readonly PickedMetric[];
  minMetrics: number;
  customMetrics: readonly CustomMetric[];
  onMove: (index: number, to: number) => void;
  onRemove: (index: number) => void;
}>) {
  const { t } = useTranslation();
  const drag = useReorderDrag(onMove);

  return (
    <section className="flex flex-col gap-cmv-xs">
      <span className="text-cmv-caption text-cmv-text-mid">
        {t("library.builder.metrics.chosen")}
      </span>
      {metrics.map((metric, index) => (
        <div
          key={metric.id ?? suggestedMetricIdentity(metric)}
          {...drag.rowProps(index)}
          className={cn(
            "flex items-center gap-cmv-xs rounded-cmv-sm border border-cmv-border px-cmv-sm py-cmv-xs",
            drag.isDragging(index) && "opacity-40",
            // UN seul fond : deux classes de `background-color` se départageraient à l'ordre du
            // fichier CSS, pas à l'ordre où on les écrit.
            drag.isOver(index) ? "bg-cmv-accent-soft" : "bg-cmv-surface",
          )}
        >
          <CmvDragHandle
            label={`${t("library.builder.metrics.moveColumn")} ${index + 1}`}
            {...drag.handleProps(index)}
            onMove={(direction) => onMove(index, index + direction)}
          />
          <span className="flex-1 text-cmv-body text-cmv-text-hi">
            {metricLabel(metric, customMetrics, t)}
          </span>
          <CmvButton
            variant="ghost"
            title={t("library.builder.metrics.removeColumn")}
            disabled={metrics.length <= minMetrics}
            onClick={() => onRemove(index)}
          >
            <IoTrashOutline />
          </CmvButton>
        </div>
      ))}
    </section>
  );
}
