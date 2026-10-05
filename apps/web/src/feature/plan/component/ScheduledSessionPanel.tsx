import type { PlanWeekDto, ScheduledSessionDto } from "@cmv/shared";
import { planWeekDays, required, ScheduledSessionStatus } from "@cmv/shared";
import { type SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCustomMetrics } from "@/feature/library/hook/useCustomMetrics";
import { useExercises } from "@/feature/library/hook/useExercises";
import { useSessions } from "@/feature/library/hook/useSessions";
import { CompositionEditor } from "@/feature/plan/component/CompositionEditor";
import { ExercisePicker } from "@/feature/plan/component/ExercisePicker";
import {
  ScheduledDosageLegend,
  scheduledDosageDetail,
} from "@/feature/plan/component/ScheduledDosage";
import { SessionPanelFooter } from "@/feature/plan/component/SessionPanelFooter";
import { usePlanMutations } from "@/feature/plan/hook/usePlan";
import {
  type EditorItem,
  toExerciseInput,
  useSessionComposition,
} from "@/feature/plan/hook/useSessionComposition";
import { CmvPanel, CmvSelect, CmvTextArea, CmvTextField } from "@/shared/component";
import { RefusedFieldsContext, useRefusedFields } from "@/shared/hook/useRefusedFields";
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
 * Édition : replace-all — ce qu'on envoie EST la nouvelle vérité de la séance (le détail de chaque
 * ligne est dans `toExerciseInput`).
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
    exercises: items.map(toExerciseInput),
  };
}

type ScheduledSessionPanelProps = {
  planId: string;
  // Cycle diffusé : retirer une séance prévient l'athlète, le panneau l'annonce avant confirmation.
  isPublished: boolean;
  week: PlanWeekDto;
  // Jour cliqué (création) ou jour de la séance (édition).
  date: string;
  // null = création d'une séance ; sinon édition de cette instance.
  session: ScheduledSessionDto | null;
  /**
   * Pour qui le dosage s'ajuste, tel qu'il s'écrit (`useAthleteLabel`), ou `null` sur un cycle
   * dont le destinataire n'est pas encore choisi : la légende dit alors « l'athlète ».
   */
  athleteName: string | null;
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
  isPublished,
  week,
  date,
  session,
  athleteName,
  onClose,
}: Readonly<ScheduledSessionPanelProps>) {
  const { t } = useTranslation();
  const { createSession, saveSession, removeSession, isBusy } = usePlanMutations(planId);
  const { data: templates } = useSessions();
  const { data: exercises } = useExercises({});
  // Une valeur refusée reste dans sa cellule mais pas dans le brouillon : enregistrer enverrait
  // l'ancienne (#566).
  const refused = useRefusedFields();

  const isEditing = session != null;

  const [sourceSessionId, setSourceSessionId] = useState("");
  const [title, setTitle] = useState(session?.title ?? "");
  const [notes, setNotes] = useState(session?.notes ?? "");
  const [scheduledDate, setScheduledDate] = useState(date);
  const composition = useSessionComposition(session);

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    // Entrée dans un champ soumet aussi le formulaire : le bouton fermé ne suffit pas.
    if (refused.hasRefused) return;

    if (!isEditing) {
      createSession.mutate(
        { weekId: week.id, input: toCreateInput(sourceSessionId, title, scheduledDate) },
        { onSuccess: onClose },
      );
      return;
    }

    saveSession.mutate(
      { sessionId: session.id, input: toSaveInput(title, notes, scheduledDate, composition.items) },
      { onSuccess: onClose },
    );
  }

  // « Supprimer » n'est offert qu'en édition, donc sur une séance existante.
  function onDelete() {
    removeSession.mutate(required(session, "suppression hors édition").id, { onSuccess: onClose });
  }

  const dayOptions = required(planWeekDays(week.startDate), "lundi de semaine illisible").map(
    (day) => ({
      value: day,
      label: formatDayLabel(day),
    }),
  );

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
          isDebriefed={session?.status === ScheduledSessionStatus.DONE}
          isPublished={isPublished}
          isBusy={isBusy}
          canSubmit={canSubmit}
          hasRefused={refused.hasRefused}
          onDelete={onDelete}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      }
    >
      <RefusedFieldsContext value={refused.report}>
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
              // La légende suit le champ dans son apparition : choisir un modèle retire le titre, et
              // laisserait sinon une légende qui n'explique plus aucun astérisque.
              <div className="flex flex-col gap-cmv-xs">
                <CmvTextField
                  label={t("plan.session.titleLabel")}
                  name="sessionTitle"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t("plan.session.titlePlaceholder")}
                  required
                  requiredMark
                />
                <p className="text-cmv-caption text-cmv-text-lo">{t("common.requiredLegend")}</p>
              </div>
            ) : (
              <p className="text-cmv-caption text-cmv-text-lo">{t("plan.session.templateHint")}</p>
            )}

            {isEditing ? (
              <EditedSessionFields
                session={session}
                athleteName={athleteName}
                notes={notes}
                onNotesChange={setNotes}
                composition={composition}
              />
            ) : null}
          </section>

          {/* En édition seulement : la bibliothèque dans laquelle piocher des exercices. */}
          {isEditing ? (
            <ExercisePicker exercises={exercises ?? []} onPick={composition.addExercise} />
          ) : null}
        </form>
      </RefusedFieldsContext>
    </CmvPanel>
  );
}

type EditedSessionFieldsProps = {
  session: ScheduledSessionDto;
  athleteName: string | null;
  notes: string;
  onNotesChange: (notes: string) => void;
  composition: ReturnType<typeof useSessionComposition>;
};

/**
 * Ce que seule l'édition montre : les consignes, et la composition dont chaque exercice se dose
 * pour l'athlète (#518).
 */
function EditedSessionFields({
  session,
  athleteName,
  notes,
  onNotesChange,
  composition,
}: Readonly<EditedSessionFieldsProps>) {
  const { t } = useTranslation();
  const { data: customMetrics } = useCustomMetrics();
  const forWhom = athleteName ?? t("plan.session.dosage.theAthlete");

  return (
    <>
      <CmvTextArea
        label={t("plan.session.notesLabel")}
        name="sessionNotes"
        value={notes}
        onChange={(event) => onNotesChange(event.target.value)}
        placeholder={t("plan.session.notesPlaceholder")}
        rows={3}
      />

      <ScheduledDosageLegend
        adjustedCount={composition.adjustedCount}
        athleteName={forWhom}
        sourceSessionId={session.sourceSessionId}
      />

      <CompositionEditor
        items={composition.items}
        onMove={composition.moveItem}
        onMoveTo={composition.moveTo}
        onRemove={composition.removeItem}
        onNoteChange={composition.setNote}
        detail={scheduledDosageDetail(forWhom, customMetrics ?? [], composition.dosage)}
      />
    </>
  );
}
