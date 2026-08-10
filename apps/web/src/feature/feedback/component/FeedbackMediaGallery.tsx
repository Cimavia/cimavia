import type { FeedbackMediaDto } from "@cmv/shared";
import { MediaType } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvButton, CmvCard } from "@/shared/component";

type FeedbackMediaGalleryProps = {
  media: readonly FeedbackMediaDto[];
  onRemove: (mediaId: string) => void;
  isRemoving: boolean;
};

/**
 * Les médias déjà joints au débrief. Photos en vignette, vidéos et notes vocales par leur lecteur
 * natif — le navigateur sait faire, et un lecteur maison n'apporterait rien ici.
 *
 * Les URLs sont signées à TTL court et régénérées à chaque lecture : elles ne se conservent pas.
 */
export function FeedbackMediaGallery({
  media,
  onRemove,
  isRemoving,
}: Readonly<FeedbackMediaGalleryProps>) {
  const { t } = useTranslation();

  if (media.length === 0) return null;

  return (
    <div className="grid gap-cmv-sm md:grid-cols-2 xl:grid-cols-3">
      {media.map((item) => (
        <CmvCard key={item.id}>
          <div className="flex flex-col gap-cmv-sm">
            {item.type === MediaType.IMAGE ? (
              <img
                src={item.url}
                alt={item.fileName}
                className="max-h-48 w-full rounded-cmv-md object-cover"
              />
            ) : null}

            {item.type === MediaType.VIDEO ? (
              // `preload="metadata"` : on ne télécharge pas 50 Mo de vidéo pour afficher une carte.
              // biome-ignore lint/a11y/useMediaCaption: vidéo d'entraînement d'un athlète — pas de sous-titres.
              <video src={item.url} controls preload="metadata" className="w-full rounded-cmv-md" />
            ) : null}

            {item.type === MediaType.AUDIO ? (
              // biome-ignore lint/a11y/useMediaCaption: note vocale d'un athlète — pas de piste de sous-titres.
              <audio src={item.url} controls preload="metadata" className="w-full" />
            ) : null}

            <div className="flex items-center gap-cmv-sm">
              <span className="flex-1 truncate text-cmv-caption text-cmv-text-lo">
                {item.fileName}
              </span>
              <CmvButton variant="ghost" disabled={isRemoving} onClick={() => onRemove(item.id)}>
                {t("feedback.media.remove")}
              </CmvButton>
            </div>
          </div>
        </CmvCard>
      ))}
    </div>
  );
}
