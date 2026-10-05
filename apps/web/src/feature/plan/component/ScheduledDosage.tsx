import { AdjustmentLevel, type CustomMetric } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { AdjustmentMarker } from "@/feature/library/component/AdjustmentMarker";
import { DosageEditor } from "@/feature/library/component/DosageEditor";
import type { CompositionDetail } from "@/feature/plan/component/CompositionEditor";
import {
  type EditorItem,
  type ScheduledDosageGestures,
  scheduledAdjustmentCount,
} from "@/feature/plan/hook/useSessionComposition";
import { CmvBadge, CmvButton } from "@/shared/component";

type ScheduledDosageLegendProps = {
  /** Les exercices qui portent au moins un ajustement pour l'athlète. */
  adjustedCount: number;
  athleteName: string;
  /** La séance-type d'où vient cette séance, ou `null` : une séance ad hoc, ou dont le modèle a disparu. */
  sourceSessionId: string | null;
};

/**
 * Ce que dit le haut de la composition d'une séance planifiée (#518, maquette frame 9) : combien
 * d'exercices sont ajustés pour l'athlète, d'où vient la séance, ce que veulent dire les deux
 * marqueurs, et que tout ça ne vaut que pour cette semaine.
 */
export function ScheduledDosageLegend({
  adjustedCount,
  athleteName,
  sourceSessionId,
}: Readonly<ScheduledDosageLegendProps>) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-cmv-xs rounded-cmv-md border border-cmv-border bg-cmv-bg-1 p-cmv-md">
      <div className="flex flex-wrap items-center gap-cmv-sm">
        {adjustedCount === 0 ? null : (
          <span className="text-cmv-caption text-cmv-text-mid">
            {t("plan.session.dosage.adjustedFor", { count: adjustedCount, name: athleteName })}
          </span>
        )}
        {/* Un lien simple, pas un `Link` du routeur : il ouvre un AUTRE onglet, où le panneau et
            sa saisie en cours n'existent pas — rien à garder ici, rien à perdre. */}
        {sourceSessionId == null ? null : (
          <a
            href={`/library/sessions/${sourceSessionId}`}
            target="_blank"
            rel="noreferrer"
            className="text-cmv-caption text-cmv-accent hover:underline"
          >
            {t("plan.session.dosage.viewTemplate")}
          </a>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-cmv-md">
        <span className="flex items-center gap-cmv-xs text-cmv-caption text-cmv-text-lo">
          <AdjustmentMarker level={AdjustmentLevel.SESSION} />
          {t("plan.session.dosage.legendSession")}
        </span>
        <span className="flex items-center gap-cmv-xs text-cmv-caption text-cmv-text-lo">
          <AdjustmentMarker level={AdjustmentLevel.SCHEDULED} />
          {t("plan.session.dosage.legendScheduled", { name: athleteName })}
        </span>
      </div>
      <p className="text-cmv-caption text-cmv-text-lo">{t("plan.session.dosage.weekOnly")}</p>
    </div>
  );
}

type ScheduledDosageProps = {
  item: EditorItem;
  /** Les métriques maison de la bibliothèque : seule une ligne ajoutée ici en manque. */
  libraryMetrics: readonly CustomMetric[];
  gestures: ScheduledDosageGestures;
};

/**
 * Le dosage d'un exercice de la séance planifiée, ajustable pour l'athlète : la même grille que le
 * constructeur de séance, au niveau SÉANCE PLANIFIÉE.
 */
function ScheduledDosage({ item, libraryMetrics, gestures }: Readonly<ScheduledDosageProps>) {
  const { t } = useTranslation();
  const { key } = item;

  return (
    <div className="flex flex-col gap-cmv-lg">
      <div>
        <CmvButton
          variant="ghost"
          disabled={scheduledAdjustmentCount(item) === 0}
          onClick={() => gestures.resetAll(key)}
        >
          {t("library.session.resetAll")}
        </CmvButton>
      </div>
      <DosageEditor
        dosage={item}
        level={AdjustmentLevel.SCHEDULED}
        // Les définitions FIGÉES à la diffusion d'abord : la bibliothèque a pu changer depuis.
        customMetrics={item.snapshot.customMetrics ?? libraryMetrics}
        onCellChange={(blockId, rowId, metricId, value) =>
          gestures.setCell(key, blockId, rowId, metricId, value)
        }
        onStructureChange={(blockId, structure) => gestures.setStructure(key, blockId, structure)}
        onRowsChange={(blockId, rows) => gestures.setRows(key, blockId, rows)}
        onRevertCell={(blockId, rowId, metricId) =>
          gestures.revertCell(key, blockId, rowId, metricId)
        }
        onRevertStructureField={(blockId, field) =>
          gestures.revertStructureField(key, blockId, field)
        }
      />
    </div>
  );
}

/** Le détail dépliable d'une ligne : « N valeur(s) pour Léa » dans l'en-tête, la grille dessous. */
export function scheduledDosageDetail(
  athleteName: string,
  libraryMetrics: readonly CustomMetric[],
  gestures: ScheduledDosageGestures,
) {
  return (item: EditorItem): CompositionDetail => ({
    badge: (
      <ScheduledDosageBadge count={scheduledAdjustmentCount(item)} athleteName={athleteName} />
    ),
    body: <ScheduledDosage item={item} libraryMetrics={libraryMetrics} gestures={gestures} />,
  });
}

function ScheduledDosageBadge({
  count,
  athleteName,
}: Readonly<{ count: number; athleteName: string }>) {
  const { t } = useTranslation();
  if (count === 0) return null;
  return (
    <CmvBadge variant="info">
      {t("plan.session.dosage.valuesFor", { count, name: athleteName })}
    </CmvBadge>
  );
}
