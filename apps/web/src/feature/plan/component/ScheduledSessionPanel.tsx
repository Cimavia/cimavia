import type { PlanWeekDto, ScheduledSessionDto } from "@cmv/shared";
import { planWeekDays } from "@cmv/shared";
import { type SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { CompositionEditor } from "@/feature/library/component/CompositionEditor";
import { ExercisePicker } from "@/feature/library/component/ExercisePicker";
import { useExercises } from "@/feature/library/hook/useExercises";
import { useSessions } from "@/feature/library/hook/useSessions";
import { SessionPanelFooter } from "@/feature/plan/component/SessionPanelFooter";
import { usePlanMutations } from "@/feature/plan/hook/usePlan";
import { type EditorItem, useSessionComposition } from "@/feature/plan/hook/useSessionComposition";
import { CmvPanel, CmvSelect, CmvTextArea, CmvTextField } from "@/shared/component";
import { formatDayLabel } from "@/shared/util/date.util";

/**
 * Création : depuis un MODÈLE, l'API copie titre, consignes, exercices et documents — on ne lui
 * envoie donc pas de titre. Sans modèle, la séance part vide et le titre devient obligatoire.
 */
function toCreateInput(sourceSessionId: string, title: string, scheduledDate: string) {
  const fromTemplate = sourceSessionId !== "";
  return {
    sourceSessionId: fromTemplate ? sourceSessionId : null,
    scheduledDate,
    ...(fromTemplate ? {} : { title: title.trim() }),
  };
}

/**
 * Édition : replace-all — ce qu'on envoie EST la nouvelle vérité de la séance.
 *
 * D'où le renvoi INTÉGRAL du snapshot, y compris ce que ce panneau ne touche pas : consigne,
 * dosage, métriques maison, ajustements. Omettre un champ ne le laisse pas tel quel, ça l'efface —
 * et une séance diffusée qui perd ses blocs ne dit plus à l'athlète ce qu'il doit faire.
 *
 * `id` rattache la ligne à l'exercice diffusé qu'elle remplace : c'est ce qui permet au serveur
 * de reporter le SUIVI de l'athlète, qui ne passe jamais par ici.
 */
function toSaveInput(
  title: string,
  notes: string,
  scheduledDate: string,
  items: readonly EditorItem[],
) {
  return {
    title: title.trim(),
    // Champ vide → null (nullable, pas de fallback silencieux).
    notes: notes.trim() || null,
    scheduledDate,
    exercises: items.map((item) => ({
      ...(item.id == null ? {} : { id: item.id }),
      sourceExerciseId: item.sourceExerciseId,
      title: item.title,
      description: item.description,
      tags: item.tags,
      note: item.note.trim() || null,
      instructions: item.snapshot.instructions,
      blocks: item.snapshot.blocks,
      ...(item.snapshot.customMetrics == null
        ? {}
        : { customMetrics: item.snapshot.customMetrics }),
      adjustments: item.snapshot.adjustments,
    })),
  };
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
  const { createSession, saveSession, removeSession, isBusy } = usePlanMutations(planId);
  const { data: templates } = useSessions();
  const { data: exercises } = useExercises({});

  const isEditing = session != null;

  const [sourceSessionId, setSourceSessionId] = useState("");
  const [title, setTitle] = useState(session?.title ?? "");
  const [notes, setNotes] = useState(session?.notes ?? "");
  const [scheduledDate, setScheduledDate] = useState(date);
  const { items, addExercise, removeItem, moveItem, setNote } = useSessionComposition(session);

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();

    if (!isEditing) {
      createSession.mutate(
        { weekId: week.id, input: toCreateInput(sourceSessionId, title, scheduledDate) },
        { onSuccess: onClose },
      );
      return;
    }

    saveSession.mutate(
      { sessionId: session.id, input: toSaveInput(title, notes, scheduledDate, items) },
      { onSuccess: onClose },
    );
  }

  function onDelete() {
    if (session == null) return;
    removeSession.mutate(session.id, { onSuccess: onClose });
  }

  const dayOptions = (planWeekDays(week.startDate) ?? []).map((day) => ({
    value: day,
    label: formatDayLabel(day),
  }));

  const canSubmit = isEditing || sourceSessionId !== "" || title.trim() !== "";

  return (
    <CmvPanel
      open
      size={isEditing ? "lg" : "md"}
      title={isEditing ? t("plan.session.editTitle") : t("plan.session.createTitle")}
      description={t("plan.session.panelDescription")}
      onClose={onClose}
      footer={
        <SessionPanelFooter
          isEditing={isEditing}
          isBusy={isBusy}
          canSubmit={canSubmit}
          onDelete={onDelete}
          onClose={onClose}
          onSubmit={onSubmit}
        />
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

              <CompositionEditor
                items={items}
                labelPrefix="plan.session"
                onMove={moveItem}
                onRemove={removeItem}
                onNoteChange={setNote}
              />
            </>
          ) : null}
        </section>

        {/* En édition seulement : la bibliothèque dans laquelle piocher des exercices. */}
        {isEditing ? (
          <ExercisePicker
            exercises={exercises ?? []}
            onPick={addExercise}
            labelPrefix="plan.session"
          />
        ) : null}
      </form>
    </CmvPanel>
  );
}
