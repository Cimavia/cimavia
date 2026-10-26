import { type CustomMetric, SESSION_NOTE_MAX_LENGTH, type SessionBlockExercise } from "@cmv/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BlockExerciseGrid } from "@/feature/library/component/BlockExerciseGrid";
import { FrozenBadge } from "@/feature/library/component/FrozenBadge";
import type { ExerciseInfo } from "@/feature/library/hook/useBlocksDraft";
import { CMV_EDIT, CmvMenu, type CmvMenuItem, CmvTagList, CmvTextArea } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

type BlockExerciseItemProps = {
  exercise: SessionBlockExercise;
  /** « A2 », ou `null` dans un bloc à libellé. */
  code: string | null;
  info: ExerciseInfo | undefined;
  /** Le nombre de tours que sa grille montre (`blockRowLimits`). */
  limit: number;
  customMetrics: readonly CustomMetric[];
  pickable: readonly CustomMetric[] | null;
  catalogOwner: string | null;
  /**
   * Seul dans son bloc : la carte du bloc porte déjà son titre et ses gestes (#719, frame 6). Il ne
   * reste ici que sa grille et sa note.
   */
  alone: boolean;
  compact: boolean;
  readOnly: boolean;
  menu: readonly (readonly CmvMenuItem[])[];
  /** `null` en Lecture : rien ne se glisse. */
  dragHandle: ReactNode;
  isDropTarget: boolean;
  dropProps: object;
  onChange: (exercise: SessionBlockExercise) => void;
};

/**
 * Un exercice dans un bloc (#719, maquette `coach_constructeur_seance_v2`, frames 3 à 5) : son
 * code, son titre, sa grille de valeurs et la note de l'athlète. En affichage compact, la grille et
 * la note se replient : il reste de quoi reconnaître et ranger la séance.
 */
export function BlockExerciseItem({
  exercise,
  code,
  info,
  limit,
  customMetrics,
  pickable,
  catalogOwner,
  alone,
  compact,
  readOnly,
  menu,
  dragHandle,
  isDropTarget,
  dropProps,
  onChange,
}: Readonly<BlockExerciseItemProps>) {
  const { t } = useTranslation();
  const title = info?.title ?? "—";

  return (
    <div
      {...dropProps}
      className={cn(
        "flex flex-col gap-cmv-sm rounded-cmv-sm",
        !alone && "border border-cmv-border p-cmv-sm",
        isDropTarget && "bg-cmv-accent-soft",
      )}
    >
      {alone ? null : (
        <header className="flex flex-wrap items-center gap-cmv-sm">
          {dragHandle}
          {code == null ? null : (
            <span className="text-cmv-caption text-cmv-text-mid tabular-nums">{code}</span>
          )}
          <span className="flex-1 text-cmv-body text-cmv-text-hi">{title}</span>
          <CmvTagList tags={info?.tags ?? []} />
          <FrozenBadge frozenFrom={info?.frozenFrom ?? null} />
          {readOnly ? null : (
            <CmvMenu label={t("library.session.blocks.exerciseMenu", { title })} groups={menu} />
          )}
        </header>
      )}

      {/* Le fieldset fige la grille et la note d'un geste, et efface ce qui ne sert qu'à éditer. */}
      {compact ? null : (
        <fieldset
          disabled={readOnly}
          className={cn("flex min-w-0 flex-col gap-cmv-sm", CMV_EDIT.group)}
        >
          <BlockExerciseGrid
            grid={exercise.grid}
            limit={limit}
            customMetrics={customMetrics}
            pickable={pickable}
            catalogOwner={catalogOwner}
            onChange={(grid) => onChange({ ...exercise, grid })}
          />
          <CmvTextArea
            label={t("library.session.noteLabel")}
            name={`note-${exercise.key}`}
            rows={2}
            maxLength={SESSION_NOTE_MAX_LENGTH}
            value={exercise.note ?? ""}
            onChange={(event) =>
              onChange({ ...exercise, note: event.target.value === "" ? null : event.target.value })
            }
            placeholder={t("library.session.notePlaceholder")}
          />
        </fieldset>
      )}
    </div>
  );
}
