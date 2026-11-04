import { FILE_SIZE_LABEL_KEY, fileSizeOf, type MessageMediaDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { IoDocumentTextOutline } from "react-icons/io5";
import { useToast } from "@/shared/component";
import { openInNewTab } from "@/shared/lib/open-in-new-tab";

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
  const size = fileSizeOf(media.sizeBytes);

  const open = async () => {
    if (!(await openInNewTab(resolveUrl))) toast.error(t("messages.file.openError"));
  };

  return (
    <button
      type="button"
      onClick={() => void open()}
      aria-label={t("messages.file.open", { fileName: media.fileName })}
      title={t("messages.file.open", { fileName: media.fileName })}
      className="flex w-52 max-w-full items-center gap-cmv-md text-left"
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
