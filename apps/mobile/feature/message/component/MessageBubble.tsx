import type { MessageDto } from "@cmv/shared";
import { MessageType } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { Image, View } from "react-native";
import { CmvAudioPlayer, CmvText } from "@/shared/component";
import { formatMmSs } from "@/shared/util/time";

type MessageBubbleProps = {
  message: MessageDto;
  mine: boolean;
};

// Rendu du contenu média. L'URL est signée (bucket privé), régénérée à chaque lecture.
function MediaContent({ message }: Readonly<{ message: MessageDto }>) {
  const { t } = useTranslation();
  const media = message.media;
  if (media == null) return null;

  if (message.type === MessageType.AUDIO) {
    return <CmvAudioPlayer url={media.url} durationSeconds={media.durationSeconds} />;
  }
  if (message.type === MessageType.IMAGE) {
    return (
      <Image source={{ uri: media.url }} className="h-48 w-48 rounded-xl" resizeMode="cover" />
    );
  }
  // Vidéo : pas de lecteur intégré côté mobile en MVP (le coach la lit sur web) → pastille, comme
  // la galerie du débrief (dette P4-4).
  return (
    <View className="flex-row items-center gap-2">
      <CmvText className="text-cmv-text-hi">{t("messages.media.video")}</CmvText>
      {media.durationSeconds != null ? (
        <CmvText className="text-cmv-text-mid text-xs">{formatMmSs(media.durationSeconds)}</CmvText>
      ) : null}
    </View>
  );
}

export function MessageBubble({ message, mine }: Readonly<MessageBubbleProps>) {
  return (
    <View
      className={`max-w-[80%] rounded-2xl px-3 py-2 ${
        mine ? "self-end bg-cmv-accent" : "self-start bg-cmv-surface"
      }`}
    >
      {message.content != null ? (
        <CmvText className="text-cmv-text-hi">{message.content}</CmvText>
      ) : (
        <MediaContent message={message} />
      )}
    </View>
  );
}
