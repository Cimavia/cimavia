import {
  type ConversationDto,
  conversationSubtitleText,
  conversationTitle,
  createReadMarker,
  emptyThreadText,
  incomingCountAfter,
  lastUnreadIncomingId,
  type MessageDto,
  messageAuthorOf,
  nextVoiceNoteInThread,
  readByOf,
  readByText,
} from "@cmv/shared";
import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { messageKeys } from "@/feature/message/api";
import { Composer } from "@/feature/message/component/Composer";
import { MessageBubble } from "@/feature/message/component/MessageBubble";
import { NewMessagesPill } from "@/feature/message/component/NewMessagesPill";
import { ParticipantAvatars } from "@/feature/message/component/ParticipantAvatars";
import { useMarkRead, useSendMessage, useThreadMessages } from "@/feature/message/hook/useMessages";
import { useSendMessageMedia } from "@/feature/message/hook/useSendMessageMedia";
import { CmvErrorState } from "@/shared/component";
import { useExercisedCapability } from "@/shared/hook/useCapabilities";
import { useFreshMediaUrl } from "@/shared/hook/useFreshMediaUrl";
import { useStickToBottom } from "@/shared/hook/useStickToBottom";
import { useVoiceNoteChain } from "@/shared/hook/useVoiceNoteChain";
import { authClient } from "@/shared/lib/auth";

/**
 * Le fil suit le lecteur (#367) : collé au bas tant qu'il y est, laissé en paix s'il remonte — et
 * `unseen` compte ce qui est arrivé depuis, pour la pastille. `null` : rien à signaler, ou rien de
 * sûr à compter.
 *
 * Ce qui ramène au bas est un GESTE d'envoi sur cet écran (voir `MessageThread`), pas « le dernier
 * message est de moi » : un entrant arrivé dans le même sondage le masquerait, et un message à mon
 * nom posté d'ailleurs — le mobile, un avis de débrief — me tirerait vers le bas sans que j'aie
 * rien fait ici.
 */
function useThreadScroll(items: readonly MessageDto[], currentUserId: string | null) {
  const thread = useStickToBottom();
  const lastId = items.at(-1)?.id ?? null;

  // Le dernier message vu au bas : ce qui arrive après, le lecteur parti ne l'a pas vu. Ajusté au
  // rendu, pas dans un effet — la pastille ne doit pas clignoter le temps d'un second rendu.
  const [seenUpTo, setSeenUpTo] = useState<string | null>(null);
  if (thread.atBottom && seenUpTo !== lastId) setSeenUpTo(lastId);
  const unseen = thread.atBottom ? null : incomingCountAfter(items, seenUpTo, currentUserId);
  return { thread, unseen };
}

type MessageThreadProps = {
  /**
   * La conversation telle que la liste sondée la porte : ses participants font l'en-tête, et c'est
   * elle qui suit MA marque de lecture (#611) — `markRead` l'invalide.
   */
  conversation: ConversationDto;
};

/**
 * Une conversation, à deux ou à plusieurs, quel que soit le bout par lequel on la regarde : charge
 * ses messages en polling, marque lu à l'arrivée d'un message entrant, et reste collé au bas tant
 * que le lecteur y est (#367).
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
  const { thread, unseen } = useThreadScroll(items, currentUserId);
  const { atBottom, stickToBottom } = thread;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `messages.dataUpdatedAt` est un déclencheur, pas une donnée lue — chaque sondage redonne sa chance à un marquage en échec.
  useEffect(() => {
    // Lu, c'est vu (#367) : un lecteur parti dans l'historique n'a pas sous les yeux ce qui arrive
    // au bas. Le fil ne l'y ramène plus — le marquage attend qu'il y revienne.
    if (!atBottom || unreadTarget == null || !readMarker.claim(unreadTarget)) return;
    markRead(undefined, { onError: () => readMarker.release(unreadTarget) });
  }, [conversationId, unreadTarget, readMarker, markRead, messages.dataUpdatedAt, atBottom]);

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
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={thread.scrollRef} className="flex flex-1 flex-col overflow-y-auto p-cmv-lg">
            <div ref={thread.contentRef} className="flex flex-1 flex-col gap-cmv-sm">
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
            </div>
          </div>
          <NewMessagesPill count={unseen} onClick={thread.scrollToBottom} />
        </div>
      )}

      <Composer
        // Envoyer, c'est vouloir voir son message partir : le geste ramène au bas, d'où qu'on écrive.
        onSendText={(content) => {
          stickToBottom();
          return send.mutateAsync({ type: "TEXT", content });
        }}
        onSendFiles={(files) => {
          stickToBottom();
          media.sendFiles(files);
        }}
        onRecordedAudio={(audio) => {
          stickToBottom();
          media.sendAudio(audio);
        }}
        sending={send.isPending}
        mediaBusy={media.isUploading}
        progress={media.progress}
        retry={media.retry}
        step={media.step}
      />
    </div>
  );
}
