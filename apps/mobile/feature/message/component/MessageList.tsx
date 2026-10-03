import { type MessageDto, nextVoiceNoteInThread } from "@cmv/shared";
import { useMemo } from "react";
import { FlatList } from "react-native";
import { useVoiceNoteChain } from "@/shared/hook/useVoiceNoteChain";
import { MessageBubble, type ResolveMediaUrl } from "./MessageBubble";

type MessageListProps = {
  messages: MessageDto[];
  currentUserId: string;
  resolveMediaUrl: ResolveMediaUrl;
};

export function MessageList({
  messages,
  currentUserId,
  resolveMediaUrl,
}: Readonly<MessageListProps>) {
  // `inverted` colle le fil au bas de l'écran (dernier message visible, comme une messagerie) et
  // attend les données du plus récent au plus ancien — l'API les renvoie dans l'ordre inverse.
  const newestFirst = useMemo(() => [...messages].reverse(), [messages]);
  // La suite d'une note se lit dans l'ordre du fil, pas dans celui de l'affichage inversé (#529).
  const chain = useVoiceNoteChain((id) => nextVoiceNoteInThread(messages, id));

  return (
    <FlatList
      data={newestFirst}
      inverted
      keyExtractor={(message) => message.id}
      // L'état que lit `renderItem` se déclare : `FlatList` est un `PureComponent`, et un
      // `renderItem` stabilisé un jour priverait la note désignée de son rendu.
      extraData={chain.cuedId}
      contentContainerClassName="gap-2 p-4"
      renderItem={({ item }) => (
        <MessageBubble
          message={item}
          mine={item.senderId === currentUserId}
          resolveMediaUrl={resolveMediaUrl}
          voiceNoteCue={chain.cueOf(item.id)}
        />
      )}
    />
  );
}
