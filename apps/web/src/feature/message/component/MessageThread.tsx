import { createReadMarker, lastUnreadIncomingId, nextVoiceNoteInThread } from "@cmv/shared";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { messageKeys } from "@/feature/message/api";
import { Composer } from "@/feature/message/component/Composer";
import { MessageBubble } from "@/feature/message/component/MessageBubble";
import { useMarkRead, useSendMessage, useThreadMessages } from "@/feature/message/hook/useMessages";
import { useSendMessageMedia } from "@/feature/message/hook/useSendMessageMedia";
import { CmvErrorState } from "@/shared/component";
import { useExercisedCapability } from "@/shared/hook/useCapabilities";
import { useFreshMediaUrl } from "@/shared/hook/useFreshMediaUrl";
import { useVoiceNoteChain } from "@/shared/hook/useVoiceNoteChain";
import { authClient } from "@/shared/lib/auth";

type MessageThreadProps = {
  /**
   * Le fil DÉJÀ résolu par l'appelant. C'est lui qui sait comment : le coach ouvre le fil d'un
   * athlète désigné, l'athlète le sien avec son coach. Résoudre ici obligerait ce composant à
   * connaître les deux rôles pour n'en servir qu'un à la fois.
   */
  conversationId: string | undefined;
  counterpartName: string;
  /** La résolution du fil a échoué — distinct d'un échec de chargement des messages. */
  hasResolveError: boolean;
  onRetry: () => void;
};

/**
 * Un fil 1:1, quel que soit le bout par lequel on le regarde : charge ses messages en polling,
 * marque lu à l'arrivée d'un message entrant, et colle au dernier.
 */
export function MessageThread({
  conversationId,
  counterpartName,
  hasResolveError,
  onRetry,
}: Readonly<MessageThreadProps>) {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();
  const messages = useThreadMessages(conversationId);
  const freshMediaUrl = useFreshMediaUrl(
    messageKeys.thread(conversationId ?? "", useExercisedCapability()),
  );
  const send = useSendMessage(conversationId ?? "");
  // On ne garde que `mutate`, garanti stable par TanStack Query : la stabilité devient vérifiable
  // par le linter au lieu de reposer sur un commentaire.
  const { mutate: markRead } = useMarkRead(conversationId);
  const media = useSendMessageMedia(conversationId ?? "");

  const currentUserId = session?.user.id ?? "";
  const items = messages.data ?? [];
  const chain = useVoiceNoteChain((id) => nextVoiceNoteInThread(items, id));

  // Marque lu à CHAQUE nouvel entrant, repéré par son id (#305) : la règle et son pourquoi vivent
  // dans `message-read.util`. `markRead` n'invalide que la liste de fils (pas les messages) : pas
  // de boucle.
  const unreadTarget = lastUnreadIncomingId(items, session?.user.id ?? null);
  const [readMarker] = useState(createReadMarker);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `messages.dataUpdatedAt` est un déclencheur, pas une donnée lue — chaque sondage redonne sa chance à un marquage en échec.
  useEffect(() => {
    if (conversationId == null || unreadTarget == null || !readMarker.claim(unreadTarget)) return;
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
      <header className="border-cmv-border border-b px-cmv-lg py-cmv-md">
        <h2 className="text-cmv-subtitle text-cmv-text-hi">{counterpartName}</h2>
      </header>

      {hasResolveError || messages.isError ? (
        <div className="flex flex-1 items-center justify-center p-cmv-lg">
          <CmvErrorState
            title={t("common.errorTitle")}
            description={t("messages.loadError")}
            retryLabel={t("common.retry")}
            onRetry={onRetry}
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
              resolveMediaUrl={freshMediaUrl}
              voiceNoteCue={chain.cueOf(message.id)}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      <Composer
        onSendText={(content) => send.mutateAsync({ type: "TEXT", content })}
        onSendFiles={media.sendFiles}
        onRecordedAudio={media.sendAudio}
        // Tant que le fil n'est pas résolu — en cours, ou en échec —, écrire n'aboutirait nulle
        // part : la barre reste visible mais fermée, comme sous un débrief (`FeedbackReplyThread`).
        sending={send.isPending || conversationId == null}
        mediaBusy={media.isUploading || conversationId == null}
        progress={media.progress}
        retry={media.retry}
        step={media.step}
      />
    </div>
  );
}
