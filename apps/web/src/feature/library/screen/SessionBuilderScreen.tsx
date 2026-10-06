import type { ExerciseBlocks, ExerciseDto, SessionDto } from "@cmv/shared";
import { required, SESSION_NOTES_MAX_LENGTH, SESSION_TITLE_MAX_LENGTH } from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CompositionCard } from "@/feature/library/component/CompositionCard";
import { LibraryPicker } from "@/feature/library/component/LibraryPicker";
import { SessionPreview } from "@/feature/library/component/SessionPreview";
import { useCustomMetrics } from "@/feature/library/hook/useCustomMetrics";
import { useDuplicateExercise, useExercise } from "@/feature/library/hook/useExercises";
import { useSessionDraft } from "@/feature/library/hook/useSessionDraft";
import { useReloadSessionExercise, useSession } from "@/feature/library/hook/useSessions";
import {
  CmvAppShell,
  CmvButton,
  CmvDragHandle,
  CmvEmptyState,
  CmvErrorState,
  CmvFormError,
  CmvLeaveDialog,
  CmvTextArea,
  CmvTextField,
  useToast,
} from "@/shared/component";
import { useLeaveGuard } from "@/shared/hook/useLeaveGuard";
import { useMutationToast } from "@/shared/hook/useMutationToast";
import { RefusedFieldsContext, useRefusedFields } from "@/shared/hook/useRefusedFields";
import { useReorderDrag } from "@/shared/hook/useReorderDrag";
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
  const { data: session, isPending, isError, refetch } = useSession(sessionId);
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
  if ((sessionId != null && isPending) || (addExerciseId != null && !addSettled)) {
    return (
      <CmvAppShell title={t("library.session.loadingTitle")}>
        <p className="text-cmv-text-mid">{t("common.loading")}</p>
      </CmvAppShell>
    );
  }

  if (sessionId != null && isError) {
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
  // change de séance sans démonter l'écran.
  return (
    <SessionBuilder
      key={session?.id ?? "new"}
      session={session ?? null}
      added={added.data ?? null}
      onLeave={() => navigate({ to: "/library" })}
    />
  );
}

function SessionBuilder({
  session,
  added,
  onLeave,
}: Readonly<{ session: SessionDto | null; added: ExerciseDto | null; onLeave: () => void }>) {
  const { t } = useTranslation();
  const toast = useToast();
  const { onFailure } = useMutationToast();
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
  const reload = useReloadSessionExercise(session?.id);
  const duplicate = useDuplicateExercise();
  const [titleTouched, setTitleTouched] = useState(false);
  const [picking, setPicking] = useState(false);

  const metrics = customMetrics ?? [];
  const drag = useReorderDrag(draft.moveItem);
  const adjustedItems = draft.items.filter((item) => item.adjustments.length > 0).length;

  /**
   * Enregistre, le dit, et rend la séance enregistrée — ou `null` quand il faut rester : échec
   * (déjà annoncé), ou séance sans titre.
   *
   * Le titre est vérifié ICI parce que deux gestes enregistrent sans passer par le bouton, qui,
   * lui, reste fermé sans titre : « Dupliquer en variante » et « Créer l'exercice manquant »
   * (#303). Ils quittent la séance pour l'éditeur d'exercice, et l'enregistrent d'abord — sans
   * ça tout ce que le coach vient de composer disparaît, et le geste qui devait l'aider lui coûte
   * son travail. Sans titre, rien ne part : le champ le réclame, plutôt qu'un échec du serveur
   * qui ne dirait pas pourquoi.
   *
   * Une saisie refusée retient de même (#566) : ces deux gestes enregistreraient l'ANCIENNE
   * valeur, puis quitteraient la séance — la saisie disparaîtrait sans que rien ne l'ait dit.
   */
  async function save(successKey: string): Promise<SessionDto | null> {
    if (draft.trimmedTitle === "") {
      setTitleTouched(true);
      toast.error(t("library.session.titleBeforeLeaving"));
      return null;
    }
    if (refused.hasRefused) {
      toast.error(t("library.session.refusedBeforeLeaving"));
      return null;
    }
    try {
      const saved = await draft.submit();
      toast.success(t(successKey));
      return saved;
    } catch (error) {
      onFailure("library.session.saveFailed", error);
      return null;
    }
  }

  async function onSubmit() {
    if ((await save("library.session.saved")) == null) return;
    guard.release();
    onLeave();
  }

  function onPick(exercise: ExerciseDto) {
    draft.addExercise(exercise);
    setPicking(false);
  }

  async function onDuplicate(exerciseId: string, blocks: ExerciseBlocks) {
    if ((await save("library.session.savedBeforeVariant")) == null) return;
    duplicate.mutate(
      { exerciseId, suffix: t("library.session.variantSuffix"), blocks },
      {
        onSuccess: (created) => {
          guard.release();
          navigate({
            to: "/library/exercises/$exerciseId",
            params: { exerciseId: created.id },
          });
        },
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
      subtitle={t("library.session.subtitle", {
        count: draft.items.length,
        adjusted: adjustedItems,
      })}
      actions={
        <>
          <CmvButton variant="ghost" onClick={onLeave} disabled={draft.isSaving}>
            {t("library.builder.cancel")}
          </CmvButton>
          <CmvButton
            onClick={onSubmit}
            disabled={draft.isSaving || draft.trimmedTitle === "" || blockedBy != null}
            title={blockedBy}
          >
            {submitLabel(draft.isSaving, session != null, t)}
          </CmvButton>
        </>
      }
    >
      <RefusedFieldsContext value={refused.report}>
        <div className="grid gap-cmv-xl xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-cmv-xl">
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
                requiredMark
              />
              {titleTouched && draft.trimmedTitle === "" ? (
                <p className="text-cmv-caption text-cmv-error">
                  {t("library.session.titleRequired")}
                </p>
              ) : null}
              <p className="text-cmv-caption text-cmv-text-lo">{t("common.requiredLegend")}</p>
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

            <div className="flex flex-col gap-cmv-sm">
              <span className="text-cmv-caption text-cmv-text-mid">
                {t("library.session.composition")}
              </span>

              {draft.items.length === 0 ? (
                <CmvEmptyState
                  title={t("library.session.emptyTitle")}
                  description={t("library.session.emptyDescription")}
                />
              ) : null}

              {draft.items.map((item, index) => (
                <div
                  key={item.key}
                  {...drag.rowProps(index)}
                  className={cn(drag.isDragging(index) && "opacity-40")}
                >
                  <CompositionCard
                    item={item}
                    customMetrics={metrics}
                    isReloading={reload.isPending}
                    isDropTarget={drag.isOver(index)}
                    isFirst={index === 0}
                    isLast={index === draft.items.length - 1}
                    onMove={(direction) => draft.moveItem(index, index + direction)}
                    dragHandle={
                      <CmvDragHandle
                        label={`${t("library.session.moveExercise")} ${index + 1}`}
                        {...drag.handleProps(index)}
                        onMove={(direction) => draft.moveItem(index, index + direction)}
                      />
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
                      // `CompositionCard` ferme « Recharger » sur une ligne sans id.
                      reload.mutate(required(item.id, "rechargement d'une ligne sans id"), {
                        onSuccess: (reloaded, sessionExerciseId) =>
                          draft.applyReloaded(sessionExerciseId, reloaded),
                      });
                    }}
                    onDuplicate={() => onDuplicate(item.exerciseId, item.blocks)}
                    onRemove={() => draft.removeItem(item.key)}
                  />
                </div>
              ))}

              {/* Le sélecteur s'ouvre AU CENTRE, comme le choix de structure du constructeur
                d'exercice : même geste, même endroit. La colonne de droite ne porte que l'aperçu. */}
              {picking ? (
                <div className="flex flex-col gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-bg-1 p-cmv-md">
                  <LibraryPicker
                    customMetrics={metrics}
                    onPick={onPick}
                    onCreateMissing={onCreateMissing}
                    isSaving={draft.isSaving}
                  />
                  <div>
                    <CmvButton variant="ghost" onClick={() => setPicking(false)}>
                      {t("library.builder.cancel")}
                    </CmvButton>
                  </div>
                </div>
              ) : (
                <div>
                  <CmvButton variant="secondary" onClick={() => setPicking(true)}>
                    {t("library.session.pickerTitle")}
                  </CmvButton>
                </div>
              )}
            </div>

            <CmvFormError error={draft.error} />
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

/** Enregistrement en cours · création · édition — trois libellés, un seul endroit pour les lire. */
function submitLabel(isSaving: boolean, isEditing: boolean, t: TFunction): string {
  if (isSaving) return t("library.builder.saving");
  return t(isEditing ? "library.session.submitEdit" : "library.session.submitCreate");
}
