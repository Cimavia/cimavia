import type { MessageDto } from "@cmv/shared";
import { MessageType } from "@cmv/shared";
import { View } from "react-native";
import { ImageMessage } from "@/feature/message/component/ImageMessage";
import { CmvAudioPlayer, CmvText, CmvVideoLink } from "@/shared/component";

type MessageBubbleProps = {
  message: MessageDto;
  mine: boolean;
};

// Rendu du contenu média. L'URL est signée (bucket privé), régénérée à chaque lecture.
function MediaContent({ message }: Readonly<{ message: MessageDto }>) {
  const media = message.media;
  if (media == null) return null;

  if (message.type === MessageType.AUDIO) {
    return <CmvAudioPlayer url={media.url} durationSeconds={media.durationSeconds} />;
  }
  if (message.type === MessageType.IMAGE) {
    return <ImageMessage url={media.url} />;
  }
  // Vidéo : ouverte dans le lecteur système. Pas de `resolveUrl` — le fil sonde toutes les 10 s,
  // ses URLs signées n'ont pas le temps d'expirer sous la main de l'utilisateur.
  return <CmvVideoLink url={media.url} durationSeconds={media.durationSeconds} />;
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
