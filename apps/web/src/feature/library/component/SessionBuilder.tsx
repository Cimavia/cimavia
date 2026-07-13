import type { ExerciseCategory, ExerciseDto, SessionDto } from "@cmv/shared";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useExercises } from "@/feature/library/hook/useExercises";
import { useDeleteSession, useSaveSession } from "@/feature/library/hook/useSessions";
import {
  CmvBadge,
  CmvButton,
  CmvConfirmButton,
  CmvEmptyState,
  CmvPanel,
  CmvTextArea,
  CmvTextField,
} from "@/shared/component";
import { apiErrorMessage } from "@/shared/lib/api";

// Ligne de composition en cours d'édition. `key` est une clé locale stable (un même exercice
// peut figurer plusieurs fois dans une séance — l'exerciseId ne suffit donc pas).
type BuilderItem = {
  key: string;
  exerciseId: string;
  title: string;
  category: ExerciseCategory;
  prescription: string;
};

function toBuilderItems(session: SessionDto | null): BuilderItem[] {
  if (session == null) return [];
  return session.exercises.map((exercise) => ({
    key: exercise.id,
    exerciseId: exercise.exerciseId,
    title: exercise.title,
    category: exercise.category,
    prescription: exercise.prescription ?? "",
  }));
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
  const [items, setItems] = useState<BuilderItem[]>(() => toBuilderItems(session));
  const [pickerSearch, setPickerSearch] = useState("");

  function addExercise(exercise: ExerciseDto) {
    setItems((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        exerciseId: exercise.id,
        title: exercise.title,
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

  const search = pickerSearch.trim().toLowerCase();
  const pickable = (exercises ?? []).filter((exercise) =>
    search ? exercise.title.toLowerCase().includes(search) : true,
  );

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

          <div className="flex flex-col gap-cmv-sm">
            <span className="text-cmv-caption text-cmv-text-mid">
              {t("library.session.composition")}
            </span>

            {items.length === 0 ? (
              <CmvEmptyState
                title={t("library.session.emptyComposition")}
                description={t("library.session.emptyCompositionHint")}
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
                    title={t("library.session.moveUp")}
                    disabled={index === 0}
                    onClick={() => moveItem(index, -1)}
                  >
                    ↑
                  </CmvButton>
                  <CmvButton
                    variant="ghost"
                    title={t("library.session.moveDown")}
                    disabled={index === items.length - 1}
                    onClick={() => moveItem(index, 1)}
                  >
                    ↓
                  </CmvButton>
                  <CmvButton variant="danger" onClick={() => removeItem(item.key)}>
                    {t("library.session.remove")}
                  </CmvButton>
                </div>

                <CmvTextField
                  label={t("library.session.prescriptionLabel")}
                  name={`prescription-${item.key}`}
                  value={item.prescription}
                  onChange={(event) => setPrescription(item.key, event.target.value)}
                  placeholder={t("library.session.prescriptionPlaceholder")}
                />
              </div>
            ))}
          </div>

          {errorMessage == null ? null : (
            <p className="text-cmv-caption text-cmv-error">{errorMessage}</p>
          )}
        </section>

        {/* Colonne droite : la bibliothèque d'exercices dans laquelle piocher */}
        <aside className="flex w-full flex-col gap-cmv-sm lg:w-72">
          <span className="text-cmv-caption text-cmv-text-mid">
            {t("library.session.pickerTitle")}
          </span>
          <CmvTextField
            label={t("library.searchLabel")}
            name="pickerSearch"
            type="search"
            value={pickerSearch}
            onChange={(event) => setPickerSearch(event.target.value)}
            placeholder={t("library.searchExercise")}
          />
          <div className="flex max-h-96 flex-col gap-cmv-xs overflow-y-auto">
            {pickable.map((exercise) => (
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
      </form>
    </CmvPanel>
  );
}
