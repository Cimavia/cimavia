import type { MessageDto } from "@cmv/shared";
import { MessageType } from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Linking, Pressable, View } from "react-native";
import { ImageMessage } from "@/feature/message/component/ImageMessage";
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
    return <ImageMessage url={media.url} />;
  }
  // Vidéo : pas de lecteur intégré côté mobile en MVP (dette P4-4). La pastille ouvre la vidéo dans
  // le lecteur système (l'URL signée est un GET direct) — aucun module natif ajouté.
  return (
    <Pressable onPress={() => Linking.openURL(media.url)} className="flex-row items-center gap-2">
      <Ionicons name="play-circle" size={22} color={cmvColors.text.hi} />
      <CmvText className="text-cmv-text-hi">{t("messages.media.video")}</CmvText>
      {media.durationSeconds != null ? (
        <CmvText className="text-cmv-text-mid text-xs">{formatMmSs(media.durationSeconds)}</CmvText>
      ) : null}
    </Pressable>
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
