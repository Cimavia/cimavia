import type { ExerciseCategory, ExerciseDto, PlanWeekDto, ScheduledSessionDto } from "@cmv/shared";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useExercises } from "@/feature/library/hook/useExercises";
import { useSessions } from "@/feature/library/hook/useSessions";
import { weekDays } from "@/feature/plan/constant";
import { usePlanMutations } from "@/feature/plan/hook/usePlan";
import {
  CmvBadge,
  CmvButton,
  CmvConfirmButton,
  CmvEmptyState,
  CmvPanel,
  CmvSelect,
  CmvTextArea,
  CmvTextField,
} from "@/shared/component";
import { apiErrorMessage } from "@/shared/lib/api";
import { formatDayLabel } from "@/shared/util/date.util";

// Ligne de composition en cours d'édition. `key` est locale et stable : un même exercice peut
// figurer deux fois dans une séance, l'id source ne suffit donc pas à l'identifier.
type EditorItem = {
  key: string;
  sourceExerciseId: string | null;
  title: string;
  description: string | null;
  category: ExerciseCategory;
  prescription: string;
};

function toEditorItems(session: ScheduledSessionDto | null): EditorItem[] {
  if (session == null) return [];
  return session.exercises.map((exercise) => ({
    key: exercise.id,
    sourceExerciseId: exercise.sourceExerciseId,
    title: exercise.title,
    description: exercise.description,
    category: exercise.category,
    prescription: exercise.prescription ?? "",
  }));
}

type ScheduledSessionPanelProps = {
  planId: string;
  week: PlanWeekDto;
  // Jour cliqué (création) ou jour de la séance (édition).
  date: string;
  // null = création d'une séance ; sinon édition de cette instance.
  session: ScheduledSessionDto | null;
  onClose: () => void;
};

/**
 * Création puis édition d'une séance planifiée.
 * - Création : on choisit un MODÈLE de la bibliothèque (l'API en copie titre, consignes,
 *   exercices et documents) ou on part d'une séance vide.
 * - Édition : replace-all — la séance renvoyée EST la nouvelle vérité. La bibliothèque, elle,
 *   ne bouge jamais : cette séance est une copie (CDC §5.4).
 */
export function ScheduledSessionPanel({
  planId,
  week,
  date,
  session,
  onClose,
}: Readonly<ScheduledSessionPanelProps>) {
  const { t } = useTranslation();
  const { createSession, saveSession, removeSession, isBusy, error } = usePlanMutations(planId);
  const { data: templates } = useSessions();
  const { data: exercises } = useExercises({});

  const isEditing = session != null;

  const [sourceSessionId, setSourceSessionId] = useState("");
  const [title, setTitle] = useState(session?.title ?? "");
  const [notes, setNotes] = useState(session?.notes ?? "");
  const [scheduledDate, setScheduledDate] = useState(date);
  const [items, setItems] = useState<EditorItem[]>(() => toEditorItems(session));

  function addExercise(exercise: ExerciseDto) {
    setItems((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        sourceExerciseId: exercise.id,
        title: exercise.title,
        description: exercise.description,
        category: exercise.category,
        prescription: "",
      },
    ]);
  }

  function removeItem(key: string) {
    setItems((current) => current.filter((item) => item.key !== key));
  }

  // Déplace une ligne d'un cran ; la position finale = l'ordre du tableau (l'API la déduit).
  function moveItem(index: number, direction: -1 | 1) {
    setItems((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (moved == null) return current;
      next.splice(target, 0, moved);
      return next;
    });
  }

  function setPrescription(key: string, value: string) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, prescription: value } : item)),
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (!isEditing) {
      await createSession.mutateAsync({
        weekId: week.id,
        input: {
          // Depuis un modèle → l'API copie tout ; sinon séance vide (titre obligatoire).
          sourceSessionId: sourceSessionId === "" ? null : sourceSessionId,
          scheduledDate,
          ...(sourceSessionId === "" ? { title: title.trim() } : {}),
        },
      });
      onClose();
      return;
    }

    await saveSession.mutateAsync({
      sessionId: session.id,
      input: {
        title: title.trim(),
        // Champ vide → null (nullable, pas de fallback silencieux).
        notes: notes.trim() || null,
        scheduledDate,
        exercises: items.map((item) => ({
          sourceExerciseId: item.sourceExerciseId,
          title: item.title,
          description: item.description,
          category: item.category,
          prescription: item.prescription.trim() || null,
        })),
      },
    });
    onClose();
  }

  function onDelete() {
    if (session == null) return;
    removeSession.mutate(session.id, { onSuccess: onClose });
  }

  const dayOptions = weekDays(week.startDate).map((day) => ({
    value: day,
    label: formatDayLabel(day),
  }));

  const canSubmit = isEditing || sourceSessionId !== "" || title.trim() !== "";
  const errorMessage = apiErrorMessage(error);

  return (
    <CmvPanel
      open
      size={isEditing ? "lg" : "md"}
      title={isEditing ? t("plan.session.editTitle") : t("plan.session.createTitle")}
      description={t("plan.session.panelDescription")}
      onClose={onClose}
      footer={
        <>
          {isEditing ? (
            <CmvConfirmButton
              label={t("plan.session.delete")}
              confirmLabel={t("common.confirmDelete")}
              cancelLabel={t("common.cancel")}
              disabled={isBusy}
              onConfirm={onDelete}
            />
          ) : null}
          <div className="flex-1" />
          <CmvButton variant="ghost" onClick={onClose} disabled={isBusy}>
            {t("common.cancel")}
          </CmvButton>
          <CmvButton type="submit" onClick={onSubmit} disabled={isBusy || !canSubmit}>
            {isBusy ? t("plan.session.submitting") : t("plan.session.submit")}
          </CmvButton>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-cmv-xl lg:flex-row">
        <section className="flex flex-1 flex-col gap-cmv-lg">
          <CmvSelect
            label={t("plan.session.day")}
            name="scheduledDate"
            value={scheduledDate}
            onChange={(event) => setScheduledDate(event.target.value)}
            options={dayOptions}
          />

          {isEditing ? null : (
            <CmvSelect
              label={t("plan.session.template")}
              name="sourceSessionId"
              value={sourceSessionId}
              onChange={(event) => setSourceSessionId(event.target.value)}
              placeholder={t("plan.session.templateNone")}
              options={(templates ?? []).map((template) => ({
                value: template.id,
                label: template.title,
              }))}
            />
          )}

          {/* Sans modèle, la séance part vide : il lui faut au moins un titre. */}
          {isEditing || sourceSessionId === "" ? (
            <CmvTextField
              label={t("plan.session.titleLabel")}
              name="sessionTitle"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("plan.session.titlePlaceholder")}
              required
            />
          ) : (
            <p className="text-cmv-caption text-cmv-text-lo">{t("plan.session.templateHint")}</p>
          )}

          {isEditing ? (
            <>
              <CmvTextArea
                label={t("plan.session.notesLabel")}
                name="sessionNotes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={t("plan.session.notesPlaceholder")}
                rows={3}
              />

              <div className="flex flex-col gap-cmv-sm">
                <span className="text-cmv-caption text-cmv-text-mid">
                  {t("plan.session.composition")}
                </span>

                {items.length === 0 ? (
                  <CmvEmptyState
                    title={t("plan.session.emptyComposition")}
                    description={t("plan.session.emptyCompositionHint")}
                  />
                ) : null}

                {items.map((item, index) => (
                  <div
                    key={item.key}
                    className="flex flex-col gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-surface p-cmv-md"
                  >
                    <div className="flex items-center gap-cmv-sm">
                      <span className="text-cmv-caption text-cmv-text-lo">{index + 1}</span>
                      <span className="flex-1 truncate text-cmv-body text-cmv-text-hi">
                        {item.title}
                      </span>
                      <CmvBadge variant="accent">{t(`library.category.${item.category}`)}</CmvBadge>
                      <CmvButton
                        variant="ghost"
                        title={t("plan.session.moveUp")}
                        disabled={index === 0}
                        onClick={() => moveItem(index, -1)}
                      >
                        ↑
                      </CmvButton>
                      <CmvButton
                        variant="ghost"
                        title={t("plan.session.moveDown")}
                        disabled={index === items.length - 1}
                        onClick={() => moveItem(index, 1)}
                      >
                        ↓
                      </CmvButton>
                      <CmvButton variant="danger" onClick={() => removeItem(item.key)}>
                        {t("plan.session.remove")}
                      </CmvButton>
                    </div>

                    <CmvTextField
                      label={t("plan.session.prescriptionLabel")}
                      name={`prescription-${item.key}`}
                      value={item.prescription}
                      onChange={(event) => setPrescription(item.key, event.target.value)}
                      placeholder={t("plan.session.prescriptionPlaceholder")}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {errorMessage == null ? null : (
            <p className="text-cmv-caption text-cmv-error">{errorMessage}</p>
          )}
        </section>

        {/* En édition seulement : la bibliothèque dans laquelle piocher des exercices. */}
        {isEditing ? (
          <aside className="flex w-full flex-col gap-cmv-sm lg:w-72">
            <span className="text-cmv-caption text-cmv-text-mid">
              {t("plan.session.pickerTitle")}
            </span>
            <div className="flex max-h-96 flex-col gap-cmv-xs overflow-y-auto">
              {(exercises ?? []).map((exercise) => (
                <button
                  key={exercise.id}
                  type="button"
                  onClick={() => addExercise(exercise)}
                  className="flex items-center justify-between gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm text-left transition-colors hover:border-cmv-border-hi hover:bg-cmv-surface-hi"
                >
                  <span className="truncate text-cmv-body text-cmv-text-hi">{exercise.title}</span>
                  <CmvBadge>{t(`library.category.${exercise.category}`)}</CmvBadge>
                </button>
              ))}
            </div>
          </aside>
        ) : null}
      </form>
    </CmvPanel>
  );
}
