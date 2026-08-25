import {
  type CustomMetric,
  DocumentType,
  DocumentUsage,
  type ExerciseBlocks,
  type ExerciseDocumentDto,
  type RichDocument,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { PreviewBlock } from "@/feature/library/component/PreviewBlock";
import { CmvCard, CmvRichDocument, CmvTagList, type ResolveImage } from "@/shared/component";

type ExercisePreviewProps = {
  title: string;
  tags: readonly string[];
  instructions: RichDocument;
  blocks: ExerciseBlocks;
  customMetrics: readonly CustomMetric[];
  /** Ce que l'athlète pourra ouvrir. Les images de consigne n'en sont pas : elles sont DANS le texte. */
  documents: readonly ExerciseDocumentDto[];
  resolveImage: ResolveImage;
};

/**
 * Ce que l'athlète verra, mis à jour à la frappe. **Lecture seule** : ni timer ni case à cocher
 * n'y sont paramétrables, ils découlent des valeurs saisies dans la structure. Rien ici ne doit
 * ressembler à un réglage.
 *
 * Tant qu'il n'y a pas de titre, l'aperçu ne montre pas une carte vide : il dit ce qu'il attend.
 */
export function ExercisePreview({
  title,
  tags,
  instructions,
  blocks,
  customMetrics,
  documents,
  resolveImage,
}: Readonly<ExercisePreviewProps>) {
  const { t } = useTranslation();

  const attachments = documents.filter((document) => document.usage === DocumentUsage.ATTACHMENT);

  return (
    <section className="flex flex-col gap-cmv-sm">
      <span className="text-cmv-caption text-cmv-text-mid">
        {t("library.builder.previewTitle")}
      </span>

      {title === "" ? (
        <p className="rounded-cmv-md border border-cmv-border border-dashed bg-cmv-bg-1 p-cmv-lg text-center text-cmv-caption text-cmv-text-mid">
          {t("library.builder.previewEmpty")}
        </p>
      ) : (
        // `min-w-0` : sans lui, un enfant à défilement (le tableau) impose sa largeur
        // intrinsèque au conteneur flex, et la carte s'élargit au lieu de laisser défiler.
        <CmvCard className="flex min-w-0 flex-col gap-cmv-sm">
          <h3 className="text-cmv-subtitle text-cmv-text-hi">{title}</h3>
          <CmvTagList tags={tags} />
          <CmvRichDocument blocks={instructions} resolveImage={resolveImage} />

          {/* Un exercice SANS aucun bloc est légitime — « étirements au ressenti ». L'athlète
              voit alors titre et consigne, rien d'autre : pas de grille vide, pas de phrase de
              dosage. La phrase complète arrive avec la grille. */}
          {/* Un filet entre les structures : sans lui, deux blocs successifs se lisent comme un
              seul, et l'athlète confond le dosage de l'un avec celui de l'autre. */}
          {blocks.map((block, index) => (
            <div
              key={block.id}
              className={index === 0 ? "" : "border-cmv-border border-t pt-cmv-sm"}
            >
              <PreviewBlock block={block} customMetrics={customMetrics} />
            </div>
          ))}

          <PreviewAttachments documents={attachments} />
        </CmvCard>
      )}
    </section>
  );
}

/**
 * Les pièces jointes telles que l'athlète les verra. Elles n'apparaissent qu'une fois
 * ENREGISTRÉES : tant qu'un fichier n'est pas parti au stockage, il n'a pas d'URL signée, et
 * fabriquer un lien local ferait croire qu'il est déjà accessible.
 */
function PreviewAttachments({
  documents,
}: Readonly<{ documents: readonly ExerciseDocumentDto[] }>) {
  const { t } = useTranslation();
  if (documents.length === 0) return null;

  return (
    <div className="flex flex-col gap-cmv-xs border-cmv-border border-t pt-cmv-sm">
      {documents.map((document) => (
        <a
          key={document.id}
          href={document.url}
          target="_blank"
          rel="noreferrer"
          className="truncate text-cmv-caption text-cmv-accent hover:underline"
        >
          {document.fileName ??
            (document.type === DocumentType.LINK
              ? document.url
              : t("library.builder.attachment.file"))}
        </a>
      ))}
    </div>
  );
}
