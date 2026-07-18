import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Composer } from "@/feature/message/component/Composer";
import { MessageBubble } from "@/feature/message/component/MessageBubble";
import {
  useConversationWith,
  useMarkRead,
  useSendMessage,
  useThreadMessages,
} from "@/feature/message/hook/useMessages";
import { useSendMessageMedia } from "@/feature/message/hook/useSendMessageMedia";
import { CmvErrorState } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

type MessageThreadProps = {
  athleteId: string;
  athleteName: string;
};

/**
 * Fil avec un athlète (côté coach). Ouvre le fil (get-or-create), charge ses messages en polling,
 * et marque lu à l'arrivée d'un message entrant.
 */
export function MessageThread({ athleteId, athleteName }: Readonly<MessageThreadProps>) {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();
  const conversation = useConversationWith(athleteId);
  const conversationId = conversation.data?.id;
  const messages = useThreadMessages(conversationId);
  const send = useSendMessage(conversationId ?? "");
  const markRead = useMarkRead(conversationId);
  const media = useSendMessageMedia(conversationId ?? "");

  const currentUserId = session?.user.id ?? "";
  const items = messages.data ?? [];

  // Marque lu dès qu'un message entrant non lu apparaît. `markRead` n'invalide que la liste de
  // fils (pas les messages) : pas de boucle. `mutate` est stable → hors dépendances.
  const hasIncomingUnread = items.some(
    (message) => message.senderId !== currentUserId && message.readAt == null,
  );
  useEffect(() => {
    if (conversationId != null && hasIncomingUnread) {
      markRead.mutate();
    }
  }, [conversationId, hasIncomingUnread]);

  // Colle le fil au dernier message à chaque arrivée.
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [items.length]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-cmv-border border-b px-cmv-lg py-cmv-md">
        <h2 className="text-cmv-subtitle text-cmv-text-hi">{athleteName}</h2>
      </header>

      {conversation.isError || messages.isError ? (
        <div className="flex flex-1 items-center justify-center p-cmv-lg">
          <CmvErrorState
            title={t("common.errorTitle")}
            description={t("messages.loadError")}
            retryLabel={t("common.retry")}
            onRetry={() => (conversationId == null ? conversation : messages).refetch()}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-cmv-sm overflow-y-auto p-cmv-lg">
          {items.length === 0 && !messages.isPending ? (
            <p className="m-auto text-cmv-text-mid">{t("messages.empty.description")}</p>
          ) : null}
          {items.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              mine={message.senderId === currentUserId}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      <Composer
        onSendText={(content) => send.mutate({ type: "TEXT", content })}
        onSendFile={media.sendFile}
        onRecordedAudio={media.sendAudio}
        sending={send.isPending}
        mediaBusy={media.isUploading}
        progress={media.progress}
      />
    </div>
  );
}
