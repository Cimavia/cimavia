import type {
  CustomMetric,
  ExerciseDto,
  SessionBlock,
  SessionDto,
  StructureDto,
} from "@cmv/shared";
import {
  blockNumbers,
  type CopiedStructure,
  canWrite,
  creationPlaceOf,
  exerciseCodes,
  foreignOf,
  movedExercise,
  movedItem,
  presetSource,
  SESSION_NOTES_MAX_LENGTH,
  SESSION_TITLE_MAX_LENGTH,
  STRUCTURE_PRESET_NAME_KEY,
  StructurePresetKey,
  structureSource,
  withBlock,
  withStructure,
} from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BlockSessionPreview } from "@/feature/library/component/BlockSessionPreview";
import { BuilderActions } from "@/feature/library/component/BuilderActions";
import { LibraryPicker } from "@/feature/library/component/LibraryPicker";
import { SaveAsStructurePanel } from "@/feature/library/component/SaveAsStructurePanel";
import { blockNameOf, SessionBlockCard } from "@/feature/library/component/SessionBlockCard";
import { StructurePicker } from "@/feature/library/component/StructurePicker";
import {
  type AddedExercise,
  type BlocksDraft,
  useBlocksDraft,
} from "@/feature/library/hook/useBlocksDraft";
import { useBuilderSave } from "@/feature/library/hook/useBuilderSave";
import { useCustomMetrics } from "@/feature/library/hook/useCustomMetrics";
import { useExerciseDrag } from "@/feature/library/hook/useExerciseDrag";
import { useExercise } from "@/feature/library/hook/useExercises";
import { useFolds } from "@/feature/library/hook/useFolds";
import {
  sessionDetailQuery,
  useDeleteSession,
  useSession,
} from "@/feature/library/hook/useSessions";
import { useStructureLibrary } from "@/feature/library/hook/useStructures";
import { myRightText } from "@/feature/library/util/access-text.util";
import { LibraryTab } from "@/feature/library/util/library-tab.util";
import { mergeCatalogs } from "@/feature/library/util/metric-catalog.util";
import { isPresetKey } from "@/feature/library/util/structure-start.util";
import {
  CMV_EDIT,
  CmvAppShell,
  CmvButton,
  CmvDragHandle,
  CmvEmptyState,
  CmvErrorState,
  CmvFormError,
  CmvLeaveDialog,
  CmvPanel,
  CmvReadOnlyBanner,
  CmvStaleBanner,
  CmvTextArea,
  CmvTextField,
  useToast,
} from "@/shared/component";
import { useLeaveGuard } from "@/shared/hook/useLeaveGuard";
import { RefusedFieldsContext, useRefusedFields } from "@/shared/hook/useRefusedFields";
import { useReorderDrag } from "@/shared/hook/useReorderDrag";
import { useStaleReload } from "@/shared/hook/useStaleReload";
import { apiErrorMessage, isStaleWriteError } from "@/shared/lib/api";
import { cn } from "@/shared/util/cn.util";

type SessionBuilderScreenProps = {
  /** Absent = création. Sinon la séance est chargée depuis l'URL. */
  sessionId?: string | undefined;
  /** L'exercice créé depuis cette séance, à y ajouter au retour (#303). */
  addExerciseId?: string | undefined;
  /** Le rang du bloc où l'ajouter (#719) ; absent, dans un bloc Séries neuf. */
  addToBlock?: number | undefined;
  /** Parti d'un bloc vide : la structure du bloc neuf qui le reçoit, au rang `addToBlock`. */
  addFromStructure?: string | undefined;
};

/**
 * Le constructeur de séance-type par blocs (#719, maquette `coach_constructeur_seance_v2`) —
 * pleine page, aperçu athlète de la séance ENTIÈRE.
 *
 * Chaque bloc est la copie d'une structure, que la séance règle à son idée ; chaque exercice y
 * porte sa grille de valeurs. Rien ne remonte vers la bibliothèque : ni la structure, ni
 * l'exercice ne changent quand la séance change.
 */
export function SessionBuilderScreen({
  sessionId,
  addExerciseId,
  addToBlock,
  addFromStructure,
}: Readonly<SessionBuilderScreenProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { loadedId, generation, reload, isReloading } = useStaleReload(
    sessionId,
    sessionDetailQuery,
  );
  const { data: session, isPending, isError, refetch } = useSession(loadedId);
  const added = useExercise(addExerciseId);
  const library = useStructureLibrary();
  const isPreset = addFromStructure != null && isPresetKey(addFromStructure);
  const addSettled =
    (added.data != null || added.isError) &&
    (addFromStructure == null || isPreset || library.data != null || library.isError);

  // Une fois l'exercice lu — ou introuvable —, il quitte l'URL : en `replace`, pour qu'un F5 ou un
  // retour arrière ne l'ajoute pas une seconde fois.
  useEffect(() => {
    if (sessionId == null || addExerciseId == null || !addSettled) return;
    if (added.isError) toast.error(t("library.session.addCreatedFailed"));
    navigate({
      to: "/library/sessions/$sessionId",
      params: { sessionId },
      search: {},
      replace: true,
    });
  }, [sessionId, addExerciseId, addSettled, added.isError, navigate, toast, t]);

  // Le brouillon naît UNE fois : il doit attendre l'exercice à ajouter pour le compter d'emblée.
  if ((loadedId != null && isPending) || (addExerciseId != null && !addSettled)) {
    return (
      <CmvAppShell title={t("library.session.loadingTitle")}>
        <p className="text-cmv-text-mid">{t("common.loading")}</p>
      </CmvAppShell>
    );
  }

  // Sur la DONNÉE, pas sur l'état de la requête : une relecture ratée (« Recharger », retour
  // d'onglet) passe la requête en erreur en gardant la séance en cache. Remplacer le constructeur
  // par l'erreur perdrait la saisie que le bandeau promet de garder.
  if (loadedId != null && isError && session === undefined) {
    return (
      <CmvAppShell title={t("library.session.loadingTitle")}>
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => refetch()}
        />
      </CmvAppShell>
    );
  }

  // `key` : l'état du brouillon naît de la séance chargée, et doit repartir de zéro si l'URL
  // change de séance sans démonter l'écran — ou si « Recharger » remplace la saisie.
  return (
    <SessionBuilder
      key={`${session?.id ?? "new"}:${generation}`}
      session={session ?? null}
      added={
        added.data == null
          ? null
          : {
              exercise: added.data,
              blockIndex: addToBlock ?? null,
              source: sourceOf(addFromStructure, library.data?.structures ?? [], t),
            }
      }
      // Retour à l'onglet Séances, d'où le coach est parti (#717).
      onLeave={() => navigate({ to: "/library", search: { tab: LibraryTab.SESSIONS } })}
      onReload={reload}
      isReloading={isReloading}
    />
  );
}

/**
 * La structure du bloc neuf d'où l'exercice est parti créé (#303) : une structure prête, ou celle du
 * Coach — Séries si elle a disparu entre-temps. `null` : l'exercice ne vient pas d'un bloc vide.
 */
function sourceOf(
  key: string | undefined,
  structures: readonly StructureDto[],
  t: TFunction,
): CopiedStructure | null {
  if (key == null) return null;
  if (isPresetKey(key)) return presetSource(key, t(STRUCTURE_PRESET_NAME_KEY[key]));
  const structure = structures.find((candidate) => candidate.id === key);
  if (structure != null) return structureSource(structure);
  const series = StructurePresetKey.SERIES;
  return presetSource(series, t(STRUCTURE_PRESET_NAME_KEY[series]));
}

/**
 * Ce que dit le bandeau de conflit, ou `null` sans conflit. Une écriture refusée garde une saisie ;
 * une suppression refusée n'en a pas, elle invite à voir ce qui a changé avant de retirer.
 */
function staleMessageOf(isWriteStale: boolean, isDeleteStale: boolean): string | null {
  if (isWriteStale) return "library.session.stale";
  return isDeleteStale ? "library.session.staleDelete" : null;
}

/** Ce que le panneau ouvert est en train de choisir, et pour quel bloc ou quel exercice. */
type Picking =
  | { kind: "exercise"; blockId: string | null }
  | { kind: "replace"; key: string }
  | { kind: "addBlock" }
  | { kind: "structure"; blockId: string }
  | { kind: "saveAs"; blockId: string };

/** Le bloc qui recevra l'exercice choisi, ou `null` : un bloc Séries neuf, ou un remplacement. */
function receivingBlockOf(picking: Picking | null): string | null {
  return picking?.kind === "exercise" ? picking.blockId : null;
}

type SessionBuilderProps = {
  session: SessionDto | null;
  added: AddedExercise | null;
  onLeave: () => void;
  /** Remplace la saisie par la dernière version de cette séance, après un conflit (#604). */
  onReload: (id: string) => void;
  isReloading: boolean;
};

function SessionBuilder({
  session,
  added,
  onLeave,
  onReload,
  isReloading,
}: Readonly<SessionBuilderProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: customMetrics } = useCustomMetrics();
  const draft = useBlocksDraft(
    session,
    t(STRUCTURE_PRESET_NAME_KEY[StructurePresetKey.SERIES]),
    added,
  );
  // Une durée ou un nombre refusé reste à l'écran, mais pas dans le brouillon : enregistrer
  // enverrait l'ancienne valeur, et partir perdrait la saisie sans un mot (#566).
  const refused = useRefusedFields();
  const saveKeys = {
    titleRequired: "library.session.titleRequired",
    saveFailed: "library.session.saveFailed",
  };
  const { blockedBy, titleMissing, touchTitle, save } = useBuilderSave(
    draft,
    refused.hasRefused,
    saveKeys,
  );
  const [picking, setPicking] = useState<Picking | null>(null);
  // La création d'un exercice manquant enregistre SANS le bloc vide d'où elle part : elle serait
  // sinon retenue par le bloc même qu'elle vient remplir.
  const creation = useBuilderSave(
    {
      trimmedTitle: draft.trimmedTitle,
      ...draft.withoutEmptyBlock(receivingBlockOf(picking)),
    },
    refused.hasRefused,
    saveKeys,
  );
  // Annuler, la barre latérale, un retour arrière ou un F5 : tous demandent avant de perdre la
  // composition (#327), et proposent de l'enregistrer (#682). Seules les sorties qui SUIVENT un
  // enregistrement passent sans demander.
  const guard = useLeaveGuard(
    draft.isDirty || refused.hasRefused,
    async () => (await save("library.session.saved")) != null,
  );
  const removeSession = useDeleteSession();
  const staleMessage = staleMessageOf(draft.isStale, isStaleWriteError(removeSession.error));
  // Une écriture à la fois : lancées ensemble, elles citeraient la même version, et la seconde
  // prendrait pour un conflit l'écriture du coach lui-même.
  const isWriting = draft.isSaving || removeSession.isPending;
  const edited = draft.edited;

  // La séance d'un autre Coach (#606) : en Écriture elle se modifie, sans suppression ; en
  // Lecture elle se consulte. Une séance qui naît est au Coach qui la crée.
  const foreign = foreignOf(session);
  const readOnly = foreign != null && !canWrite(foreign.myAccess);
  // Chaque exercice apporte les métriques maison qu'il cite, chez son propriétaire (#605) : le
  // catalogue du Coach ne résout que les siennes.
  const metrics = mergeCatalogs(
    customMetrics,
    ...Object.values(draft.info).map((info) => info.customMetrics),
  );

  async function onSubmit() {
    if ((await save("library.session.saved")) == null) return;
    guard.release();
    onLeave();
  }

  // Supprimer : la séance enregistrée, et à soi. `mutate` et non `mutateAsync` : un refus atterrit
  // dans `removeSession.error`, pas en rejet non capturé.
  const deletable = foreign == null ? edited : null;
  const onDelete =
    deletable == null
      ? null
      : () =>
          removeSession.mutate(deletable, {
            onSuccess: () => {
              guard.release();
              onLeave();
            },
          });

  /**
   * L'exercice manquant se crée hors de la séance (#303), qui s'enregistre d'abord. Le bloc où il
   * entrera voyage par son RANG : l'enregistrement régénère les identifiants des blocs. Un bloc
   * vide, que cet enregistrement laisse de côté, voyage par sa structure (`creationPlaceOf`).
   */
  async function onCreateMissing(title: string, blockRank: number | null) {
    const place = blockRank == null ? null : creationPlaceOf(draft.blocks, blockRank);
    const saved = await creation.save("library.session.savedBeforeExercise");
    if (saved == null) return;
    guard.release();
    navigate({
      to: "/library/exercises/new",
      search: {
        title,
        session: saved.id,
        ...(place == null ? {} : { block: place.rank }),
        ...(place?.source == null ? {} : { structure: place.source }),
      },
    });
  }

  return (
    <CmvAppShell
      title={draft.trimmedTitle === "" ? t("library.session.createTitle") : draft.trimmedTitle}
      subtitle={sessionSubtitle(foreign, draft.blocks, t)}
      actions={
        <BuilderActions
          readOnly={readOnly}
          deleteLabel={t("library.session.deleteSession")}
          onDelete={onDelete}
          isDeleting={removeSession.isPending}
          deleteError={removeSession.error}
          isSaving={draft.isSaving}
          isWriting={isWriting}
          submitLabel={submitLabel(draft.isSaving, edited != null, t)}
          canSubmit={draft.trimmedTitle !== ""}
          blockedBy={blockedBy}
          onCancel={onLeave}
          onSubmit={onSubmit}
        />
      }
    >
      {readOnly ? (
        <div className="mb-cmv-xl">
          <CmvReadOnlyBanner
            message={t("library.session.readOnly", { owner: foreign.owner.name })}
          />
        </div>
      ) : null}
      {staleMessage != null && edited != null ? (
        <div className="mb-cmv-xl">
          <CmvStaleBanner
            message={t(staleMessage)}
            onReload={() => onReload(edited.id)}
            isReloading={isReloading}
          />
        </div>
      ) : null}
      <RefusedFieldsContext value={refused.report}>
        <div className="grid gap-cmv-xl xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-cmv-xl">
            {/* Le titre et les notes se figent d'un geste (`CMV_EDIT`) ; la composition, elle,
              reste HORS du fieldset : ses blocs se lisent encore en Lecture. */}
            <fieldset
              disabled={readOnly}
              className={cn("flex min-w-0 flex-col gap-cmv-xl", CMV_EDIT.group)}
            >
              {/* Champ, message et légende serrés ensemble : l'espacement du formulaire
                (`gap-cmv-xl`) éloignerait la légende de l'astérisque qu'elle explique. */}
              <div className="flex flex-col gap-cmv-xs">
                <CmvTextField
                  label={t("library.session.titleLabel")}
                  name="title"
                  maxLength={SESSION_TITLE_MAX_LENGTH}
                  value={draft.title}
                  onChange={(event) => draft.setTitle(event.target.value)}
                  onBlur={touchTitle}
                  placeholder={t("library.session.titlePlaceholder")}
                  required
                  requiredMark={!readOnly}
                />
                {titleMissing || creation.titleMissing ? (
                  <p className="text-cmv-caption text-cmv-error">
                    {t("library.session.titleRequired")}
                  </p>
                ) : null}
                <p className={cn("text-cmv-caption text-cmv-text-lo", CMV_EDIT.only)}>
                  {t("common.requiredLegend")}
                </p>
              </div>

              <CmvTextArea
                label={t("library.session.notesLabel")}
                name="notes"
                maxLength={SESSION_NOTES_MAX_LENGTH}
                value={draft.notes}
                onChange={(event) => draft.setNotes(event.target.value)}
                placeholder={t("library.session.notesPlaceholder")}
                rows={3}
              />
            </fieldset>

            <Composition
              draft={draft}
              customMetrics={metrics}
              // Les colonnes se choisissent dans le catalogue du Coach, pour SA séance. Celle d'un
              // autre garde les colonnes qu'elle cite : son catalogue ne se lit pas d'ici.
              pickable={foreign == null ? (customMetrics ?? null) : null}
              catalogOwner={foreign?.owner.name ?? null}
              readOnly={readOnly}
              onPick={setPicking}
            />

            <CmvFormError
              error={draft.isStale ? null : draft.error}
              message={refusedMessageOf(draft, t)}
            />
          </div>

          {/* `sticky` : l'aperçu suit le défilement de la composition, bien plus longue que lui. */}
          <aside
            aria-label={t("library.session.blocks.previewTitle")}
            className="min-w-0 xl:sticky xl:top-32 xl:self-start"
          >
            <BlockSessionPreview
              blocks={draft.sentBlocks}
              titleOf={(key) => draft.info[key]?.title ?? null}
              customMetrics={metrics}
            />
          </aside>
        </div>
      </RefusedFieldsContext>

      <Pickers
        picking={picking}
        draft={draft}
        customMetrics={metrics}
        isWriting={isWriting}
        onCreateMissing={onCreateMissing}
        onClose={() => setPicking(null)}
      />
      <CmvLeaveDialog {...guard.dialog} />
    </CmvAppShell>
  );
}

type CompositionProps = {
  draft: BlocksDraft;
  customMetrics: readonly CustomMetric[];
  pickable: readonly CustomMetric[] | null;
  catalogOwner: string | null;
  readOnly: boolean;
  onPick: (picking: Picking) => void;
};

/**
 * Les blocs de la séance, rangés au glisser, repliés un à un ou tous d'un geste, et les deux façons
 * d'en ajouter.
 */
function Composition({
  draft,
  customMetrics,
  pickable,
  catalogOwner,
  readOnly,
  onPick,
}: Readonly<CompositionProps>) {
  const { t } = useTranslation();
  const { blocks, change } = draft;
  const numbers = blockNumbers(blocks);
  const names = blocks.map((block, index) => blockNameOf(block, numbers[index] ?? null));
  const folds = useFolds();
  // Un exercice seul suit le repli de son bloc : son propre repli ne se voit pas.
  const anyFolded = blocks.some(
    (block) =>
      folds.isFolded(block.id) ||
      (block.exercises.length > 1 && block.exercises.some((line) => folds.isFolded(line.key))),
  );
  const blockDrag = useReorderDrag((from, to) => change((current) => movedItem(current, from, to)));
  const exerciseDrag = useExerciseDrag((key, blockId, index) =>
    change((current) => movedExercise(current, key, blockId, index)),
  );

  return (
    <div className="flex flex-col gap-cmv-sm">
      <div className="flex flex-wrap items-end justify-between gap-cmv-sm">
        <span className="text-cmv-caption text-cmv-text-mid">
          {t("library.session.composition")}
        </span>
        {blocks.length === 0 ? null : (
          <div className="flex gap-cmv-xs">
            <CmvButton variant="ghost" disabled={!anyFolded} onClick={folds.unfoldAll}>
              {t("library.session.blocks.unfoldAll")}
            </CmvButton>
            <CmvButton
              variant="ghost"
              disabled={blocks.every((block) => folds.isFolded(block.id))}
              onClick={() => folds.foldAll(blocks.map((block) => block.id))}
            >
              {t("library.session.blocks.foldAll")}
            </CmvButton>
          </div>
        )}
      </div>

      {blocks.length === 0 ? <EmptyComposition readOnly={readOnly} legacy={draft.legacy} /> : null}

      {blocks.map((block, index) => (
        <div
          key={block.id}
          {...blockDrag.rowProps(index)}
          className={cn(blockDrag.isDragging(index) && "opacity-40")}
        >
          <SessionBlockCard
            block={block}
            names={names}
            index={index}
            number={numbers[index] ?? null}
            draft={draft}
            issue={draft.issues.find((issue) => issue.blockId === block.id)?.phrase ?? null}
            refusedKey={draft.refusedKey}
            customMetrics={customMetrics}
            pickable={pickable}
            catalogOwner={catalogOwner}
            folds={folds}
            readOnly={readOnly}
            dragHandle={
              // Sans poignée, rien ne se glisse : les blocs n'ont rien à recevoir.
              readOnly ? null : (
                <CmvDragHandle
                  label={t("library.session.blocks.moveBlock", { block: names[index] })}
                  {...blockDrag.handleProps(index)}
                  onMove={(direction) =>
                    change((current) => movedItem(current, index, index + direction))
                  }
                />
              )
            }
            isDropTarget={blockDrag.isOver(index)}
            exerciseDrag={exerciseDrag}
            onAddExercise={() => onPick({ kind: "exercise", blockId: block.id })}
            onReplace={(key) => onPick({ kind: "replace", key })}
            onChangeStructure={() => onPick({ kind: "structure", blockId: block.id })}
            onSaveAsStructure={() => onPick({ kind: "saveAs", blockId: block.id })}
          />
        </div>
      ))}

      {/* Une séance d'avant les blocs ne se compose pas ici : un bloc ajouté cacherait pourquoi
        elle ne s'enregistre pas. */}
      {readOnly || draft.legacy ? null : (
        <div className="flex flex-wrap items-center gap-cmv-sm">
          <CmvButton
            variant="secondary"
            onClick={() => onPick({ kind: "exercise", blockId: null })}
          >
            {t("library.session.blocks.addExercise")}
          </CmvButton>
          <CmvButton variant="secondary" onClick={() => onPick({ kind: "addBlock" })}>
            {t("library.session.blocks.addBlock")}
          </CmvButton>
        </div>
      )}
    </div>
  );
}

type PickersProps = {
  picking: Picking | null;
  draft: BlocksDraft;
  customMetrics: readonly CustomMetric[];
  isWriting: boolean;
  onCreateMissing: (title: string, blockRank: number | null) => void;
  onClose: () => void;
};

/** Le rang du bloc où va l'exercice choisi : celui qui le reçoit, ou celui de l'exercice remplacé. */
function exerciseRankOf(blocks: readonly SessionBlock[], picking: Picking | null): number | null {
  if (picking?.kind !== "exercise" && picking?.kind !== "replace") return null;
  const rank =
    picking.kind === "exercise"
      ? blocks.findIndex((block) => block.id === picking.blockId)
      : blocks.findIndex((block) => block.exercises.some((line) => line.key === picking.key));
  return rank < 0 ? null : rank;
}

type ExercisePanelProps = {
  picking: Picking | null;
  /** Le nom du bloc qui recevra l'exercice — `null` : un bloc Séries neuf. */
  target: string | null;
  customMetrics: readonly CustomMetric[];
  isWriting: boolean;
  onPick: (exercise: ExerciseDto) => void;
  onCreateMissing: (title: string) => void;
  onClose: () => void;
};

/** Le choix d'un exercice à ajouter, ou à mettre à la place d'un autre. */
function ExercisePanel({
  picking,
  target,
  customMetrics,
  isWriting,
  onPick,
  onCreateMissing,
  onClose,
}: Readonly<ExercisePanelProps>) {
  const { t } = useTranslation();
  const replacing = picking?.kind === "replace";
  const open = replacing || picking?.kind === "exercise";
  return (
    <CmvPanel
      open={open}
      title={
        replacing ? t("library.session.blocks.replaceTitle") : t("library.session.pickerTitle")
      }
      description={
        target == null
          ? t("library.session.blocks.newSeriesBlock")
          : t("library.session.blocks.inBlock", { block: target })
      }
      onClose={onClose}
    >
      {open ? (
        <LibraryPicker
          customMetrics={customMetrics}
          onPick={onPick}
          // L'exercice créé revient AJOUTÉ (#303) : il ne remplacerait rien.
          onCreateMissing={replacing ? undefined : onCreateMissing}
          isSaving={isWriting}
        />
      ) : null}
    </CmvPanel>
  );
}

/**
 * Les panneaux qu'ouvrent les gestes de la composition : choisir un exercice (l'ajouter, ou en
 * remplacer un), choisir une structure (un bloc neuf, ou celle d'un bloc), enregistrer un bloc
 * comme structure.
 */
function Pickers({
  picking,
  draft,
  customMetrics,
  isWriting,
  onCreateMissing,
  onClose,
}: Readonly<PickersProps>) {
  const { t } = useTranslation();
  const { blocks, change } = draft;
  const numbers = blockNumbers(blocks);
  const rankOf = (blockId: string | null) => {
    const rank = blocks.findIndex((block) => block.id === blockId);
    return rank < 0 ? null : rank;
  };
  const nameAt = (rank: number | null) => {
    const block = rank == null ? undefined : blocks[rank];
    return block == null || rank == null ? null : blockNameOf(block, numbers[rank] ?? null);
  };
  const structures = useStructureLibrary().data?.structures;
  const setBlock = (blockId: string, update: (block: SessionBlock) => SessionBlock) =>
    change((current) => withBlock(current, blockId, update));
  /** La consigne que porte encore la structure d'où vient le bloc : il la tient d'elle. */
  const inheritedOf = (block: SessionBlock) =>
    structures?.find((structure) => structure.id === block.sourceStructureId)?.instructions ?? null;

  const exerciseRank = exerciseRankOf(blocks, picking);
  const structureRank = picking?.kind === "structure" ? rankOf(picking.blockId) : null;
  const saveAsRank = picking?.kind === "saveAs" ? rankOf(picking.blockId) : null;
  const saveAsBlock = saveAsRank == null ? undefined : blocks[saveAsRank];

  function onPickExercise(exercise: ExerciseDto) {
    if (picking?.kind === "exercise") draft.addExercise(picking.blockId, exercise);
    if (picking?.kind === "replace") draft.replaceExercise(picking.key, exercise);
    onClose();
  }

  function onPickStructure(source: CopiedStructure) {
    if (picking?.kind === "addBlock") draft.addBlock(source);
    if (picking?.kind === "structure") {
      setBlock(picking.blockId, (b) => withStructure(b, source, inheritedOf(b)));
    }
  }

  return (
    <>
      <ExercisePanel
        picking={picking}
        target={nameAt(exerciseRank)}
        customMetrics={customMetrics}
        isWriting={isWriting}
        onPick={onPickExercise}
        onCreateMissing={(title) => onCreateMissing(title, exerciseRank)}
        onClose={onClose}
      />

      <StructurePicker
        open={picking?.kind === "addBlock" || picking?.kind === "structure"}
        title={
          structureRank == null
            ? t("library.session.blocks.addBlock")
            : t("library.session.blocks.changeStructureOf", { block: nameAt(structureRank) })
        }
        description={
          structureRank == null ? undefined : t("library.session.blocks.changeStructureHint")
        }
        onPick={onPickStructure}
        onClose={onClose}
      />

      {saveAsBlock == null || saveAsRank == null ? null : (
        <SaveAsStructurePanel
          block={saveAsBlock}
          origin={t("library.session.blocks.origin", {
            block: nameAt(saveAsRank),
            session:
              draft.trimmedTitle === "" ? t("library.session.createTitle") : draft.trimmedTitle,
          })}
          onCreated={(created) =>
            // La consigne du bloc a prérempli celle de la structure : le bloc prend ce que le
            // Coach a gardé ou retouché dans le panneau.
            setBlock(saveAsBlock.id, (b) =>
              withStructure(b, structureSource(created), b.instructions),
            )
          }
          onClose={onClose}
        />
      )}
    </>
  );
}

/**
 * « 1.2 Squat arrière : … » : le refus de l'API rapporté à l'exercice qu'il désigne, par son code et
 * son titre — la clé que l'API connaît ne dirait rien au Coach. `undefined` : le message tel quel.
 */
function refusedMessageOf(draft: BlocksDraft, t: TFunction): string | undefined {
  const detail = apiErrorMessage(draft.error);
  const key = draft.refusedKey;
  if (detail == null || key == null) return undefined;
  const numbers = blockNumbers(draft.blocks);
  const rank = draft.blocks.findIndex((block) => block.exercises.some((line) => line.key === key));
  const block = draft.blocks[rank];
  if (block == null) return undefined;
  const codes = exerciseCodes(numbers[rank] ?? null, block.exercises.length);
  const code = codes[block.exercises.findIndex((line) => line.key === key)] ?? null;
  const title = draft.info[key]?.title ?? "—";
  return t("library.session.blocks.refusedExercise", {
    exercise: code == null ? title : `${code} ${title}`,
    detail,
  });
}

/** « 3 blocs · 7 exercices », précédé — pour la séance d'un autre — de son propriétaire et du droit qu'on en a. */
function sessionSubtitle(
  foreign: SessionDto | null,
  blocks: readonly SessionBlock[],
  t: TFunction,
): string {
  const exercises = blocks.reduce((sum, block) => sum + block.exercises.length, 0);
  const composition = [
    t("library.session.blocks.blockCount", { count: blocks.length }),
    t("library.session.blocks.exerciseCount", { count: exercises }),
  ].join(" · ");
  if (foreign == null) return composition;
  return t("library.session.ofOwner", {
    owner: foreign.owner.name,
    right: myRightText(foreign.myAccess, t),
    composition,
  });
}

/**
 * « Compose ta séance » n'a pas de sens pour qui ne peut que la lire : à lui, on dit qu'elle est vide.
 * Une séance encore composée par exercices (BL-1) n'est pas vide : on dit pourquoi elle ne s'ouvre pas.
 */
function EmptyComposition({ readOnly, legacy }: Readonly<{ readOnly: boolean; legacy: boolean }>) {
  const { t } = useTranslation();
  if (legacy) {
    return (
      <CmvEmptyState
        title={t("library.session.blocks.legacyTitle")}
        description={t("library.session.blocks.legacyDescription")}
      />
    );
  }
  return readOnly ? (
    <CmvEmptyState title={t("library.session.readOnlyEmpty")} />
  ) : (
    <CmvEmptyState
      title={t("library.session.emptyTitle")}
      description={t("library.session.emptyDescription")}
    />
  );
}

/** Enregistrement en cours · création · édition — trois libellés, un seul endroit pour les lire. */
function submitLabel(isSaving: boolean, isEditing: boolean, t: TFunction): string {
  if (isSaving) return t("library.builder.saving");
  return t(isEditing ? "library.session.submitEdit" : "library.session.submitCreate");
}
