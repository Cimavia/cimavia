import type { ExerciseDto, SessionDto } from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CompositionCard } from "@/feature/library/component/CompositionCard";
import { LibraryPicker } from "@/feature/library/component/LibraryPicker";
import { SessionPreview } from "@/feature/library/component/SessionPreview";
import { useCustomMetrics } from "@/feature/library/hook/useCustomMetrics";
import { useDuplicateExercise } from "@/feature/library/hook/useExercises";
import { useSessionDraft } from "@/feature/library/hook/useSessionDraft";
import { useReloadSessionExercise, useSession } from "@/feature/library/hook/useSessions";
import {
  CmvAppShell,
  CmvButton,
  CmvDragHandle,
  CmvEmptyState,
  CmvErrorState,
  CmvTextArea,
  CmvTextField,
  useToast,
} from "@/shared/component";
import { useReorderDrag } from "@/shared/hook/useReorderDrag";
import { apiErrorMessage } from "@/shared/lib/api";
import { cn } from "@/shared/util/cn.util";

type SessionBuilderScreenProps = {
  /** Absent = création. Sinon la séance est chargée depuis l'URL. */
  sessionId?: string | undefined;
};

/**
 * Le constructeur de séance (#165) — pleine page, aperçu athlète de la séance ENTIÈRE.
 *
 * Ce qu'on y ajuste, ce sont des VALEURS : la structure, les colonnes et la consigne restent
 * celles de la bibliothèque. Sans ce verrou, cet écran redeviendrait le constructeur d'exercice
 * et la notion de défaut se diluerait.
 */
export function SessionBuilderScreen({ sessionId }: Readonly<SessionBuilderScreenProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: session, isPending, isError, refetch } = useSession(sessionId);

  if (sessionId != null && isPending) {
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
      onLeave={() => navigate({ to: "/library" })}
    />
  );
}

function SessionBuilder({
  session,
  onLeave,
}: Readonly<{ session: SessionDto | null; onLeave: () => void }>) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: customMetrics } = useCustomMetrics();
  const draft = useSessionDraft(session);
  const reload = useReloadSessionExercise(session?.id);
  const duplicate = useDuplicateExercise();
  const [titleTouched, setTitleTouched] = useState(false);

  const metrics = customMetrics ?? [];
  const drag = useReorderDrag(draft.moveItem);
  const adjustedItems = draft.items.filter((item) => item.adjustments.length > 0).length;

  async function onSubmit() {
    try {
      await draft.submit();
    } catch {
      toast.error(t("library.session.saveFailed"));
      return;
    }
    toast.success(t("library.session.saved"));
    onLeave();
  }

  function onPick(exercise: ExerciseDto) {
    draft.addExercise(exercise);
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
          <CmvButton onClick={onSubmit} disabled={draft.isSaving || draft.trimmedTitle === ""}>
            {draft.isSaving
              ? t("library.builder.saving")
              : t(session == null ? "library.session.submitCreate" : "library.session.submitEdit")}
          </CmvButton>
        </>
      }
    >
      <div className="grid gap-cmv-xl xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-cmv-xl">
          <CmvTextField
            label={t("library.session.titleLabel")}
            name="title"
            value={draft.title}
            onChange={(event) => draft.setTitle(event.target.value)}
            onBlur={() => setTitleTouched(true)}
            placeholder={t("library.session.titlePlaceholder")}
            required
            requiredMark
          />
          {titleTouched && draft.trimmedTitle === "" ? (
            <p className="text-cmv-caption text-cmv-error">{t("library.session.titleRequired")}</p>
          ) : null}

          <CmvTextArea
            label={t("library.session.notesLabel")}
            name="notes"
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
                className={cn(
                  drag.isDragging(index) && "opacity-40",
                  drag.isOver(index) && "rounded-cmv-md bg-cmv-accent-soft",
                )}
              >
                <CompositionCard
                  item={item}
                  customMetrics={metrics}
                  isReloading={reload.isPending}
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
                  onRowsChange={(blockId, rows) => draft.setRows(item.key, blockId, rows as never)}
                  onRevertCell={(blockId, rowId, metricId) =>
                    draft.revertCell(item.key, blockId, rowId, metricId)
                  }
                  onResetAll={() => draft.resetItem(item.key)}
                  onReload={() => {
                    if (item.id != null) reload.mutate(item.id);
                  }}
                  onDuplicate={() =>
                    duplicate.mutate(
                      { exerciseId: item.exerciseId, suffix: t("library.session.variantSuffix") },
                      {
                        // On ouvre la VARIANTE : c'est elle que le coach veut retravailler, et
                        // la séance en cours est déjà enregistrée ou reste ouverte derrière.
                        onSuccess: (created) =>
                          navigate({
                            to: "/library/exercises/$exerciseId",
                            params: { exerciseId: created.id },
                          }),
                      },
                    )
                  }
                  onRemove={() => draft.removeItem(item.key)}
                />
              </div>
            ))}
          </div>

          {draft.error == null ? null : (
            <p className="text-cmv-caption text-cmv-error">{apiErrorMessage(draft.error)}</p>
          )}
        </div>

        <div className="flex flex-col gap-cmv-xl">
          <LibraryPicker customMetrics={metrics} onPick={onPick} />
          <SessionPreview items={draft.items} customMetrics={metrics} />
        </div>
      </div>
    </CmvAppShell>
  );
}
