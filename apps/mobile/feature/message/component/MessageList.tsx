import {
  type ConversationDto,
  type MessageDto,
  messageAuthorOf,
  nextVoiceNoteInThread,
  type ReadBy,
  readByText,
} from "@cmv/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, View } from "react-native";
import { CmvText } from "@/shared/component";
import { useVoiceNoteChain } from "@/shared/hook/useVoiceNoteChain";
import { MessageBubble, type ResolveMediaUrl } from "./MessageBubble";

type MessageListProps = {
  /** De quoi nommer l'auteur des bulles reçues, à plusieurs (#612). */
  conversation: ConversationDto;
  messages: MessageDto[];
  /** `null` tant que la session n'est pas lue : aucune bulle n'est alors « à moi ». */
  currentUserId: string | null;
  /** Qui a lu mon dernier message, à plusieurs ; `null` sinon (`readByOf`). */
  readBy: ReadBy | null;
  resolveMediaUrl: ResolveMediaUrl;
};

export function MessageList({
  conversation,
  messages,
  currentUserId,
  readBy,
  resolveMediaUrl,
}: Readonly<MessageListProps>) {
  const { t } = useTranslation();
  // `inverted` colle le fil au bas de l'écran (dernier message visible, comme une messagerie) et
  // attend les données du plus récent au plus ancien — l'API les renvoie dans l'ordre inverse.
  const newestFirst = useMemo(() => [...messages].reverse(), [messages]);
  // La suite d'une note se lit dans l'ordre du fil, pas dans celui de l'affichage inversé (#529).
  const chain = useVoiceNoteChain((id) => nextVoiceNoteInThread(messages, id));
  const readByLine = readBy == null ? null : readByText(readBy, t);

  return (
    <FlatList
      data={newestFirst}
      inverted
      keyExtractor={(message) => message.id}
      // L'état que lit `renderItem` se déclare : `FlatList` est un `PureComponent`, et un
      // `renderItem` stabilisé un jour priverait la note désignée de son rendu — ou le dernier
      // message de son « Lu par ».
      extraData={`${chain.cuedId ?? ""}|${readBy?.messageId ?? ""}|${readByLine ?? ""}`}
      contentContainerClassName="gap-2 p-4"
      renderItem={({ item }) => (
        <View className="gap-1">
          <MessageBubble
            message={item}
            mine={item.senderId === currentUserId}
            author={messageAuthorOf(conversation, item.senderId, currentUserId)}
            resolveMediaUrl={resolveMediaUrl}
            voiceNoteCue={chain.cueOf(item.id)}
          />
          {readBy?.messageId === item.id ? (
            <CmvText className="self-end text-cmv-text-lo text-xs">{readByLine}</CmvText>
          ) : null}
        </View>
      )}
    />
  );
}
