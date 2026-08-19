import type { FeedbackMediaDto } from "@cmv/shared";
import { MediaType } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { myFeedbackKeys } from "@/feature/feedback/api";
import { useFreshFeedbackMediaUrl } from "@/feature/feedback/hook/useFreshFeedbackMediaUrl";
import { CmvAudioPlayer, CmvImageViewer, CmvText, CmvVideoLink } from "@/shared/component";

type MediaGridProps = {
  media: FeedbackMediaDto[];
  // Porte la requête à re-signer quand une URL de lecture a expiré dans le cache.
  sessionId: string;
  onRemove: (mediaId: string) => void;
  isRemoving: boolean;
};

/**
 * Les médias déjà rattachés. Les URLs sont signées à durée courte : la grille exige donc le
 * réseau, comme les documents de séance (dette P3-3).
 *
 * Photos/vidéos vivent dans une grille de vignettes ; les notes vocales (P5), qui ne tiennent pas
 * dans une vignette, s'affichent en lignes avec un lecteur.
 */
export function MediaGrid({ media, sessionId, onRemove, isRemoving }: Readonly<MediaGridProps>) {
  const { t } = useTranslation();
  const freshUrl = useFreshFeedbackMediaUrl(myFeedbackKeys.detail(sessionId));

  if (media.length === 0) return null;

  const tiles = media.filter((item) => item.type !== MediaType.AUDIO);
  const audios = media.filter((item) => item.type === MediaType.AUDIO);

  return (
    <View className="gap-3">
      {tiles.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {tiles.map((item) => (
            <View key={item.id} className="gap-1">
              {item.type === MediaType.IMAGE ? (
                <CmvImageViewer
                  url={item.url}
                  containerClassName="h-24 w-24 overflow-hidden rounded-lg border border-cmv-border bg-cmv-surface"
                />
              ) : (
                // Toujours pas de MINIATURE vidéo (dette P4-4, [#92]) : la générer demanderait un
                // module natif de plus. La tuile est en revanche actionnable — elle ouvre la vidéo
                // dans le lecteur système.
                <CmvVideoLink
                  url={item.url}
                  durationSeconds={item.durationSeconds}
                  resolveUrl={() => freshUrl(item.id, item.url)}
                  containerClassName="h-24 w-24 items-center justify-center gap-1 rounded-lg border border-cmv-border bg-cmv-surface"
                />
              )}

              <Pressable onPress={() => onRemove(item.id)} disabled={isRemoving}>
                <CmvText className="text-center text-cmv-error text-xs">
                  {t("feedback.media.remove")}
                </CmvText>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {audios.map((item) => (
        <View
          key={item.id}
          className="flex-row items-center gap-3 rounded-lg border border-cmv-border bg-cmv-surface px-3 py-2"
        >
          <View className="flex-1">
            <CmvAudioPlayer url={item.url} durationSeconds={item.durationSeconds} />
          </View>
          <Pressable onPress={() => onRemove(item.id)} disabled={isRemoving}>
            <CmvText className="text-cmv-error text-xs">{t("feedback.media.remove")}</CmvText>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
