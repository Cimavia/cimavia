import {
  attachDocumentSchema,
  DocumentType,
  DocumentUsage,
  type ExerciseDto,
  isAllowedDocumentMime,
  MAX_DOCUMENT_SIZE_BYTES,
  required,
} from "@cmv/shared";
import { type ChangeEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { ACCEPTED_DOCUMENT_ATTR } from "@/feature/library/constant";
import type { PendingFile } from "@/feature/library/hook/useSaveExercise";
import { useDeleteDocument } from "@/feature/library/hook/useSaveExercise";
import { CmvBadge, CmvButton, CmvProgressBar, CmvTextField } from "@/shared/component";

type AttachmentsSectionProps = {
  exercise: ExerciseDto | null;
  pendingFiles: readonly PendingFile[];
  pendingLinks: readonly string[];
  progress: Readonly<Record<string, number>>;
  isSaving: boolean;
  onPendingFiles: (files: PendingFile[]) => void;
  onPendingLinks: (links: string[]) => void;
};

/**
 * Les pièces jointes et liens d'un exercice.
 *
 * Les images POSÉES dans la consigne n'y figurent pas : elles sont bien des `ExerciseDocument`,
 * mais d'usage `INSTRUCTION`. Les lister ici les montrerait deux fois, et le coach pourrait en
 * supprimer une sans comprendre pourquoi elle disparaît de sa consigne.
 */
export function AttachmentsSection({
  exercise,
  pendingFiles,
  pendingLinks,
  progress,
  isSaving,
  onPendingFiles,
  onPendingLinks,
}: Readonly<AttachmentsSectionProps>) {
  const { t } = useTranslation();
  const removeDocument = useDeleteDocument();
  const [linkDraft, setLinkDraft] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Chaque document enregistré porte l'id de SON exercice : sans exercice, il n'y en a aucun, et le
  // bouton qui le retire n'a donc jamais à se demander à qui il appartient.
  const attachments =
    exercise == null
      ? []
      : exercise.documents
          .filter((document) => document.usage === DocumentUsage.ATTACHMENT)
          .map((document) => ({ document, exerciseId: exercise.id }));

  function onPickFiles(event: ChangeEvent<HTMLInputElement>) {
    // Un `input type="file"` a toujours sa `FileList`, vide ou non.
    const picked = Array.from(required(event.target.files, "champ fichier sans FileList"));
    // Remis à zéro : sans ça, re-choisir le MÊME fichier ne déclenche aucun `change`.
    event.target.value = "";
    setFileError(null);

    // Mêmes contraintes que la validation serveur : on échoue tôt, côté client. La garde
    // `isAllowedDocumentMime` narrow `file.type` → le PendingFile porte un type validé.
    const accepted: PendingFile[] = [];
    for (const file of picked) {
      if (!isAllowedDocumentMime(file.type)) {
        setFileError(t("library.builder.attachment.errorType"));
        return;
      }
      if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
        setFileError(t("library.builder.attachment.errorSize"));
        return;
      }
      accepted.push({ id: crypto.randomUUID(), file, mimeType: file.type });
    }
    onPendingFiles([...pendingFiles, ...accepted]);
  }

  /**
   * Le lien est validé ICI, par le schéma que l'API applique au rattachement : l'attribut
   * `type="url"` du champ ne valide rien hors d'un `<form>`. Refusé à l'enregistrement, le lien
   * faisait échouer l'enregistrement après la création de l'exercice (#302).
   */
  function addLink() {
    // Jamais blanc : le bouton, seul appelant, est fermé sur un brouillon blanc.
    const url = linkDraft.trim();
    if (!attachDocumentSchema.safeParse({ type: DocumentType.LINK, url }).success) {
      setLinkError(t("library.builder.attachment.errorLink"));
      return;
    }
    onPendingLinks([...pendingLinks, url]);
    setLinkDraft("");
  }

  // La barre n'apparaît qu'une fois l'envoi parti : avant, aucun pourcentage n'existe.
  function uploadBar(percent: number | undefined) {
    if (percent == null) return null;
    return <CmvProgressBar percent={percent} label={t("library.builder.attachment.uploading")} />;
  }

  return (
    <section className="flex flex-col gap-cmv-sm">
      <span className="text-cmv-caption text-cmv-text-mid">
        {t("library.builder.attachment.title")}
      </span>

      {attachments.map(({ document, exerciseId }) => (
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
                ? t("library.builder.attachment.link")
                : t("library.builder.attachment.file")}
            </CmvBadge>
            <CmvButton
              variant="danger"
              disabled={removeDocument.isPending}
              onClick={() => removeDocument.mutate({ exerciseId, documentId: document.id })}
            >
              {t("library.builder.attachment.remove")}
            </CmvButton>
          </div>
        </div>
      ))}

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
              onClick={() => onPendingFiles(pendingFiles.filter((item) => item.id !== pending.id))}
            >
              {t("library.builder.attachment.remove")}
            </CmvButton>
          </div>
          {uploadBar(progress[pending.id])}
        </div>
      ))}

      {pendingLinks.map((url) => (
        <div
          key={url}
          className="flex items-center justify-between gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm"
        >
          <span className="truncate text-cmv-body text-cmv-text-hi">{url}</span>
          <CmvButton
            variant="danger"
            disabled={isSaving}
            onClick={() => onPendingLinks(pendingLinks.filter((item) => item !== url))}
          >
            {t("library.builder.attachment.remove")}
          </CmvButton>
        </div>
      ))}

      <label className="flex cursor-pointer flex-col items-center gap-cmv-xs rounded-cmv-md border border-cmv-border border-dashed bg-cmv-bg-1 p-cmv-lg text-center hover:border-cmv-border-hi">
        <span className="text-cmv-body text-cmv-text-hi">
          {t("library.builder.attachment.add")}
        </span>
        <span className="text-cmv-caption text-cmv-text-mid">
          {t("library.builder.attachment.hint")}
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
            label={t("library.builder.attachment.addLink")}
            name="attachmentLink"
            type="url"
            value={linkDraft}
            onChange={(event) => {
              setLinkDraft(event.target.value);
              setLinkError(null);
            }}
            placeholder={t("library.builder.attachment.linkPlaceholder")}
          />
        </div>
        <CmvButton variant="secondary" onClick={addLink} disabled={linkDraft.trim() === ""}>
          {t("library.builder.attachment.addLinkAction")}
        </CmvButton>
      </div>

      {linkError == null ? null : <p className="text-cmv-caption text-cmv-error">{linkError}</p>}
      {fileError == null ? null : <p className="text-cmv-caption text-cmv-error">{fileError}</p>}
    </section>
  );
}
