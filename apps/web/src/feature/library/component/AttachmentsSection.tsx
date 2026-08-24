import {
  DocumentType,
  DocumentUsage,
  type ExerciseDto,
  isAllowedDocumentMime,
  MAX_DOCUMENT_SIZE_BYTES,
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

  const attachments = (exercise?.documents ?? []).filter(
    (document) => document.usage === DocumentUsage.ATTACHMENT,
  );

  function onPickFiles(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
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

  function addLink() {
    const url = linkDraft.trim();
    if (url === "") return;
    onPendingLinks([...pendingLinks, url]);
    setLinkDraft("");
  }

  return (
    <section className="flex flex-col gap-cmv-sm">
      <span className="text-cmv-caption text-cmv-text-mid">
        {t("library.builder.attachment.title")}
      </span>

      {attachments.map((document) => (
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
              disabled={removeDocument.isPending || exercise == null}
              onClick={() => {
                if (exercise == null) return;
                removeDocument.mutate({ exerciseId: exercise.id, documentId: document.id });
              }}
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
          {progress[pending.id] == null ? null : (
            <CmvProgressBar
              percent={progress[pending.id] ?? 0}
              label={t("library.builder.attachment.uploading")}
            />
          )}
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
            onChange={(event) => setLinkDraft(event.target.value)}
            placeholder={t("library.builder.attachment.linkPlaceholder")}
          />
        </div>
        <CmvButton variant="secondary" onClick={addLink} disabled={linkDraft.trim() === ""}>
          {t("library.builder.attachment.addLinkAction")}
        </CmvButton>
      </div>

      {fileError == null ? null : <p className="text-cmv-caption text-cmv-error">{fileError}</p>}
    </section>
  );
}
