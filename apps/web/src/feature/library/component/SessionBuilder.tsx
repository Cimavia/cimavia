import type { ExerciseDto, SessionDto } from "@cmv/shared";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { CompositionEditor } from "@/feature/library/component/CompositionEditor";
import { ExercisePicker } from "@/feature/library/component/ExercisePicker";
import { type CompositionRow, useComposition } from "@/feature/library/hook/useComposition";
import { useExercises } from "@/feature/library/hook/useExercises";
import { useDeleteSession, useSaveSession } from "@/feature/library/hook/useSessions";
import {
  CmvButton,
  CmvConfirmButton,
  CmvPanel,
  CmvTextArea,
  CmvTextField,
} from "@/shared/component";
import { apiErrorMessage } from "@/shared/lib/api";

/**
 * Ligne de composition d'une séance MODÈLE. `exerciseId` est NON NULL : le modèle RÉFÉRENCE
 * l'exercice de la bibliothèque — supprimer celui-ci est refusé tant qu'un modèle l'utilise (409).
 * C'est l'inverse de la séance planifiée, qui en garde une copie autonome.
 */
type BuilderItem = CompositionRow & { exerciseId: string };

function toBuilderItems(session: SessionDto | null): BuilderItem[] {
  if (session == null) return [];
  return session.exercises.map((exercise) => ({
    key: exercise.id,
    exerciseId: exercise.exerciseId,
    title: exercise.title,
    tags: exercise.tags,
    prescription: exercise.prescription ?? "",
  }));
}

function toBuilderRow(exercise: ExerciseDto): Omit<BuilderItem, "key"> {
  return {
    exerciseId: exercise.id,
    title: exercise.title,
    tags: exercise.tags,
    prescription: "",
  };
}

type SessionBuilderProps = {
  open: boolean;
  // null = création ; sinon édition.
  session: SessionDto | null;
  onClose: () => void;
};

export function SessionBuilder({ open, session, onClose }: Readonly<SessionBuilderProps>) {
  const { t } = useTranslation();
  const { save, isSaving, error } = useSaveSession();
  const removeSession = useDeleteSession();
  const { data: exercises } = useExercises({});

  const [title, setTitle] = useState(session?.title ?? "");
  const [notes, setNotes] = useState(session?.notes ?? "");
  const { items, addExercise, removeItem, moveItem, setPrescription } = useComposition<BuilderItem>(
    () => toBuilderItems(session),
    toBuilderRow,
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await save({
      session,
      input: {
        title: title.trim(),
        // Champs vides → null (nullable, pas de fallback silencieux).
        notes: notes.trim() || null,
        exercises: items.map((item) => ({
          exerciseId: item.exerciseId,
          prescription: item.prescription.trim() || null,
        })),
      },
    });
    onClose();
  }

  const errorMessage = apiErrorMessage(error) ?? apiErrorMessage(removeSession.error);

  const isEditing = session != null;
  const isBusy = isSaving || removeSession.isPending;
  const submitLabelKey = isEditing ? "library.session.submitEdit" : "library.session.submitCreate";
  const submitLabel = isSaving ? t("library.session.submitting") : t(submitLabelKey);

  function onDelete() {
    if (session == null) return;
    // `mutate` (et non mutateAsync) : l'erreur atterrit dans removeSession.error, pas en rejet.
    removeSession.mutate(session.id, { onSuccess: onClose });
  }

  return (
    <CmvPanel
      open={open}
      size="lg"
      title={isEditing ? t("library.session.editTitle") : t("library.session.createTitle")}
      description={t("library.session.panelDescription")}
      onClose={onClose}
      footer={
        <>
          {isEditing ? (
            <CmvConfirmButton
              label={t("library.session.deleteSession")}
              confirmLabel={t("common.confirmDelete")}
              cancelLabel={t("common.cancel")}
              disabled={isBusy}
              onConfirm={onDelete}
            />
          ) : null}
          <div className="flex-1" />
          <CmvButton variant="ghost" onClick={onClose} disabled={isBusy}>
            {t("library.session.cancel")}
          </CmvButton>
          <CmvButton type="submit" onClick={onSubmit} disabled={isBusy || !title.trim()}>
            {submitLabel}
          </CmvButton>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-cmv-xl lg:flex-row">
        {/* Colonne gauche : la séance elle-même */}
        <section className="flex flex-1 flex-col gap-cmv-xl">
          <CmvTextField
            label={t("library.session.titleLabel")}
            name="sessionTitle"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("library.session.titlePlaceholder")}
            required
          />

          <CmvTextArea
            label={t("library.session.notesLabel")}
            name="sessionNotes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={t("library.session.notesPlaceholder")}
            rows={3}
          />

          <CompositionEditor
            items={items}
            labelPrefix="library.session"
            onMove={moveItem}
            onRemove={removeItem}
            onPrescriptionChange={setPrescription}
          />

          {errorMessage == null ? null : (
            <p className="text-cmv-caption text-cmv-error">{errorMessage}</p>
          )}
        </section>

        {/* Colonne droite : la bibliothèque d'exercices dans laquelle piocher */}
        <ExercisePicker
          exercises={exercises ?? []}
          onPick={addExercise}
          labelPrefix="library.session"
          searchable
        />
      </form>
    </CmvPanel>
  );
}
