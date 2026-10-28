import { type BlockGrid, type CustomMetric, metricLabel } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { BlockMark } from "@/feature/library/component/BlockMark";
import { CmvButton, CmvTagList } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

/** Le changement qu'une carte porte, tel que son étiquette le dit. */
export type CardChange = {
  /** « remplacé pour Léa en S2 et S5 » : un clic rouvre « Pour quelles semaines ? ». */
  label: string;
  /** L'exercice de la séance-type à cette place, pour un remplaçant ou un retrait ; `null` sinon. */
  sessionType: string | null;
  onReopen: () => void;
  /** « Revenir à la séance-type », sur la semaine du panneau seule. */
  onRevert: () => void;
};

type ComposedExerciseCardProps = {
  /** « 1.2 », ou `null` dans un bloc à libellé. */
  code: string | null;
  title: string;
  tags: readonly string[];
  grid: BlockGrid | null;
  customMetrics: readonly CustomMetric[];
  note: string | null;
  /** `null` pour un exercice reçu tel quel. */
  change: CardChange | null;
  /** Retiré cette semaine : la carte se barre et ne garde que son étiquette. */
  removed: boolean;
  onReplace: (() => void) | null;
  onRemove: (() => void) | null;
  readOnly: boolean;
  isBusy: boolean;
};

/**
 * Un exercice en mode composition (#720, frame 2) : son code, son nom, ses tags, les métriques de
 * sa grille en puces et sa note — aucune valeur, elles se règlent dans Dosage (#721). Un
 * changement se dit par l'étiquette orange, que l'on rouvre pour l'étendre ou l'annuler.
 */
export function ComposedExerciseCard(props: Readonly<ComposedExerciseCardProps>) {
  const { code, title, tags, change, removed, readOnly, isBusy } = props;
  return (
    <article
      className={cn(
        "flex flex-col gap-cmv-sm rounded-cmv-md border px-cmv-md py-cmv-sm",
        removed ? "border-dashed border-cmv-border" : "border-cmv-border bg-cmv-surface",
      )}
    >
      <div className="flex flex-wrap items-center gap-cmv-sm">
        {code == null ? null : <BlockMark mark={code} kind="exercise" />}
        <span
          className={cn(
            "text-cmv-body",
            removed ? "text-cmv-text-lo line-through" : "text-cmv-text-hi",
          )}
        >
          {title}
        </span>
        {removed || tags.length === 0 ? null : <CmvTagList tags={tags} />}
        {change == null ? null : (
          <CmvButton variant="secondary" onClick={change.onReopen} disabled={readOnly || isBusy}>
            {change.label}
          </CmvButton>
        )}
      </div>
      {removed ? null : <ExerciseContent {...props} />}
      <ExerciseGestures {...props} />
    </article>
  );
}

/** Les métriques de la grille en puces, et la note — jamais de valeur. */
function ExerciseContent({ grid, customMetrics, note }: Readonly<ComposedExerciseCardProps>) {
  const { t } = useTranslation();
  const metrics = (grid?.metrics ?? []).map((metric) => metricLabel(metric, customMetrics, t));
  return (
    <>
      {metrics.length === 0 ? null : (
        <ul className="flex flex-wrap gap-cmv-xs">
          {metrics.map((metric, index) => (
            <li
              // Deux colonnes peuvent porter le même libellé : le rang les distingue.
              key={`${index}-${metric}`}
              className="rounded-cmv-sm border border-cmv-border px-cmv-sm py-cmv-xs text-cmv-caption text-cmv-text-mid"
            >
              {metric}
            </li>
          ))}
        </ul>
      )}
      {note == null ? null : (
        <p className="whitespace-pre-line text-cmv-caption text-cmv-text-mid">{note}</p>
      )}
    </>
  );
}

/** Ce que la séance-type mettait là, et les gestes : revenir, remplacer, retirer. */
function ExerciseGestures({
  change,
  onReplace,
  onRemove,
  readOnly,
  isBusy,
}: Readonly<ComposedExerciseCardProps>) {
  const { t } = useTranslation();
  return (
    <>
      {change?.sessionType == null ? null : (
        <p className="text-cmv-caption text-cmv-text-lo">
          {t("plan.composition.sessionType", { title: change.sessionType })}
        </p>
      )}
      {readOnly ? null : (
        <div className="flex flex-wrap gap-cmv-sm">
          {change == null ? null : (
            <CmvButton variant="ghost" onClick={change.onRevert} disabled={isBusy}>
              {t("plan.composition.backToSessionType")}
            </CmvButton>
          )}
          {onReplace == null ? null : (
            <CmvButton variant="secondary" onClick={onReplace} disabled={isBusy}>
              {t("plan.composition.replace")}
            </CmvButton>
          )}
          {onRemove == null ? null : (
            <CmvButton variant="secondary" onClick={onRemove} disabled={isBusy}>
              {t("plan.composition.remove")}
            </CmvButton>
          )}
        </div>
      )}
    </>
  );
}
