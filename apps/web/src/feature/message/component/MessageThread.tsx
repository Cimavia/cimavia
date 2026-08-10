import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Composer } from "@/feature/message/component/Composer";
import { MessageBubble } from "@/feature/message/component/MessageBubble";
import { useMarkRead, useSendMessage, useThreadMessages } from "@/feature/message/hook/useMessages";
import { useSendMessageMedia } from "@/feature/message/hook/useSendMessageMedia";
import { CmvErrorState } from "@/shared/component";
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
  const send = useSendMessage(conversationId ?? "");
  // On ne garde que `mutate`, garanti stable par TanStack Query : la stabilité devient vérifiable
  // par le linter au lieu de reposer sur un commentaire.
  const { mutate: markRead } = useMarkRead(conversationId);
  const media = useSendMessageMedia(conversationId ?? "");

  const currentUserId = session?.user.id ?? "";
  const items = messages.data ?? [];

  // Marque lu dès qu'un message entrant non lu apparaît. `markRead` n'invalide que la liste de
  // fils (pas les messages) : pas de boucle.
  const hasIncomingUnread = items.some(
    (message) => message.senderId !== currentUserId && message.readAt == null,
  );
  useEffect(() => {
    if (conversationId != null && hasIncomingUnread) {
      markRead();
    }
  }, [conversationId, hasIncomingUnread, markRead]);

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
