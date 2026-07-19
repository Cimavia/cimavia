import type { FeedbackMediaDto } from "@cmv/shared";
import { MediaType } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { Image, Pressable, View } from "react-native";
import { CmvAudioPlayer, CmvText } from "@/shared/component";

type MediaGridProps = {
  media: FeedbackMediaDto[];
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
export function MediaGrid({ media, onRemove, isRemoving }: Readonly<MediaGridProps>) {
  const { t } = useTranslation();

  if (media.length === 0) return null;

  const tiles = media.filter((item) => item.type !== MediaType.AUDIO);
  const audios = media.filter((item) => item.type === MediaType.AUDIO);

  return (
    <View className="gap-3">
      {tiles.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {tiles.map((item) => (
            <View key={item.id} className="gap-1">
              <View className="h-24 w-24 overflow-hidden rounded-lg border border-cmv-border bg-cmv-surface">
                {item.type === MediaType.IMAGE ? (
                  <Image source={{ uri: item.url }} className="h-full w-full" resizeMode="cover" />
                ) : (
                  // Pas de miniature vidéo en MVP : la générer demanderait un module natif de plus.
                  <View className="h-full w-full items-center justify-center">
                    <CmvText className="text-cmv-text-mid text-xs">
                      {t("feedback.media.videoBadge", { seconds: item.durationSeconds ?? 0 })}
                    </CmvText>
                  </View>
                )}
              </View>

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
