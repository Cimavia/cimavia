import {
  CUSTOM_METRIC_LABEL_MAX_LENGTH,
  CUSTOM_METRIC_UNIT_MAX_LENGTH,
  type CustomMetric,
  MetricValueType,
  type OrderedScale,
} from "@cmv/shared";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScaleEditor } from "@/feature/library/component/ScaleEditor";
import {
  useCreateCustomMetric,
  useUpdateCustomMetric,
} from "@/feature/library/hook/useCustomMetrics";
import { CmvButton, CmvSegmented, CmvTextField } from "@/shared/component";
import { apiErrorMessage } from "@/shared/lib/api";

// i18n-values library.builder.valueType: MetricValueType

const VALUE_TYPES = [
  MetricValueType.NUMBER,
  MetricValueType.DURATION,
  MetricValueType.TEXT,
  MetricValueType.SCALE,
] as const;

// Une échelle exige au moins deux paliers : un seul ne se compare à rien.
const MIN_SCALE_STEPS = 2;

type CustomMetricFormProps = {
  /** Métrique en cours de modification, ou `null` pour une création. */
  editing: CustomMetric | null;
  onCreated: (metric: CustomMetric) => void;
  onUpdated: () => void;
  onCancelEdit: () => void;
};

/**
 * Création d'une métrique maison. Elle vit au niveau du COACH, pas de l'exercice : une cotation
 * inventée une fois sert dans toute la bibliothèque.
 *
 * Le libellé et l'unité sont SA donnée — donc du texte libre, jamais une clé i18n : « Cotation
 * maison » ne se traduit pas.
 */
export function CustomMetricForm({
  editing,
  onCreated,
  onUpdated,
  onCancelEdit,
}: Readonly<CustomMetricFormProps>) {
  const { t } = useTranslation();
  const create = useCreateCustomMetric();
  const update = useUpdateCustomMetric();

  const [label, setLabel] = useState("");
  const [unit, setUnit] = useState("");
  const [valueType, setValueType] = useState<MetricValueType>(MetricValueType.NUMBER);
  const [scale, setScale] = useState<OrderedScale>([]);

  /**
   * Le formulaire se remplit depuis la métrique à modifier. `useEffect` plutôt qu'une `key` de
   * remontage : le panneau garde son défilement et sa position, et le coach voit le formulaire se
   * remplir sous ses yeux — un remontage l'aurait fait clignoter.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: seul le CHANGEMENT de métrique doit recharger le formulaire, pas chaque frappe qu'il contient
  useEffect(() => {
    setLabel(editing?.label ?? "");
    setUnit(editing?.unit ?? "");
    setValueType(editing?.valueType ?? MetricValueType.NUMBER);
    setScale(editing?.scale ?? []);
  }, [editing?.id]);

  const isScale = valueType === MetricValueType.SCALE;
  const scaleReady = !isScale || scale.length >= MIN_SCALE_STEPS;
  const isEditing = editing != null;
  const isBusy = create.isPending || update.isPending;
  const canSubmit = label.trim() !== "" && scaleReady && !isBusy;

  function reset() {
    setLabel("");
    setUnit("");
    setScale([]);
    setValueType(MetricValueType.NUMBER);
  }

  function onSubmit() {
    const input = {
      label: label.trim(),
      // Unité vide → `null`, jamais `""` : le modèle porte l'absence d'unité, pas une chaîne
      // vide qui s'afficherait comme un espace après le nombre.
      unit: unit.trim() === "" ? null : unit.trim(),
      valueType,
      // L'invariant du schéma partagé : des paliers si et seulement si le type est SCALE.
      scale: isScale ? scale : null,
    };

    if (editing != null) {
      update.mutate(
        { id: editing.id, input },
        {
          onSuccess: () => {
            onUpdated();
            reset();
          },
        },
      );
      return;
    }

    create.mutate(input, {
      onSuccess: (metric) => {
        onCreated(metric);
        reset();
      },
    });
  }

  return (
    <section className="flex flex-col gap-cmv-md rounded-cmv-md border border-cmv-border border-dashed bg-cmv-bg-1 p-cmv-md">
      <span className="text-cmv-caption text-cmv-text-mid">
        {t(isEditing ? "library.builder.custom.editTitle" : "library.builder.custom.title")}
      </span>

      <CmvTextField
        label={t("library.builder.custom.label")}
        name="customMetricLabel"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder={t("library.builder.custom.labelPlaceholder")}
        minLength={1}
        required
        requiredMark
      />

      <CmvTextField
        label={t("library.builder.custom.unit")}
        name="customMetricUnit"
        value={unit}
        onChange={(event) => setUnit(event.target.value.slice(0, CUSTOM_METRIC_UNIT_MAX_LENGTH))}
        placeholder={t("library.builder.custom.unitPlaceholder")}
      />

      <CmvSegmented<MetricValueType>
        label={t("library.builder.custom.valueType")}
        value={valueType}
        onChange={setValueType}
        options={VALUE_TYPES.map((type) => ({
          value: type,
          label: t(`library.builder.valueType.${type}`),
        }))}
      />

      {isScale ? <ScaleEditor scale={scale} onChange={setScale} /> : null}

      {create.error == null && update.error == null ? null : (
        <p className="text-cmv-caption text-cmv-error">
          {apiErrorMessage(create.error ?? update.error)}
        </p>
      )}

      <div className="flex items-center gap-cmv-sm">
        <CmvButton
          onClick={onSubmit}
          disabled={!canSubmit}
          title={
            label.length > CUSTOM_METRIC_LABEL_MAX_LENGTH
              ? t("library.builder.custom.labelTooLong")
              : undefined
          }
        >
          {t(isEditing ? "library.builder.custom.update" : "library.builder.custom.submit")}
        </CmvButton>
        {isEditing ? (
          <CmvButton
            variant="ghost"
            onClick={() => {
              onCancelEdit();
              reset();
            }}
          >
            {t("library.builder.cancel")}
          </CmvButton>
        ) : null}
      </div>
    </section>
  );
}
