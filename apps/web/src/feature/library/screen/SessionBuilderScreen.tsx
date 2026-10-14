import type { CustomMetric, ExerciseBlocks, ExerciseDto, SessionDto } from "@cmv/shared";
import {
  canWrite,
  isOwner,
  required,
  SESSION_NOTES_MAX_LENGTH,
  SESSION_TITLE_MAX_LENGTH,
} from "@cmv/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BuilderActions } from "@/feature/library/component/BuilderActions";
import { CompositionCard } from "@/feature/library/component/CompositionCard";
import { LibraryPicker } from "@/feature/library/component/LibraryPicker";
import { SessionPreview } from "@/feature/library/component/SessionPreview";
import { useCustomMetrics } from "@/feature/library/hook/useCustomMetrics";
import {
  exerciseDetailQuery,
  useDuplicateExercise,
  useExercise,
} from "@/feature/library/hook/useExercises";
import { useSessionDraft } from "@/feature/library/hook/useSessionDraft";
import {
  sessionDetailQuery,
  useDeleteSession,
  useReloadSessionExercise,
  useSession,
} from "@/feature/library/hook/useSessions";
import { myRightText } from "@/feature/library/util/access-text.util";
import { mergeCatalogs } from "@/feature/library/util/metric-catalog.util";
import {
  CMV_EDIT,
  CmvAppShell,
  CmvButton,
  CmvDragHandle,
  CmvEmptyState,
  CmvErrorState,
  CmvFormError,
  CmvLeaveDialog,
  CmvReadOnlyBanner,
  CmvStaleBanner,
  CmvTextArea,
  CmvTextField,
  useToast,
} from "@/shared/component";
import { useLeaveGuard } from "@/shared/hook/useLeaveGuard";
import { useMutationToast } from "@/shared/hook/useMutationToast";
import { RefusedFieldsContext, useRefusedFields } from "@/shared/hook/useRefusedFields";
import { useReorderDrag } from "@/shared/hook/useReorderDrag";
import { useStaleReload } from "@/shared/hook/useStaleReload";
import { isStaleWriteError } from "@/shared/lib/api";
import { cn } from "@/shared/util/cn.util";

type SessionBuilderScreenProps = {
  /** Absent = création. Sinon la séance est chargée depuis l'URL. */
  sessionId?: string | undefined;
  /** L'exercice créé depuis cette séance, à y ajouter au retour (#303). */
  addExerciseId?: string | undefined;
};

/**
 * Le constructeur de séance (#165) — pleine page, aperçu athlète de la séance ENTIÈRE.
 *
 * Ce qu'on y ajuste, ce sont des VALEURS : la structure, les colonnes et la consigne restent
 * celles de la bibliothèque. Sans ce verrou, cet écran redeviendrait le constructeur d'exercice
 * et la notion de défaut se diluerait.
 */
export function SessionBuilderScreen({
  sessionId,
  addExerciseId,
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
  const addSettled = added.data != null || added.isError;

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
      added={added.data ?? null}
      onLeave={() => navigate({ to: "/library" })}
      onReload={reload}
      isReloading={isReloading}
    />
  );
}

/**
 * Les écritures que le constructeur ajoute à l'enregistrement du brouillon : recharger un
 * exercice, supprimer la séance. Les trois citent la version, les trois peuvent trouver la séance
 * changée depuis — et « Recharger » est alors la seule issue.
 */
function useSessionWrites(draft: ReturnType<typeof useSessionDraft>) {
  const reload = useReloadSessionExercise();
  const removeSession = useDeleteSession();
  return {
    reload,
    removeSession,
    staleMessage: staleMessageOf(
      draft.isStale || isStaleWriteError(reload.error),
      isStaleWriteError(removeSession.error),
    ),
    // Une écriture à la fois : lancées ensemble, elles citeraient la même version, et la seconde
    // prendrait pour un conflit l'écriture du coach lui-même.
    isWriting: draft.isSaving || reload.isPending || removeSession.isPending,
  };
}

/**
 * L'exercice dont on veut une variante, lu AVANT d'enregistrer la séance : la variante reste au
 * propriétaire de l'exercice (#605, jusqu'à #609), et la séance n'a pas à avancer d'une version
 * pour un geste voué au 403. `null` quand la variante n'aura pas lieu — et le refus est dit.
 *
 * `isReading` compte comme une écriture : la lecture OUVRE un enregistrement, et une autre
 * écriture lancée pendant qu'elle court citerait la même version que lui.
 */
function useVariantSource() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { onError } = useMutationToast();
  const [isReading, setReading] = useState(false);
  async function read(exerciseId: string): Promise<ExerciseDto | null> {
    let source: ExerciseDto;
    setReading(true);
    try {
      // Relu, pas tiré du cache : le titre nomme la variante, et le droit a pu changer depuis.
      // Sans nouvel essai, qu'un 404 ne ferait que retarder.
      source = await queryClient.fetchQuery({
        ...exerciseDetailQuery(exerciseId),
        staleTime: 0,
        retry: false,
      });
    } catch (error) {
      onError(error);
      return null;
    } finally {
      setReading(false);
    }
    if (isOwner(source.myAccess)) return source;
    toast.error(t("library.session.variantOwnerOnly", { owner: source.owner.name }));
    return null;
  }
  return { read, isReading };
}

/**
 * Ce que dit le bandeau de conflit, ou `null` sans conflit. Une écriture refusée garde une saisie ;
 * une suppression refusée n'en a pas, elle invite à voir ce qui a changé avant de retirer.
 */
function staleMessageOf(isWriteStale: boolean, isDeleteStale: boolean): string | null {
  if (isWriteStale) return "library.session.stale";
  return isDeleteStale ? "library.session.staleDelete" : null;
}

type SessionBuilderProps = {
  session: SessionDto | null;
  added: ExerciseDto | null;
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
  const toast = useToast();
  const { onError, onFailure } = useMutationToast();
  const navigate = useNavigate();
  const { data: customMetrics } = useCustomMetrics();
  const draft = useSessionDraft(session, added);
  // Une durée ou un nombre refusé reste à l'écran, mais pas dans le brouillon : enregistrer
  // enverrait l'ancienne valeur, et partir perdrait la saisie sans un mot (#566).
  const refused = useRefusedFields();
  // Annuler, la barre latérale, un retour arrière ou un F5 : tous demandent avant de perdre la
  // composition (#327). Seules les sorties qui SUIVENT un enregistrement passent.
  const guard = useLeaveGuard(draft.isDirty || refused.hasRefused);
  // Ferme le bouton ET en devient l'infobulle : une seule valeur pour les deux (#514).
  const blockedBy = refused.hasRefused ? t("library.builder.refusedBlocksSave") : undefined;
  const writes = useSessionWrites(draft);
  const { reload, removeSession, staleMessage } = writes;
  const edited = draft.edited;
  const duplicate = useDuplicateExercise();
  const variantSource = useVariantSource();
  const isWriting = writes.isWriting || variantSource.isReading;
  const [titleTouched, setTitleTouched] = useState(false);

  // La séance d'un autre Coach (#606) : en Écriture elle se modifie, sans suppression ; en
  // Lecture elle se consulte. Une séance qui naît est au Coach qui la crée.
  const foreign = foreignSession(session);
  const readOnly = foreign != null && !canWrite(foreign.myAccess);
  // Chaque ligne apporte les métriques de l'exercice qu'elle compose, chez son propriétaire
  // (#605) : le catalogue du Coach ne résout que les siennes.
  // Mémorisées : la saisie du titre ne doit pas redonner un catalogue neuf à chaque carte.
  const metrics = useMemo(
    () => mergeCatalogs(customMetrics, ...draft.items.map((item) => item.customMetrics)),
    [customMetrics, draft.items],
  );
  const drag = useReorderDrag(draft.moveItem);
  const adjustedItems = draft.items.filter((item) => item.adjustments.length > 0).length;

  /** Le titre manque ou une saisie est refusée : la séance ne s'enregistrerait pas, et le dit. */
  function cannotSave(): boolean {
    if (draft.trimmedTitle === "") {
      setTitleTouched(true);
      toast.error(t("library.session.titleBeforeLeaving"));
      return true;
    }
    if (refused.hasRefused) toast.error(t("library.session.refusedBeforeLeaving"));
    return refused.hasRefused;
  }

  /**
   * Enregistre, le dit, et rend la séance enregistrée — ou `null` quand il faut rester : échec
   * (déjà annoncé), ou séance sans titre.
   *
   * Le titre est vérifié ICI (`cannotSave`) parce que deux gestes enregistrent sans passer par le
   * bouton, qui, lui, reste fermé sans titre : « Dupliquer en variante » et « Créer l'exercice
   * manquant » (#303). Ils quittent la séance pour l'éditeur d'exercice, et l'enregistrent
   * d'abord — sans ça tout ce que le coach vient de composer disparaît, et le geste qui devait
   * l'aider lui coûte son travail. Sans titre, rien ne part : le champ le réclame, plutôt qu'un
   * échec du serveur qui ne dirait pas pourquoi.
   *
   * Une saisie refusée retient de même (#566) : ces deux gestes enregistreraient l'ANCIENNE
   * valeur, puis quitteraient la séance — la saisie disparaîtrait sans que rien ne l'ait dit.
   */
  async function save(successKey: string): Promise<SessionDto | null> {
    if (cannotSave()) return null;
    try {
      const saved = await draft.submit();
      toast.success(t(successKey));
      return saved;
    } catch (error) {
      // Un conflit d'édition se dit par le bandeau, à côté de la saisie : un toast disparaîtrait
      // en emportant la seule explication.
      if (!isStaleWriteError(error)) onFailure("library.session.saveFailed", error);
      return null;
    }
  }

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

  async function onDuplicate(exerciseId: string, blocks: ExerciseBlocks) {
    // Ce qui bloque l'enregistrement se dit d'abord : inutile de lire l'exercice pour rien.
    if (cannotSave()) return;
    const source = await variantSource.read(exerciseId);
    if (source == null) return;
    if ((await save("library.session.savedBeforeVariant")) == null) return;
    duplicate.mutate(
      { source, suffix: t("library.session.variantSuffix"), blocks },
      {
        onSuccess: (created) => {
          guard.release();
          navigate({
            to: "/library/exercises/$exerciseId",
            params: { exerciseId: created.id },
          });
        },
        // Le refus de l'API est actionnable — une colonne hors du catalogue du Coach, par exemple.
        onError,
      },
    );
  }

  /** La séance d'où l'on part est passée par id : l'éditeur d'exercice y ramènera. */
  async function onCreateMissing(title: string) {
    const saved = await save("library.session.savedBeforeExercise");
    if (saved == null) return;
    guard.release();
    navigate({ to: "/library/exercises/new", search: { title, session: saved.id } });
  }

  return (
    <CmvAppShell
      title={draft.trimmedTitle === "" ? t("library.session.createTitle") : draft.trimmedTitle}
      subtitle={sessionSubtitle(foreign, draft.items.length, adjustedItems, t)}
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
              reste HORS du fieldset : ses cartes doivent encore se déplier en Lecture. */}
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
                  onBlur={() => setTitleTouched(true)}
                  placeholder={t("library.session.titlePlaceholder")}
                  required
                  requiredMark={!readOnly}
                />
                {titleTouched && draft.trimmedTitle === "" ? (
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

            <div className="flex flex-col gap-cmv-sm">
              <span className="text-cmv-caption text-cmv-text-mid">
                {t("library.session.composition")}
              </span>

              {draft.items.length === 0 ? <EmptyComposition readOnly={readOnly} /> : null}

              {draft.items.map((item, index) => (
                <div
                  key={item.key}
                  {...drag.rowProps(index)}
                  className={cn(drag.isDragging(index) && "opacity-40")}
                >
                  <CompositionCard
                    item={item}
                    customMetrics={metrics}
                    isWriting={isWriting}
                    isDropTarget={drag.isOver(index)}
                    isFirst={index === 0}
                    isLast={index === draft.items.length - 1}
                    readOnly={readOnly}
                    onMove={(direction) => draft.moveItem(index, index + direction)}
                    dragHandle={
                      // Sans poignée, rien ne se glisse : les lignes n'ont rien à recevoir.
                      readOnly ? null : (
                        <CmvDragHandle
                          label={`${t("library.session.moveExercise")} ${index + 1}`}
                          {...drag.handleProps(index)}
                          onMove={(direction) => draft.moveItem(index, index + direction)}
                        />
                      )
                    }
                    onNoteChange={(note) =>
                      draft.setItems((current) =>
                        current.map((row) => (row.key === item.key ? { ...row, note } : row)),
                      )
                    }
                    onCellChange={(blockId, rowId, metricId, value) =>
                      draft.setCellValue(item.key, blockId, rowId, metricId, value)
                    }
                    onStructureChange={(blockId, structure) =>
                      draft.setStructure(item.key, blockId, structure as never)
                    }
                    onRowsChange={(blockId, rows) =>
                      draft.setRows(item.key, blockId, rows as never)
                    }
                    onRevertCell={(blockId, rowId, metricId) =>
                      draft.revertCell(item.key, blockId, rowId, metricId)
                    }
                    onRevertStructureField={(blockId, field) =>
                      draft.revertStructureField(item.key, blockId, field)
                    }
                    onResetAll={() => draft.resetItem(item.key)}
                    onReload={() => {
                      // `CompositionCard` ferme « Recharger » sur une ligne sans id : la ligne est
                      // enregistrée, la séance aussi.
                      reload.mutate(
                        {
                          session: required(edited, "rechargement hors d'une séance"),
                          sessionExerciseId: required(item.id, "rechargement d'une ligne sans id"),
                        },
                        {
                          onSuccess: (reloaded, { sessionExerciseId }) =>
                            draft.applyReloaded(sessionExerciseId, reloaded),
                          // Le conflit, lui, se dit par le bandeau.
                          onError: (error) => {
                            if (!isStaleWriteError(error)) onError(error);
                          },
                        },
                      );
                    }}
                    onDuplicate={() => onDuplicate(item.exerciseId, item.blocks)}
                    onRemove={() => draft.removeItem(item.key)}
                  />
                </div>
              ))}

              {readOnly ? null : (
                <AddExercise
                  customMetrics={metrics}
                  onPick={draft.addExercise}
                  onCreateMissing={onCreateMissing}
                  isSaving={isWriting}
                />
              )}
            </div>

            <CmvFormError error={draft.isStale ? null : draft.error} />
          </div>

          {/* `sticky` : l'aperçu suit le défilement de la composition, bien plus longue que lui. */}
          <aside className="min-w-0 xl:sticky xl:top-32 xl:self-start">
            <SessionPreview items={draft.items} customMetrics={metrics} />
          </aside>
        </div>
      </RefusedFieldsContext>
      <CmvLeaveDialog {...guard.dialog} />
    </CmvAppShell>
  );
}

/** La séance si elle est à un autre Coach ; `null` pour la sienne, ou pour celle qui naît. */
function foreignSession(session: SessionDto | null) {
  return session != null && !isOwner(session.myAccess) ? session : null;
}

/** La composition, précédée — pour la séance d'un autre — de son propriétaire et du droit qu'on en a. */
function sessionSubtitle(
  foreign: SessionDto | null,
  count: number,
  adjusted: number,
  t: TFunction,
): string {
  const composition = t("library.session.subtitle", { count, adjusted });
  if (foreign == null) return composition;
  return t("library.session.ofOwner", {
    owner: foreign.owner.name,
    right: myRightText(foreign.myAccess, t),
    composition,
  });
}

type AddExerciseProps = {
  customMetrics: readonly CustomMetric[];
  onPick: (exercise: ExerciseDto) => void;
  onCreateMissing: (title: string) => void;
  isSaving: boolean;
};

/**
 * « Ajouter un exercice », puis le sélecteur. Il s'ouvre AU CENTRE, comme le choix de structure du
 * constructeur d'exercice : même geste, même endroit. La colonne de droite ne porte que l'aperçu.
 */
function AddExercise({
  customMetrics,
  onPick,
  onCreateMissing,
  isSaving,
}: Readonly<AddExerciseProps>) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);

  if (!picking) {
    return (
      <div>
        <CmvButton variant="secondary" onClick={() => setPicking(true)}>
          {t("library.session.pickerTitle")}
        </CmvButton>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-bg-1 p-cmv-md">
      <LibraryPicker
        customMetrics={customMetrics}
        onPick={(exercise) => {
          onPick(exercise);
          setPicking(false);
        }}
        onCreateMissing={onCreateMissing}
        isSaving={isSaving}
      />
      <div>
        <CmvButton variant="ghost" onClick={() => setPicking(false)}>
          {t("library.builder.cancel")}
        </CmvButton>
      </div>
    </div>
  );
}

/** « Compose ta séance » n'a pas de sens pour qui ne peut que la lire : à lui, on dit qu'elle est vide. */
function EmptyComposition({ readOnly }: Readonly<{ readOnly: boolean }>) {
  const { t } = useTranslation();
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
