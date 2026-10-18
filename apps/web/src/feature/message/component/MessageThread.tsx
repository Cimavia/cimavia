import {
  type ConversationDto,
  conversationSubtitleText,
  conversationTitle,
  createReadMarker,
  emptyThreadText,
  lastUnreadIncomingId,
  messageAuthorOf,
  nextVoiceNoteInThread,
  readByOf,
  readByText,
} from "@cmv/shared";
import { Fragment, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { messageKeys } from "@/feature/message/api";
import { Composer } from "@/feature/message/component/Composer";
import { MessageBubble } from "@/feature/message/component/MessageBubble";
import { ParticipantAvatars } from "@/feature/message/component/ParticipantAvatars";
import { useMarkRead, useSendMessage, useThreadMessages } from "@/feature/message/hook/useMessages";
import { useSendMessageMedia } from "@/feature/message/hook/useSendMessageMedia";
import { CmvErrorState } from "@/shared/component";
import { useExercisedCapability } from "@/shared/hook/useCapabilities";
import { useFreshMediaUrl } from "@/shared/hook/useFreshMediaUrl";
import { useVoiceNoteChain } from "@/shared/hook/useVoiceNoteChain";
import { authClient } from "@/shared/lib/auth";

type MessageThreadProps = {
  /**
   * La conversation telle que la liste sondée la porte : ses participants font l'en-tête, et c'est
   * elle qui suit MA marque de lecture (#611) — `markRead` l'invalide.
   */
  conversation: ConversationDto;
};

/**
 * Une conversation, à deux ou à plusieurs, quel que soit le bout par lequel on la regarde : charge
 * ses messages en polling, marque lu à l'arrivée d'un message entrant, et colle au dernier.
 *
 * À plusieurs (#612), chaque bulle reçue porte son auteur, et « Lu par » suit mon dernier message.
 */
export function MessageThread({ conversation }: Readonly<MessageThreadProps>) {
  const conversationId = conversation.id;
  const lastReadAt = conversation.lastReadAt;
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();
  const messages = useThreadMessages(conversationId);
  const freshMediaUrl = useFreshMediaUrl(
    messageKeys.thread(conversationId, useExercisedCapability()),
  );
  const send = useSendMessage(conversationId);
  // On ne garde que `mutate`, garanti stable par TanStack Query : la stabilité devient vérifiable
  // par le linter au lieu de reposer sur un commentaire.
  const { mutate: markRead } = useMarkRead(conversationId);
  const media = useSendMessageMedia(conversationId);

  const currentUserId = session?.user.id ?? null;
  const items = messages.data ?? [];
  const chain = useVoiceNoteChain((id) => nextVoiceNoteInThread(items, id));

  // Marque lu à CHAQUE nouvel entrant, repéré par son id (#305) : la règle et son pourquoi vivent
  // dans `message-read.util`. `markRead` n'invalide que la liste de fils (pas les messages) : pas
  // de boucle.
  const unreadTarget = lastUnreadIncomingId(items, currentUserId, lastReadAt);
  const readBy = readByOf(conversation, items, currentUserId);
  const [readMarker] = useState(createReadMarker);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `messages.dataUpdatedAt` est un déclencheur, pas une donnée lue — chaque sondage redonne sa chance à un marquage en échec.
  useEffect(() => {
    if (unreadTarget == null || !readMarker.claim(unreadTarget)) return;
    markRead(undefined, { onError: () => readMarker.release(unreadTarget) });
  }, [conversationId, unreadTarget, readMarker, markRead, messages.dataUpdatedAt]);

  // Colle le fil au dernier message à chaque arrivée.
  const bottomRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `items.length` est un déclencheur, pas une donnée lue par l'effet — l'arrivée d'un message doit relancer le défilement.
  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [items.length]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-cmv-md border-cmv-border border-b px-cmv-lg py-cmv-md">
        <ParticipantAvatars participants={conversation.participants} max={3} />
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate text-cmv-subtitle text-cmv-text-hi">
            {conversationTitle(conversation) ?? "—"}
          </h2>
          <p className="text-cmv-caption text-cmv-text-mid">
            {conversationSubtitleText(conversation, t) ?? "—"}
          </p>
        </div>
      </header>

      {messages.isError ? (
        <div className="flex flex-1 items-center justify-center p-cmv-lg">
          <CmvErrorState
            title={t("common.errorTitle")}
            description={t("messages.loadError")}
            retryLabel={t("common.retry")}
            onRetry={() => messages.refetch()}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-cmv-sm overflow-y-auto p-cmv-lg">
          {items.length === 0 && !messages.isPending ? (
            <div className="m-auto flex flex-col items-center gap-cmv-xs text-center">
              <p className="text-cmv-text-hi">{t("messages.empty.title")}</p>
              <p className="text-cmv-caption text-cmv-text-mid">
                {emptyThreadText(conversation, t)}
              </p>
            </div>
          ) : null}
          {items.map((message) => (
            <Fragment key={message.id}>
              <MessageBubble
                message={message}
                mine={message.senderId === currentUserId}
                author={messageAuthorOf(conversation, message.senderId, currentUserId)}
                resolveMediaUrl={freshMediaUrl}
                voiceNoteCue={chain.cueOf(message.id)}
              />
              {readBy?.messageId === message.id ? (
                <p className="self-end text-cmv-caption text-cmv-text-lo">
                  {readByText(readBy, t)}
                </p>
              ) : null}
            </Fragment>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      <Composer
        onSendText={(content) => send.mutateAsync({ type: "TEXT", content })}
        onSendFiles={media.sendFiles}
        onRecordedAudio={media.sendAudio}
        sending={send.isPending}
        mediaBusy={media.isUploading}
        progress={media.progress}
        retry={media.retry}
        step={media.step}
      />
    </div>
  );
}
