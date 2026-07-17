import type { FeedbackMediaDto } from "@cmv/shared";
import { MediaType } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { Image, Pressable, View } from "react-native";
import { CmvText } from "@/shared/component";

type MediaGridProps = {
  media: FeedbackMediaDto[];
  onRemove: (mediaId: string) => void;
  isRemoving: boolean;
};

/**
 * Les médias déjà rattachés. Les URLs sont signées à durée courte : la grille exige donc le
 * réseau, comme les documents de séance (dette P3-3).
 */
export function MediaGrid({ media, onRemove, isRemoving }: Readonly<MediaGridProps>) {
  const { t } = useTranslation();

  if (media.length === 0) return null;

  return (
    <View className="flex-row flex-wrap gap-2">
      {media.map((item) => (
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
  );
}
