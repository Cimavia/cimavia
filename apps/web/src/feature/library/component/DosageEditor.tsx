import {
  type AdjustmentLevelType,
  type Adjustments,
  type CustomMetric,
  type DosageEditable,
  type ExerciseBlock,
  type MetricValue,
  structurePath,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { AdjustmentMarker } from "@/feature/library/component/AdjustmentMarker";
import { BlockBandeau } from "@/feature/library/component/BlockBandeau";
import { SessionBlockGrid } from "@/feature/library/component/SessionBlockGrid";

type DosageEditorProps = {
  dosage: DosageEditable;
  /** Le niveau qui édite : la séance-type, ou la séance planifiée d'un athlète (#518). */
  level: AdjustmentLevelType;
  customMetrics: readonly CustomMetric[];
  onCellChange: (blockId: string, rowId: string, metricId: string, value: MetricValue) => void;
  onStructureChange: (blockId: string, structure: ExerciseBlock["structure"]) => void;
  onRowsChange: (blockId: string, rows: ExerciseBlock["rows"]) => void;
  onRevertCell: (blockId: string, rowId: string, metricId: string) => void;
  onRevertStructureField: (blockId: string, field: string) => void;
};

/**
 * Le dosage d'un exercice composé : par bloc, son bandeau, ses paramètres ajustés et sa grille.
 *
 * Une seule mécanique pour les deux niveaux éditables, paramétrée par le niveau — jamais un modèle
 * à part (maquette, frame 9). Le constructeur de séance et le panneau de séance planifiée la
 * partagent ; seul ce qui l'entoure leur appartient.
 */
export function DosageEditor({
  dosage,
  level,
  customMetrics,
  onCellChange,
  onStructureChange,
  onRowsChange,
  onRevertCell,
  onRevertStructureField,
}: Readonly<DosageEditorProps>) {
  return (
    <>
      {dosage.blocks.map((block) => (
        <section key={block.id} className="flex flex-col gap-cmv-sm">
          {dosage.blocks.length > 1 && block.label != null ? (
            <span className="text-cmv-caption text-cmv-text-mid">{block.label}</span>
          ) : null}
          <BlockBandeau
            structure={block.structure}
            onChange={(structure) => onStructureChange(block.id, structure)}
          />
          <StructureAdjustments
            level={level}
            blockId={block.id}
            adjustments={dosage.adjustments}
            onRevert={(field) => onRevertStructureField(block.id, field)}
          />
          <SessionBlockGrid
            level={level}
            block={block}
            baseline={dosage.baseline}
            adjustments={dosage.adjustments}
            customMetrics={customMetrics}
            onCellChange={(rowId, metricId, value) =>
              onCellChange(block.id, rowId, metricId, value)
            }
            onRowsChange={(rows) => onRowsChange(block.id, rows)}
            onRevertCell={(rowId, metricId) => onRevertCell(block.id, rowId, metricId)}
          />
        </section>
      ))}
    </>
  );
}

/**
 * Les paramètres de bandeau ajustés, avec de quoi y revenir.
 *
 * Sous le bandeau plutôt que dans chaque champ : les champs sont fournis par `BlockBandeau`, qui
 * sert aussi le constructeur d'exercice où la notion de défaut n'existe pas. Y injecter des
 * marqueurs le rendrait dépendant d'un contexte qu'il n'a pas.
 *
 * Comme dans la grille, seul un ajustement du niveau qui édite offre d'y revenir ; celui d'un
 * niveau précédent dit seulement d'où vient la valeur.
 */
function StructureAdjustments({
  level,
  blockId,
  adjustments,
  onRevert,
}: Readonly<{
  level: AdjustmentLevelType;
  blockId: string;
  adjustments: Adjustments;
  onRevert: (field: string) => void;
}>) {
  const { t } = useTranslation();
  // i18n-values library.builder.bandeau: setCount, restBetweenSetsSeconds, intervalSeconds, totalDurationSeconds, targetRounds, roundCount, restBetweenRoundsSeconds
  const prefix = structurePath(blockId, "");
  const fields = adjustments
    .filter((item) => item.path.startsWith(prefix))
    .map((item) => ({ field: item.path.slice(prefix.length), marker: item.level }));

  if (fields.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-cmv-sm">
      {fields.map(({ field, marker }) => (
        <span key={field} className="flex items-center gap-cmv-xs">
          <AdjustmentMarker level={marker} />
          <span className="text-cmv-caption text-cmv-text-lo">
            {t(`library.builder.bandeau.${field}`)}
          </span>
          {marker === level ? (
            <button
              type="button"
              onClick={() => onRevert(field)}
              className="text-cmv-caption text-cmv-accent hover:underline"
            >
              {t("library.session.revert")}
            </button>
          ) : (
            <span className="text-cmv-caption text-cmv-text-lo">
              {t("library.dosage.inherited")}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
