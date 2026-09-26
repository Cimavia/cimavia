import type { MessageDto } from "@cmv/shared";
import { useMemo } from "react";
import { FlatList } from "react-native";
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

  return (
    <FlatList
      data={newestFirst}
      inverted
      keyExtractor={(message) => message.id}
      contentContainerClassName="gap-2 p-4"
      renderItem={({ item }) => (
        <MessageBubble
          message={item}
          mine={item.senderId === currentUserId}
          resolveMediaUrl={resolveMediaUrl}
        />
      )}
    />
  );
}
