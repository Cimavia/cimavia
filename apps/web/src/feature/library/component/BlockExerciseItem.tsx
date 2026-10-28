import { type CustomMetric, SESSION_NOTE_MAX_LENGTH, type SessionBlockExercise } from "@cmv/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BlockExerciseGrid } from "@/feature/library/component/BlockExerciseGrid";
import { BlockMark } from "@/feature/library/component/BlockMark";
import { FoldButton } from "@/feature/library/component/FoldButton";
import { FrozenBadge } from "@/feature/library/component/FrozenBadge";
import type { ExerciseInfo } from "@/feature/library/hook/useBlocksDraft";
import { CMV_EDIT, CmvMenu, type CmvMenuItem, CmvTagList, CmvTextArea } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

type BlockExerciseItemProps = {
  exercise: SessionBlockExercise;
  /** « 1.2 », ou `null` dans un bloc à libellé. */
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
  /** Replié, il ne garde que son en-tête ; seul dans son bloc, il suit le repli du bloc. */
  folded: boolean;
  onToggleFold: () => void;
  /** Le dernier enregistrement a été refusé sur cet exercice : sa bordure le montre. */
  refused: boolean;
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
 * code, son titre, sa grille de valeurs et la note de l'athlète. Replié, la grille et la note
 * s'effacent : il reste de quoi reconnaître et ranger la séance.
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
  folded,
  onToggleFold,
  refused,
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
        !alone && "border p-cmv-sm",
        !alone && (refused ? "border-cmv-error-line" : "border-cmv-border"),
        isDropTarget && "bg-cmv-accent-soft",
      )}
    >
      {alone ? null : (
        <ExerciseHeader
          code={code}
          title={title}
          info={info}
          folded={folded}
          readOnly={readOnly}
          menu={menu}
          dragHandle={dragHandle}
          onToggleFold={onToggleFold}
        />
      )}

      {/* Le fieldset fige la grille et la note d'un geste, et efface ce qui ne sert qu'à éditer. */}
      {folded && !alone ? null : (
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

type ExerciseHeaderProps = Pick<
  BlockExerciseItemProps,
  "code" | "info" | "folded" | "readOnly" | "menu" | "dragHandle" | "onToggleFold"
> & { title: string };

/** Poignée, chevron, code encadré, titre, étiquettes et menu : ce qui reste d'un exercice replié. */
function ExerciseHeader({
  code,
  title,
  info,
  folded,
  readOnly,
  menu,
  dragHandle,
  onToggleFold,
}: Readonly<ExerciseHeaderProps>) {
  const { t } = useTranslation();
  return (
    <header className="flex flex-wrap items-center gap-cmv-sm">
      {dragHandle}
      {code == null ? null : <BlockMark mark={code} kind="exercise" />}
      <span className="flex-1 text-cmv-body text-cmv-text-hi">{title}</span>
      <CmvTagList tags={info?.tags ?? []} />
      <FrozenBadge frozenFrom={info?.frozenFrom ?? null} />
      {readOnly ? null : (
        <CmvMenu label={t("library.session.blocks.exerciseMenu", { title })} groups={menu} />
      )}
      <FoldButton
        folded={folded}
        label={t(
          folded ? "library.session.blocks.unfoldExercise" : "library.session.blocks.foldExercise",
          { exercise: code ?? title },
        )}
        onToggle={onToggleFold}
      />
    </header>
  );
}
