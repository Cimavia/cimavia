import { Role } from "@cmv/shared";
import { Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAthletes } from "@/feature/athlete/hook/useAthletes";
import {
  ConversationList,
  type ConversationRow,
} from "@/feature/message/component/ConversationList";
import { MessageThread } from "@/feature/message/component/MessageThread";
import { useConversations } from "@/feature/message/hook/useMessages";
import { CmvAppShell, CmvEmptyState, CmvErrorState } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

/**
 * Messagerie du coach (CDC §5.8) : la liste de SES athlètes à gauche (enrichie du dernier message
 * et des non-lus), le fil sélectionné à droite. Sélectionner un athlète jamais contacté crée le
 * fil à la volée.
 */
export function MessagesScreen() {
  const { t } = useTranslation();
  const { data: authSession, isPending: isAuthPending } = authClient.useSession();
  const athletes = useAthletes();
  const conversations = useConversations();

  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);

  // Fusion athlètes × fils, triée : les fils les plus récemment actifs d'abord, puis les athlètes
  // sans échange (ordre de la liste d'athlètes).
  const rows = useMemo<ConversationRow[]>(() => {
    const byAthlete = new Map(
      (conversations.data ?? []).map((conversation) => [conversation.counterpartId, conversation]),
    );
    return (athletes.data ?? [])
      .map((relation) => ({
        athleteId: relation.athleteId,
        athleteName: relation.athleteName,
        conversation: byAthlete.get(relation.athleteId) ?? null,
      }))
      .sort((a, b) =>
        (b.conversation?.lastMessageAt ?? "").localeCompare(a.conversation?.lastMessageAt ?? ""),
      );
  }, [athletes.data, conversations.data]);

  if (isAuthPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cmv-bg-0 text-cmv-text-mid">
        {t("common.loading")}
      </main>
    );
  }
  if (authSession?.user.role !== Role.COACH) {
    return <Navigate to="/" />;
  }

  const selected = rows.find((row) => row.athleteId === selectedAthleteId) ?? null;
  const isPending = athletes.isPending || conversations.isPending;
  const isError = athletes.isError || conversations.isError;

  return (
    <CmvAppShell title={t("messages.title")} subtitle={t("messages.subtitle")}>
      {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

      {isError ? (
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => {
            athletes.refetch();
            conversations.refetch();
          }}
        />
      ) : null}

      {!isPending && !isError && rows.length === 0 ? (
        <CmvEmptyState
          title={t("messages.noAthletes.title")}
          description={t("messages.noAthletes.description")}
        />
      ) : null}

      {!isPending && !isError && rows.length > 0 ? (
        <div className="flex h-[calc(100vh-11rem)] overflow-hidden rounded-cmv-lg border border-cmv-border bg-cmv-bg-1">
          <ConversationList
            rows={rows}
            selectedAthleteId={selectedAthleteId}
            onSelect={setSelectedAthleteId}
          />
          {selected != null ? (
            <MessageThread
              key={selected.athleteId}
              athleteId={selected.athleteId}
              athleteName={selected.athleteName}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-cmv-lg">
              <CmvEmptyState title={t("messages.pickThread.title")} />
            </div>
          )}
        </div>
      ) : null}
    </CmvAppShell>
  );
}
