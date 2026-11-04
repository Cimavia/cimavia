import { FILE_SIZE_LABEL_KEY, fileSizeOf, type MessageMediaDto } from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IoDocumentTextOutline } from "react-icons/io5";
import { useToast } from "@/shared/component";
import { type OpenInNewTabOutcome, openInNewTab } from "@/shared/lib/open-in-new-tab";

// Ce qui se dit quand l'onglet n'a pas reçu le fichier. Un onglet refermé par l'utilisateur, lui,
// n'appelle rien.
const FAILURE_KEY: Partial<Record<OpenInNewTabOutcome, string>> = {
  blocked: "messages.file.popupBlocked",
  failed: "messages.file.openError",
};

type FileMessageProps = {
  media: MessageMediaDto;
  /** L'URL ouvrable à l'instant du clic, re-signée si celle du fil a expiré (#304). */
  resolveUrl: () => Promise<string | null>;
};

/**
 * Fichier joint d'un message (#771) : son nom et sa taille, comme la maquette `conversation_1_1`
 * le dessine. Un fichier ne se lit pas dans la bulle, il s'OUVRE — dans un onglet, où le
 * navigateur montre le PDF lui-même.
 *
 * L'URL du fil n'est jamais ouverte telle quelle : périmée, elle mènerait au 403 du storage, en
 * XML brut — la dette V-2, à laquelle ce fichier n'ajoute pas de cas.
 */
export function FileMessage({ media, resolveUrl }: Readonly<FileMessageProps>) {
  const { t } = useTranslation();
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  const size = fileSizeOf(media.sizeBytes);

  // Un clic à la fois : un second pendant la re-signature ouvrirait un second onglet.
  const open = async () => {
    setOpening(true);
    const failureKey = FAILURE_KEY[await openInNewTab(resolveUrl)];
    setOpening(false);
    if (failureKey != null) toast.error(t(failureKey));
  };

  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={opening}
      aria-busy={opening}
      aria-label={t("messages.file.open", { fileName: media.fileName })}
      title={t("messages.file.open", { fileName: media.fileName })}
      className="flex w-52 max-w-full items-center gap-cmv-md text-left disabled:cursor-progress"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-cmv-md bg-cmv-error-soft text-cmv-error">
        <IoDocumentTextOutline size={18} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{media.fileName}</span>
        <span className="text-cmv-caption text-cmv-text-mid">
          {t(FILE_SIZE_LABEL_KEY[size.unit], { value: size.value })}
        </span>
      </span>
    </button>
  );
}
