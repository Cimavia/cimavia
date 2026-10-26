import {
  type CustomMetric,
  DocumentType,
  DocumentUsage,
  type ExerciseDocumentDto,
  metricLabel,
  type RichDocument,
  type SuggestedMetric,
  suggestedMetricIdentity,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import {
  CmvBadge,
  CmvCard,
  CmvRichDocument,
  CmvTagList,
  type ResolveImage,
} from "@/shared/component";

type ExercisePreviewProps = {
  title: string;
  tags: readonly string[];
  instructions: RichDocument;
  suggestedMetrics: readonly SuggestedMetric[];
  /** Où se nomment les métriques maison suggérées. */
  customMetrics: readonly CustomMetric[];
  /** Ce que l'athlète pourra ouvrir. Les images de consigne n'en sont pas : elles sont DANS le texte. */
  documents: readonly ExerciseDocumentDto[];
  resolveImage: ResolveImage;
};

/**
 * Ce que l'athlète verra, mis à jour à la frappe. **Lecture seule** : rien ici ne doit ressembler
 * à un réglage. Le dosage n'y est plus (#718) : la séance le porte. Les métriques suggérées s'y
 * lisent en puces, dans leur ordre — celui des colonnes qu'elles prérempliront.
 *
 * Tant qu'il n'y a pas de titre, l'aperçu ne montre pas une carte vide : il dit ce qu'il attend.
 */
export function ExercisePreview({
  title,
  tags,
  instructions,
  suggestedMetrics,
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
        // `min-w-0` : sans lui, un enfant à défilement impose sa largeur intrinsèque au conteneur
        // flex, et la carte s'élargit au lieu de laisser défiler.
        <CmvCard className="flex min-w-0 flex-col gap-cmv-sm">
          <h3 className="text-cmv-subtitle text-cmv-text-hi">{title}</h3>
          <CmvTagList tags={tags} />
          <CmvRichDocument blocks={instructions} resolveImage={resolveImage} />

          <PreviewMetrics metrics={suggestedMetrics} customMetrics={customMetrics} />

          <PreviewAttachments documents={attachments} />
        </CmvCard>
      )}
    </section>
  );
}

/**
 * Les métriques suggérées, en puces. Aucune est légitime — « étirements au ressenti » : rien ne
 * s'affiche alors, pas même un intitulé.
 */
function PreviewMetrics({
  metrics,
  customMetrics,
}: Readonly<{ metrics: readonly SuggestedMetric[]; customMetrics: readonly CustomMetric[] }>) {
  const { t } = useTranslation();
  if (metrics.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-cmv-xs">
      <span className="text-cmv-caption text-cmv-text-lo">
        {t("library.builder.suggested.title")}
      </span>
      <ul className="flex flex-wrap gap-cmv-xs">
        {metrics.map((metric) => (
          <li key={suggestedMetricIdentity(metric)}>
            <CmvBadge>{metricLabel(metric, customMetrics, t)}</CmvBadge>
          </li>
        ))}
      </ul>
    </div>
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
