import type { MessageDto } from "@cmv/shared";
import { MessageType } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { CmvText } from "@/shared/component";

type MessageBubbleProps = {
  message: MessageDto;
  mine: boolean;
};

// Libellé d'un message média (commit 6 : le rendu audio/image arrive avec l'enregistreur, commit
// 7). Un message reçu du web pouvant déjà être un média, on ne laisse jamais une bulle vide.
function mediaLabelKey(type: MessageType): string | null {
  switch (type) {
    case MessageType.AUDIO:
      return "messages.media.audio";
    case MessageType.IMAGE:
      return "messages.media.image";
    case MessageType.VIDEO:
      return "messages.media.video";
    default:
      return null;
  }
}

export function MessageBubble({ message, mine }: Readonly<MessageBubbleProps>) {
  const { t } = useTranslation();
  const mediaKey = message.content == null ? mediaLabelKey(message.type) : null;

  return (
    <View
      className={`max-w-[80%] rounded-2xl px-4 py-2 ${
        mine ? "self-end bg-cmv-accent" : "self-start bg-cmv-surface"
      }`}
    >
      {message.content != null ? (
        <CmvText className="text-cmv-text-hi">{message.content}</CmvText>
      ) : (
        <CmvText className="text-cmv-text-mid italic">
          {mediaKey != null ? t(mediaKey) : ""}
        </CmvText>
      )}
    </View>
  );
}
