import { type ConversationDto, conversationPreviewText, conversationTitle } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { ParticipantAvatars } from "@/feature/message/component/ParticipantAvatars";
import { CmvBadge } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";
import { formatRelativeTime } from "@/shared/util/date.util";

// Une ligne = une conversation, à deux ou à plusieurs (#612) — l'API les trie, une conversation
// vide à sa création. Un interlocuteur jamais contacté n'a pas de ligne : on lui écrit par
// « Nouvelle conversation » (tranché en #612).
type ConversationListProps = {
  conversations: readonly ConversationDto[];
  currentUserId: string | null;
  selectedId: string | null;
  onSelect: (conversationId: string) => void;
};

export function ConversationList({
  conversations,
  currentUserId,
  selectedId,
  onSelect,
}: Readonly<ConversationListProps>) {
  const { t } = useTranslation();

  return (
    <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-cmv-border border-r">
      {conversations.map((conversation) => (
        <button
          type="button"
          key={conversation.id}
          onClick={() => onSelect(conversation.id)}
          aria-current={conversation.id === selectedId ? "true" : undefined}
          className={cn(
            "flex items-center gap-cmv-sm border-cmv-border border-b px-cmv-md py-cmv-sm text-left transition-colors",
            conversation.id === selectedId ? "bg-cmv-surface" : "hover:bg-cmv-surface",
          )}
        >
          <ParticipantAvatars participants={conversation.participants} max={2} />
          <span className="flex min-w-0 flex-1 flex-col gap-cmv-xs">
            <span className="flex items-center gap-cmv-sm">
              <span className="flex-1 truncate text-cmv-body text-cmv-text-hi">
                {conversationTitle(conversation) ?? "—"}
              </span>
              {/* `null` = aucun échange : pas de date inventée. */}
              <span className="shrink-0 text-cmv-caption text-cmv-text-lo">
                {conversation.lastMessageAt == null
                  ? "—"
                  : formatRelativeTime(conversation.lastMessageAt)}
              </span>
            </span>
            <span className="flex items-center gap-cmv-sm">
              <span className="flex-1 truncate text-cmv-caption text-cmv-text-mid">
                {/* `null` : conversation encore vide (#598, E3). */}
                {conversationPreviewText(conversation, currentUserId, t) ?? "—"}
              </span>
              {conversation.unreadCount > 0 ? (
                <CmvBadge variant="accent">{String(conversation.unreadCount)}</CmvBadge>
              ) : null}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
