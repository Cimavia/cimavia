import {
  DocumentType,
  type ExerciseCategory,
  type ExerciseDto,
  isAllowedDocumentMime,
  MAX_DOCUMENT_SIZE_BYTES,
} from "@cmv/shared";
import { type ChangeEvent, type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { ACCEPTED_DOCUMENT_ATTR, EXERCISE_CATEGORIES } from "@/feature/library/constant";
import {
  type PendingFile,
  useDeleteDocument,
  useSaveExercise,
} from "@/feature/library/hook/useSaveExercise";
import {
  CmvBadge,
  CmvButton,
  CmvPanel,
  CmvProgressBar,
  CmvSegmented,
  CmvTextArea,
  CmvTextField,
} from "@/shared/component";
import { ApiError } from "@/shared/lib/api";

type ExerciseFormProps = {
  open: boolean;
  exercise: ExerciseDto | null; // null = création ; sinon édition.
  onClose: () => void;
};

export function ExerciseForm({ open, exercise, onClose }: Readonly<ExerciseFormProps>) {
  const { t } = useTranslation();
  const { save, isSaving, error, progress } = useSaveExercise();
  const removeDocument = useDeleteDocument();

  const [title, setTitle] = useState(exercise?.title ?? "");
  const [description, setDescription] = useState(exercise?.description ?? "");
  const [category, setCategory] = useState<ExerciseCategory>(
    exercise?.category ?? EXERCISE_CATEGORIES[0],
  );
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [pendingLinks, setPendingLinks] = useState<string[]>([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);

  function onPickFiles(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = ""; // permet de re-sélectionner le même fichier
    setFileError(null);

    // Mêmes contraintes que la validation serveur (@cmv/shared) : on échoue tôt, côté client.
    // La garde `isAllowedDocumentMime` narrow `file.type` → le PendingFile porte un type validé.
    const accepted: PendingFile[] = [];
    for (const file of picked) {
      if (!isAllowedDocumentMime(file.type)) {
        setFileError(t("library.exercise.errorFileType"));
        return;
      }
      if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
        setFileError(t("library.exercise.errorFileSize"));
        return;
      }
      accepted.push({ id: crypto.randomUUID(), file, mimeType: file.type });
    }
    setPendingFiles((current) => [...current, ...accepted]);
  }

  function onAddLink() {
    const url = linkDraft.trim();
    if (!url) return;
    setPendingLinks((current) => [...current, url]);
    setLinkDraft("");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await save({
      exercise,
      // Description vide → null (nullable, pas de fallback silencieux).
      input: { title: title.trim(), description: description.trim() || null, category },
      pendingFiles,
      pendingLinks,
    });
    onClose();
  }

  const errorMessage = error instanceof ApiError ? error.message : null;
  const isEditing = exercise != null;

  const submitLabelKey = isEditing
    ? "library.exercise.submitEdit"
    : "library.exercise.submitCreate";
  const submitLabel = isSaving ? t("library.exercise.submitting") : t(submitLabelKey);

  return (
    <CmvPanel
      open={open}
      title={isEditing ? t("library.exercise.editTitle") : t("library.exercise.createTitle")}
      description={t("library.exercise.panelDescription")}
      onClose={onClose}
      footer={
        <>
          <CmvButton variant="ghost" onClick={onClose} disabled={isSaving}>
            {t("library.exercise.cancel")}
          </CmvButton>
          <CmvButton type="submit" onClick={onSubmit} disabled={isSaving || !title.trim()}>
            {submitLabel}
          </CmvButton>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-cmv-xl">
        <CmvTextField
          label={t("library.exercise.titleLabel")}
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("library.exercise.titlePlaceholder")}
          required
        />

        <CmvSegmented
          label={t("library.exercise.categoryLabel")}
          value={category}
          onChange={setCategory}
          options={EXERCISE_CATEGORIES.map((value) => ({
            value,
            label: t(`library.category.${value}`),
          }))}
        />

        <CmvTextArea
          label={t("library.exercise.descriptionLabel")}
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("library.exercise.descriptionPlaceholder")}
          rows={5}
        />

        <section className="flex flex-col gap-cmv-sm">
          <span className="text-cmv-caption text-cmv-text-mid">
            {t("library.exercise.documents")}
          </span>

          {/* Documents déjà rattachés (édition) */}
          {exercise?.documents.map((document) => (
            <div
              key={document.id}
              className="flex items-center justify-between gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm"
            >
              <a
                href={document.url}
                target="_blank"
                rel="noreferrer"
                className="truncate text-cmv-body text-cmv-text-hi hover:text-cmv-accent"
              >
                {document.fileName ?? document.url}
              </a>
              <div className="flex shrink-0 items-center gap-cmv-sm">
                <CmvBadge>
                  {document.type === DocumentType.LINK
                    ? t("library.exercise.link")
                    : t("library.exercise.file")}
                </CmvBadge>
                <CmvButton
                  variant="danger"
                  disabled={removeDocument.isPending}
                  onClick={() =>
                    removeDocument.mutate({
                      exerciseId: exercise.id,
                      documentId: document.id,
                    })
                  }
                >
                  {t("library.exercise.delete")}
                </CmvButton>
              </div>
            </div>
          ))}

          {/* Fichiers en attente d'envoi (barre de progression pendant l'enregistrement) */}
          {pendingFiles.map((pending) => (
            <div
              key={pending.id}
              className="flex flex-col gap-cmv-xs rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm"
            >
              <div className="flex items-center justify-between gap-cmv-sm">
                <span className="truncate text-cmv-body text-cmv-text-hi">{pending.file.name}</span>
                <CmvButton
                  variant="danger"
                  disabled={isSaving}
                  onClick={() =>
                    setPendingFiles((current) => current.filter((item) => item.id !== pending.id))
                  }
                >
                  {t("library.exercise.delete")}
                </CmvButton>
              </div>
              {progress[pending.id] == null ? null : (
                <CmvProgressBar
                  percent={progress[pending.id] ?? 0}
                  label={t("library.exercise.uploading")}
                />
              )}
            </div>
          ))}

          {/* Liens en attente de rattachement */}
          {pendingLinks.map((url) => (
            <div
              key={url}
              className="flex items-center justify-between gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm"
            >
              <span className="truncate text-cmv-body text-cmv-text-hi">{url}</span>
              <CmvButton
                variant="danger"
                disabled={isSaving}
                onClick={() => setPendingLinks((current) => current.filter((item) => item !== url))}
              >
                {t("library.exercise.delete")}
              </CmvButton>
            </div>
          ))}

          <label className="flex cursor-pointer flex-col items-center gap-cmv-xs rounded-cmv-md border border-cmv-border border-dashed bg-cmv-bg-1 p-cmv-lg text-center hover:border-cmv-border-hi">
            <span className="text-cmv-body text-cmv-text-hi">{t("library.exercise.addFile")}</span>
            <span className="text-cmv-caption text-cmv-text-mid">
              {t("library.exercise.fileHint")}
            </span>
            <input
              type="file"
              multiple
              accept={ACCEPTED_DOCUMENT_ATTR}
              onChange={onPickFiles}
              className="hidden"
            />
          </label>

          <div className="flex items-end gap-cmv-sm">
            <div className="flex-1">
              <CmvTextField
                label={t("library.exercise.addLink")}
                name="link"
                type="url"
                value={linkDraft}
                onChange={(event) => setLinkDraft(event.target.value)}
                placeholder={t("library.exercise.linkPlaceholder")}
              />
            </div>
            <CmvButton variant="secondary" onClick={onAddLink} disabled={!linkDraft.trim()}>
              {t("library.exercise.addLinkAction")}
            </CmvButton>
          </div>

          {fileError == null ? null : (
            <p className="text-cmv-caption text-cmv-error">{fileError}</p>
          )}
        </section>

        {errorMessage == null ? null : (
          <p className="text-cmv-caption text-cmv-error">{errorMessage}</p>
        )}
      </form>
    </CmvPanel>
  );
}
