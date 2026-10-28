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
import { BlockMark } from "@/feature/library/component/BlockMark";
import { BlockSettingsPanel } from "@/feature/library/component/BlockSettingsPanel";
import { FoldButton } from "@/feature/library/component/FoldButton";
import { FrozenBadge } from "@/feature/library/component/FrozenBadge";
import type { BlocksDraft } from "@/feature/library/hook/useBlocksDraft";
import type { ExerciseDrag } from "@/feature/library/hook/useExerciseDrag";
import type { Folds } from "@/feature/library/hook/useFolds";
import {
  CmvAddTile,
  CmvButton,
  CmvDragHandle,
  CmvMenu,
  type CmvMenuItem,
} from "@/shared/component";
import { usePhraseText } from "@/shared/hook/usePhraseText";
import { cn } from "@/shared/util/cn.util";
import { newId } from "@/shared/util/new-id.util";

/** Le nom d'un bloc dans les phrases : son numéro, ou son libellé. */
export function blockNameOf(block: SessionBlock, number: string | null): string {
  return number ?? block.label ?? "—";
}

type SessionBlockCardProps = {
  block: SessionBlock;
  /** Le nom de chaque bloc de la séance, dans l'ordre : « Déplacer vers » les cite. */
  names: readonly string[];
  index: number;
  /** « 1 », ou `null` pour un bloc à libellé. */
  number: string | null;
  draft: BlocksDraft;
  /** Ce qui retient l'enregistrement de CE bloc, ou `null`. */
  issue: Phrase | null;
  /** L'exercice que le dernier refus de l'API désigne : sa carte passe au rouge. */
  refusedKey: string | null;
  customMetrics: readonly CustomMetric[];
  pickable: readonly CustomMetric[] | null;
  catalogOwner: string | null;
  /** Les blocs et les exercices repliés de la composition. */
  folds: Folds;
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
 * Un bloc de la séance (#719, maquette `coach_constructeur_seance_v2`) : son numéro ou son
 * libellé, la structure dont il est la copie, la phrase que l'athlète lira, puis ses exercices.
 *
 * Les réglages ne s'éditent pas en ligne : le bandeau ne fait que LIRE, l'étiquette de structure
 * ouvre le panneau où tout se règle (`BlockSettingsPanel`). Un seul formulaire, aucun doublon.
 *
 * Un bloc d'un seul exercice se lit comme UNE carte : le titre de l'exercice en tête, ses gestes
 * fondus dans le menu du bloc (frame 6).
 *
 * Replié (frame 2, `seance_bloc_replie`), il ne garde que son en-tête, la phrase de ses réglages et
 * la liste de ses exercices : de quoi reconnaître et ranger la séance.
 */
export function SessionBlockCard(props: Readonly<SessionBlockCardProps>) {
  const { block, number, draft, issue, folds } = props;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const name = blockNameOf(block, number);
  const codes = exerciseCodes(number, block.exercises.length);
  const titles = block.exercises.map((exercise) => draft.info[exercise.key]?.title ?? "—");
  const single = block.exercises.length === 1 ? block.exercises[0] : undefined;
  const menus = useBlockMenus(props, name);
  const folded = folds.isFolded(block.id);
  // L'exercice refusé a sa propre bordure ; seul, ou dans un bloc replié, c'est le bloc qui la porte.
  const holdsRefused = block.exercises.some((exercise) => exercise.key === props.refusedKey);
  const refused = issue != null || (holdsRefused && (single != null || folded));

  return (
    <article
      className={cn(
        "flex flex-col gap-cmv-md rounded-cmv-md border p-cmv-md",
        refused ? "border-cmv-error-line" : "border-cmv-border",
        props.isDropTarget ? "bg-cmv-accent-soft" : "bg-cmv-surface",
      )}
    >
      <BlockHeader
        {...props}
        name={name}
        titles={titles}
        folded={folded}
        menu={single == null ? menus.block : [...menus.exercise(single.key), ...menus.block]}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {folded ? (
        <FoldedExercises
          items={
            single == null
              ? block.exercises.map((exercise, rank) => ({
                  key: exercise.key,
                  code: codes[rank] ?? null,
                  title: titles[rank] ?? "—",
                }))
              : []
          }
          issue={issue}
        />
      ) : (
        <OpenBlock {...props} name={name} codes={codes} titles={titles} menus={menus} />
      )}

      {settingsOpen ? (
        <BlockSettingsPanel
          block={block}
          number={number}
          onApply={(next) => draft.change((current) => withBlock(current, block.id, () => next))}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </article>
  );
}

type BlockHeaderProps = Readonly<SessionBlockCardProps> & {
  name: string;
  titles: readonly string[];
  folded: boolean;
  menu: readonly (readonly CmvMenuItem[])[];
  onOpenSettings: () => void;
};

/**
 * Poignée, chevron, numéro ou libellé, le titre d'un exercice seul, la structure et le menu. Replié,
 * la phrase des réglages s'y ajoute : c'est tout ce qu'il reste du bloc à lire.
 */
function BlockHeader(props: BlockHeaderProps) {
  const { block, number, name, titles, folded, readOnly, folds } = props;
  const { t } = useTranslation();
  const text = usePhraseText();
  const single = block.exercises.length === 1 ? block.exercises[0] : undefined;
  const summary = folded ? settingsPhrase(block.settings, block.exercises.length, titles) : null;

  return (
    <header className="flex flex-wrap items-center gap-cmv-sm">
      {props.dragHandle}
      <FoldButton
        folded={folded}
        label={t(
          folded ? "library.session.blocks.unfoldBlock" : "library.session.blocks.foldBlock",
          {
            block: name,
          },
        )}
        onToggle={() => folds.toggle(block.id)}
      />
      {number == null ? (
        <span className="text-cmv-title text-cmv-text-hi">{block.label}</span>
      ) : (
        <BlockMark mark={number} kind="block" />
      )}
      {single == null ? null : (
        <>
          <span className="text-cmv-body text-cmv-text-hi">{titles[0]}</span>
          <FrozenBadge frozenFrom={props.draft.info[single.key]?.frozenFrom ?? null} />
        </>
      )}
      <StructureTag block={block} readOnly={readOnly} onOpen={props.onOpenSettings} />
      {summary == null ? null : (
        <span className="text-cmv-caption text-cmv-text-lo">{text(summary)}</span>
      )}
      <span className="flex-1" />
      {readOnly ? null : (
        <CmvMenu
          label={t("library.session.blocks.blockMenu", { block: name })}
          groups={props.menu}
        />
      )}
    </header>
  );
}

type OpenBlockProps = Readonly<SessionBlockCardProps> & {
  name: string;
  codes: readonly (string | null)[];
  titles: readonly string[];
  menus: ReturnType<typeof useBlockMenus>;
};

/** Le bloc déplié : ce qu'il dit de lui-même, ses exercices, et la tuile qui en ajoute un. */
function OpenBlock(props: OpenBlockProps) {
  const { block, number, name, codes, titles, menus, readOnly, exerciseDrag, folds } = props;
  const { t } = useTranslation();
  const { change, info } = props.draft;
  const count = block.exercises.length;
  const limits = blockRowLimits(block);

  return (
    <>
      <BlockReading block={block} codes={codes} titles={titles} issue={props.issue} />

      {count === 0 ? (
        <EmptyBlock readOnly={readOnly} onDelete={menus.deleteBlock} />
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
              alone={count === 1}
              refused={exercise.key === props.refusedKey}
              folded={folds.isFolded(exercise.key)}
              onToggleFold={() => folds.toggle(exercise.key)}
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

      {readOnly ? null : (
        <AddToBlock
          name={name}
          code={exerciseCodes(number, count + 1)[count] ?? null}
          dropProps={exerciseDrag.targetProps(block.id, count)}
          isDropTarget={exerciseDrag.isOver(block.id, count)}
          onAdd={props.onAddExercise}
        />
      )}
    </>
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
  /** « 1.3 » : le code que l'exercice ajouté prendra ; `null` dans un bloc à libellé. */
  code: string | null;
  dropProps: object;
  isDropTarget: boolean;
  onAdd: () => void;
};

/**
 * « Ajouter un exercice au bloc 1 — arrivera en 1.3 » : aussi la cible d'un dépôt en bout de bloc,
 * celui d'un bloc vide compris.
 */
function AddToBlock({ name, code, dropProps, isDropTarget, onAdd }: Readonly<AddToBlockProps>) {
  const { t } = useTranslation();
  return (
    <CmvAddTile
      label={t("library.session.blocks.addTo", { block: name })}
      hint={code == null ? undefined : t("library.session.blocks.arriving", { code })}
      dropProps={dropProps}
      isDropTarget={isDropTarget}
      onClick={onAdd}
    />
  );
}

type EmptyBlockProps = { readOnly: boolean; onDelete: CmvMenuItem };

/** « Ce bloc est vide » : il retient l'enregistrement, le supprimer est donc à portée. */
function EmptyBlock({ readOnly, onDelete }: Readonly<EmptyBlockProps>) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-cmv-sm">
      <span className="flex-1 text-cmv-caption text-cmv-text-mid">
        {t("library.session.blocks.empty")}
      </span>
      {readOnly ? null : (
        <CmvButton variant="ghost" onClick={onDelete.onSelect}>
          {onDelete.label}
        </CmvButton>
      )}
    </div>
  );
}

type FoldedExercisesProps = {
  /** Aucun pour un bloc d'un seul exercice : son en-tête porte déjà le titre. */
  items: readonly { key: string; code: string | null; title: string }[];
  /** Replié, un bloc qui retient l'enregistrement le dit encore. */
  issue: Phrase | null;
};

/** Les exercices d'un bloc replié, code et titre, à la suite. */
function FoldedExercises({ items, issue }: Readonly<FoldedExercisesProps>) {
  const text = usePhraseText();
  return (
    <>
      {issue == null ? null : (
        <p role="alert" className="text-cmv-caption text-cmv-error-on">
          {text([issue])}
        </p>
      )}
      {items.length === 0 ? null : (
        <ul className="flex flex-wrap gap-x-cmv-lg gap-y-cmv-xs">
          {items.map(({ key, code, title }) => (
            <li key={key} className="flex items-baseline gap-cmv-sm">
              {code == null ? null : (
                <span className="font-cmv-mono font-semibold text-cmv-caption text-cmv-text-lo">
                  {code}
                </span>
              )}
              <span className="text-cmv-body text-cmv-text-mid">{title}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
