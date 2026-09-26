import type { FeedbackMediaDto } from "@cmv/shared";
import { MediaType } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import type { ResolveMediaUrl } from "@/feature/message/component/MessageBubble";
import { CmvButton, CmvCard, CmvMediaPlayer } from "@/shared/component";

type FeedbackMediaGalleryProps = {
  media: readonly FeedbackMediaDto[];
  onRemove: (mediaId: string) => void;
  isRemoving: boolean;
  resolveMediaUrl: ResolveMediaUrl;
};

/**
 * Les médias déjà joints au débrief. Photos en vignette, vidéos et notes vocales par leur lecteur
 * natif — le navigateur sait faire, et un lecteur maison n'apporterait rien ici.
 *
 * Les URLs sont signées à TTL court : le lecteur re-signe celle qui lâche en cours de route, sans
 * repartir de zéro (#304).
 */
export function FeedbackMediaGallery({
  media,
  onRemove,
  isRemoving,
  resolveMediaUrl,
}: Readonly<FeedbackMediaGalleryProps>) {
  const { t } = useTranslation();

  if (media.length === 0) return null;

  return (
    <div className="grid gap-cmv-sm md:grid-cols-2 xl:grid-cols-3">
      {media.map((item) => (
        <CmvCard key={item.id}>
          <div className="flex flex-col gap-cmv-sm">
            {/* Cliquable, comme côté coach : une vignette de 48 rem ne montre pas une prise de
                pied, et l'athlète relit d'abord SES photos. L'écart entre les deux surfaces web
                n'était pas un choix — le panneau coach l'a depuis toujours, cette galerie non. */}
            {item.type === MediaType.IMAGE ? (
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                title={t("feedback.media.openFull")}
              >
                <img
                  src={item.url}
                  alt={item.fileName}
                  className="max-h-48 w-full rounded-cmv-md object-cover"
                />
              </a>
            ) : null}

            {/* `preload="metadata"` : on ne télécharge pas 50 Mo de vidéo pour afficher une carte. */}
            {item.type === MediaType.IMAGE ? null : (
              <CmvMediaPlayer
                kind={item.type === MediaType.AUDIO ? "audio" : "video"}
                url={item.url}
                resolveUrl={() => resolveMediaUrl(item.id)}
                preload="metadata"
                className={item.type === MediaType.AUDIO ? "w-full" : "w-full rounded-cmv-md"}
              />
            )}

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
