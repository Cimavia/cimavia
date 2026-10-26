import {
  blockRowLimits,
  type CustomMetric,
  detachedExercise,
  duplicatedBlock,
  duplicatedExercise,
  exerciseCodes,
  flowPhrase,
  isCustomized,
  movedExercise,
  type Phrase,
  rowsBeyond,
  type SessionBlock,
  settingsPhrase,
  withBlock,
  withExerciseChange,
  withoutExercise,
} from "@cmv/shared";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoChevronDown } from "react-icons/io5";
import { BlockExerciseItem } from "@/feature/library/component/BlockExerciseItem";
import { BlockSettingsPanel } from "@/feature/library/component/BlockSettingsPanel";
import { FrozenBadge } from "@/feature/library/component/FrozenBadge";
import type { BlocksDraft } from "@/feature/library/hook/useBlocksDraft";
import type { ExerciseDrag } from "@/feature/library/hook/useExerciseDrag";
import { CmvButton, CmvDragHandle, CmvMenu, type CmvMenuItem } from "@/shared/component";
import { usePhraseText } from "@/shared/hook/usePhraseText";
import { cn } from "@/shared/util/cn.util";

/** Le nom d'un bloc dans les phrases : sa lettre, ou son libellé. */
export function blockNameOf(block: SessionBlock, letter: string | null): string {
  return letter ?? block.label ?? "—";
}

const newId = () => crypto.randomUUID();

type SessionBlockCardProps = {
  block: SessionBlock;
  /** Le nom de chaque bloc de la séance, dans l'ordre : « Déplacer vers » les cite. */
  names: readonly string[];
  index: number;
  letter: string | null;
  draft: BlocksDraft;
  /** Ce qui retient l'enregistrement de CE bloc, ou `null`. */
  issue: Phrase | null;
  customMetrics: readonly CustomMetric[];
  pickable: readonly CustomMetric[] | null;
  catalogOwner: string | null;
  compact: boolean;
  readOnly: boolean;
  /** La poignée qui range les blocs ; `null` en Lecture. */
  dragHandle: ReactNode;
  isDropTarget: boolean;
  exerciseDrag: ExerciseDrag;
  onAddExercise: () => void;
  onReplace: (key: string) => void;
  onChangeStructure: () => void;
  onSaveAsStructure: () => void;
};

/**
 * Un bloc de la séance (#719, maquette `coach_constructeur_seance_v2`) : sa lettre ou son
 * libellé, la structure dont il est la copie, la phrase que l'athlète lira, puis ses exercices.
 *
 * Les réglages ne s'éditent pas en ligne : le bandeau ne fait que LIRE, l'étiquette de structure
 * ouvre le panneau où tout se règle (`BlockSettingsPanel`). Un seul formulaire, aucun doublon.
 *
 * Un bloc d'un seul exercice se lit comme UNE carte : le titre de l'exercice en tête, ses gestes
 * fondus dans le menu du bloc (frame 6).
 */
export function SessionBlockCard(props: Readonly<SessionBlockCardProps>) {
  const { block, letter, draft, issue, readOnly, exerciseDrag, isDropTarget } = props;
  const { t } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { change, info } = draft;
  const name = blockNameOf(block, letter);
  const count = block.exercises.length;
  const codes = exerciseCodes(letter, count);
  const titles = block.exercises.map((exercise) => info[exercise.key]?.title ?? "—");
  const limits = blockRowLimits(block);
  const single = count === 1 ? block.exercises[0] : undefined;
  const menus = useBlockMenus(props, name);

  return (
    <article
      className={cn(
        "flex flex-col gap-cmv-md rounded-cmv-md border p-cmv-md",
        issue == null ? "border-cmv-border" : "border-cmv-error-line",
        isDropTarget ? "bg-cmv-accent-soft" : "bg-cmv-surface",
      )}
    >
      <header className="flex flex-wrap items-center gap-cmv-sm">
        {props.dragHandle}
        <span className="text-cmv-title text-cmv-text-hi">{name}</span>
        {single == null ? null : (
          <>
            <span className="text-cmv-body text-cmv-text-hi">{titles[0]}</span>
            <FrozenBadge frozenFrom={info[single.key]?.frozenFrom ?? null} />
          </>
        )}
        <span className="flex-1" />
        <StructureTag block={block} readOnly={readOnly} onOpen={() => setSettingsOpen(true)} />
        {readOnly ? null : (
          <CmvMenu
            label={t("library.session.blocks.blockMenu", { block: name })}
            groups={single == null ? menus.block : [...menus.exercise(single.key), ...menus.block]}
          />
        )}
      </header>

      <BlockReading block={block} codes={codes} titles={titles} issue={issue} />

      {count === 0 ? (
        <EmptyBlock readOnly={readOnly} onAdd={props.onAddExercise} onDelete={menus.deleteBlock} />
      ) : (
        <div className="flex flex-col gap-cmv-sm">
          {block.exercises.map((exercise, rank) => (
            <BlockExerciseItem
              key={exercise.key}
              exercise={exercise}
              code={codes[rank] ?? null}
              info={info[exercise.key]}
              limit={limits[rank] ?? 0}
              customMetrics={props.customMetrics}
              pickable={props.pickable}
              catalogOwner={props.catalogOwner}
              alone={single != null}
              compact={props.compact}
              readOnly={readOnly}
              menu={menus.exercise(exercise.key)}
              dragHandle={
                readOnly ? null : (
                  <CmvDragHandle
                    label={t("library.session.blocks.moveExercise", {
                      exercise: codes[rank] ?? titles[rank],
                    })}
                    {...exerciseDrag.handleProps(exercise.key)}
                    onMove={(direction) =>
                      change((current) =>
                        movedExercise(current, exercise.key, block.id, rank + direction),
                      )
                    }
                  />
                )
              }
              isDropTarget={exerciseDrag.isOver(block.id, rank)}
              dropProps={readOnly ? {} : exerciseDrag.targetProps(block.id, rank)}
              onChange={(next) =>
                change((current) => withExerciseChange(current, exercise.key, () => next))
              }
            />
          ))}
        </div>
      )}

      {readOnly || count === 0 ? null : (
        <AddToBlock
          name={name}
          code={exerciseCodes(letter, count + 1)[count] ?? null}
          dropProps={exerciseDrag.targetProps(block.id, count)}
          isDropTarget={exerciseDrag.isOver(block.id, count)}
          onAdd={props.onAddExercise}
        />
      )}

      {settingsOpen ? (
        <BlockSettingsPanel
          block={block}
          letter={letter}
          onApply={(next) => change((current) => withBlock(current, block.id, () => next))}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </article>
  );
}

/**
 * Les gestes du menu ⋯ : ceux du bloc, ceux d'un exercice. Seul dans son bloc, un exercice est
 * déjà « à part », et le retirer laisserait un bloc vide : « Supprimer le bloc » dit mieux ce geste.
 */
function useBlockMenus(props: Readonly<SessionBlockCardProps>, name: string) {
  const { t } = useTranslation();
  const { block, names, index, draft } = props;
  const { change } = draft;
  const alone = block.exercises.length === 1;

  function duplicateBlock() {
    // Les clés sont tirées AVANT : la copie doit les connaître pour reprendre les titres, et le
    // compteur, remis à zéro dans la mise à jour, la laisse rejouable (mode strict).
    const keys = block.exercises.map(() => newId());
    const copyId = newId();
    change((current) => {
      let next = 0;
      return duplicatedBlock(current, block.id, copyId, () => keys[next++] ?? newId());
    });
    block.exercises.forEach((exercise, rank) => {
      const key = keys[rank];
      if (key != null) draft.copyInfo(exercise.key, key);
    });
  }

  const deleteBlock: CmvMenuItem = {
    label: t("library.session.blocks.deleteBlock"),
    danger: true,
    onSelect: () => change((current) => current.filter((other) => other.id !== block.id)),
  };
  const blockGroups: CmvMenuItem[][] = [
    [
      { label: t("library.session.blocks.changeStructure"), onSelect: props.onChangeStructure },
      { label: t("library.session.blocks.saveAsStructure"), onSelect: props.onSaveAsStructure },
      {
        label: t("library.session.blocks.duplicateBlock"),
        hint: t("library.session.blocks.duplicateBlockHint", { block: name }),
        onSelect: duplicateBlock,
      },
    ],
    [deleteBlock],
  ];

  function exercise(key: string): CmvMenuItem[][] {
    const moves = draft.blocks.flatMap((other, rank): CmvMenuItem[] =>
      rank === index
        ? []
        : [
            {
              label: t("library.session.blocks.moveTo", { block: names[rank] }),
              onSelect: () =>
                change((current) => movedExercise(current, key, other.id, other.exercises.length)),
            },
          ],
    );
    const copies: CmvMenuItem[] = [
      { label: t("library.session.blocks.replace"), onSelect: () => props.onReplace(key) },
      {
        label: t("library.session.blocks.duplicateExercise"),
        onSelect: () => {
          const copied = newId();
          change((current) => duplicatedExercise(current, key, copied));
          draft.copyInfo(key, copied);
        },
      },
    ];
    if (alone) return [moves, copies].filter((group) => group.length > 0);
    const detach: CmvMenuItem = {
      label: t("library.session.blocks.detach"),
      hint: t("library.session.blocks.detachHint", { block: name }),
      onSelect: () => change((current) => detachedExercise(current, key, newId())),
    };
    const remove: CmvMenuItem = {
      label: t("library.session.blocks.removeExercise"),
      danger: true,
      onSelect: () => change((current) => withoutExercise(current, key)),
    };
    return [[...moves, detach], copies, [remove]];
  }

  return { block: blockGroups, exercise, deleteBlock };
}

type StructureTagProps = { block: SessionBlock; readOnly: boolean; onOpen: () => void };

/** « Séries ▾ » : la structure dont le bloc est la copie, et l'entrée de ses réglages. */
function StructureTag({ block, readOnly, onOpen }: Readonly<StructureTagProps>) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={onOpen}
      className="inline-flex items-center gap-cmv-xs rounded-cmv-sm border border-cmv-border px-cmv-sm py-cmv-xs text-cmv-caption text-cmv-text-mid enabled:hover:text-cmv-text-hi"
    >
      {isCustomized(block.settings, block.copiedSettings)
        ? t("library.session.blocks.customizedFrom", { name: block.name })
        : block.name}
      {readOnly ? null : <IoChevronDown aria-hidden />}
    </button>
  );
}

type BlockReadingProps = {
  block: SessionBlock;
  codes: readonly (string | null)[];
  titles: readonly string[];
  issue: Phrase | null;
};

/**
 * Ce que le bloc dit de lui-même : la phrase que l'athlète lira, l'enchaînement, la consigne, ce
 * qui retient l'enregistrement, et les lignes qui ne seront pas jouées (`rowsBeyond`) — le récap
 * d'un changement de structure, qui reste affiché tant qu'il est vrai.
 */
function BlockReading({ block, codes, titles, issue }: Readonly<BlockReadingProps>) {
  const { t } = useTranslation();
  const text = usePhraseText();
  const label = (rank: number) => codes[rank] ?? titles[rank] ?? "—";
  const phrase = settingsPhrase(block.settings, block.exercises.length, titles);
  const flow = flowPhrase(
    block.settings,
    block.exercises.map((_exercise, rank) => label(rank)),
  );

  return (
    <>
      {phrase == null ? null : <p className="text-cmv-body text-cmv-text-hi">{text(phrase)}</p>}
      {flow == null ? null : <p className="text-cmv-caption text-cmv-text-mid">{text([flow])}</p>}
      {block.instructions == null ? null : (
        <p className="whitespace-pre-line text-cmv-caption text-cmv-text-mid">
          {block.instructions}
        </p>
      )}
      {issue == null ? null : (
        <p role="alert" className="text-cmv-caption text-cmv-error-on">
          {text([issue])}
        </p>
      )}
      {rowsBeyond(block).map(({ key, count }) => (
        <p key={key} className="text-cmv-caption text-cmv-warning-on">
          {t("library.session.blocks.beyondNotice", {
            count,
            exercise: label(block.exercises.findIndex((exercise) => exercise.key === key)),
          })}
        </p>
      ))}
    </>
  );
}

type AddToBlockProps = {
  name: string;
  /** « A3 » : le code que l'exercice ajouté prendra ; `null` dans un bloc à libellé. */
  code: string | null;
  dropProps: object;
  isDropTarget: boolean;
  onAdd: () => void;
};

/** « Ajouter un exercice au bloc A — arrivera en A3 » : aussi la cible d'un dépôt en bout de bloc. */
function AddToBlock({ name, code, dropProps, isDropTarget, onAdd }: Readonly<AddToBlockProps>) {
  const { t } = useTranslation();
  return (
    <div {...dropProps} className={cn("rounded-cmv-sm", isDropTarget && "bg-cmv-accent-soft")}>
      <CmvButton variant="ghost" onClick={onAdd}>
        {code == null
          ? t("library.session.blocks.addTo", { block: name })
          : t("library.session.blocks.addToArriving", { block: name, code })}
      </CmvButton>
    </div>
  );
}

type EmptyBlockProps = { readOnly: boolean; onAdd: () => void; onDelete: CmvMenuItem };

/** « Ce bloc est vide » : il retient l'enregistrement, les deux issues sont donc à portée. */
function EmptyBlock({ readOnly, onAdd, onDelete }: Readonly<EmptyBlockProps>) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-cmv-sm rounded-cmv-sm border border-cmv-border border-dashed p-cmv-md">
      <span className="flex-1 text-cmv-caption text-cmv-text-mid">
        {t("library.session.blocks.empty")}
      </span>
      {readOnly ? null : (
        <>
          <CmvButton variant="secondary" onClick={onAdd}>
            {t("library.session.blocks.addExercise")}
          </CmvButton>
          <CmvButton variant="ghost" onClick={onDelete.onSelect}>
            {onDelete.label}
          </CmvButton>
        </>
      )}
    </div>
  );
}
