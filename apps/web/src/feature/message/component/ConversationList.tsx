import type { ConversationDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvBadge } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

// Une ligne = un athlète, enrichi de son fil s'il existe (aperçu + non-lus). Sans fil, la ligne
// reste cliquable : la sélectionner crée le fil.
export type ConversationRow = {
  athleteId: string;
  athleteName: string;
  conversation: ConversationDto | null;
};

type ConversationListProps = {
  rows: ConversationRow[];
  selectedAthleteId: string | null;
  onSelect: (athleteId: string) => void;
};

export function ConversationList({
  rows,
  selectedAthleteId,
  onSelect,
}: Readonly<ConversationListProps>) {
  const { t } = useTranslation();

  return (
    <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-cmv-border border-r">
      {rows.map((row) => {
        const conversation = row.conversation;
        // Aperçu : le texte du dernier message ; pour un média, un libellé i18n depuis son type.
        const preview =
          conversation?.lastMessagePreview ??
          (conversation?.lastMessageType != null
            ? t(`messages.preview.${conversation.lastMessageType}`)
            : t("messages.noMessages"));

        return (
          <button
            type="button"
            key={row.athleteId}
            onClick={() => onSelect(row.athleteId)}
            className={cn(
              "flex flex-col gap-cmv-xs border-cmv-border border-b px-cmv-md py-cmv-sm text-left transition-colors",
              row.athleteId === selectedAthleteId ? "bg-cmv-surface" : "hover:bg-cmv-surface",
            )}
          >
            <div className="flex items-center gap-cmv-sm">
              <span className="flex-1 truncate text-cmv-body text-cmv-text-hi">
                {row.athleteName}
              </span>
              {conversation != null && conversation.unreadCount > 0 ? (
                <CmvBadge variant="accent">{String(conversation.unreadCount)}</CmvBadge>
              ) : null}
            </div>
            <span className="truncate text-cmv-caption text-cmv-text-mid">{preview}</span>
          </button>
        );
      })}
    </div>
  );
}
