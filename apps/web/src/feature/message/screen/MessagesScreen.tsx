import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAthletes } from "@/feature/athlete/hook/useAthletes";
import { useMyCoach } from "@/feature/coach";
import {
  ConversationList,
  type ConversationRow,
} from "@/feature/message/component/ConversationList";
import { MessageThread } from "@/feature/message/component/MessageThread";
import {
  useConversations,
  useConversationWith,
  useMyConversation,
} from "@/feature/message/hook/useMessages";
import { CmvAppShell, CmvEmptyState, CmvErrorState } from "@/shared/component";
import { useActingCapability } from "@/shared/hook/useCapabilities";

// `getRouteApi` plutôt qu'un import de `Route` : l'écran est importé PAR la route, l'inverse
// fermerait le cycle. Le typage des search params est conservé.
const route = getRouteApi("/messages");

/**
 * Messagerie (CDC §5.8), ouverte aux deux rôles depuis #29.
 *
 * DEUX composants plutôt qu'un seul avec des conditions, et ce n'est pas du style : le coach lit
 * la liste de SES athlètes (`GET /athletes`, coach seul) et l'athlète SON coach (`GET /me/coach`,
 * athlète seul). Les hooks React s'exécutent inconditionnellement — un `if` à l'intérieur d'un
 * composant unique ferait partir les deux requêtes et donnerait un 403 à chacun sur sa propre
 * messagerie. La séparation en composants est ce qui rend la chose correcte, pas un `enabled`
 * ajouté après coup.
 */
export function MessagesScreen() {
  // Le titre EXERCÉ décide de l'écran : un compte qui cumule a des fils des deux côtés.
  const isCoach = useActingCapability() === "coach";
  return isCoach ? <CoachMessages /> : <AthleteMessages />;
}

/**
 * Côté coach : la liste de SES athlètes à gauche (enrichie du dernier message et des non-lus), le
 * fil sélectionné à droite. Sélectionner un athlète jamais contacté crée le fil à la volée.
 *
 * Le fil ouvert est porté par l'URL (`?athlete=<id>`) et non par un `useState` : c'est ce qui
 * permet d'arriver directement sur une conversation depuis le tableau de suivi (#113), et ça évite
 * de tenir deux sources de vérité en phase. `replace: true` — parcourir ses fils ne doit pas
 * empiler vingt entrées d'historique à remonter une par une.
 */
function CoachMessages() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const athletes = useAthletes();
  const conversations = useConversations();

  const { athlete: selectedAthleteId, as } = route.useSearch();
  // Changer de fil ne change pas le TITRE auquel on lit : le préserver, sinon un compte à double
  // capacité basculerait d'univers en cliquant sur un athlète.
  const selectAthlete = (athleteId: string) =>
    navigate({ to: "/messages", search: { athlete: athleteId, as }, replace: true });

  // Fusion athlètes × fils, triée : les fils les plus récemment actifs d'abord, puis les athlètes
  // sans échange (ordre de la liste d'athlètes).
  const rows = useMemo<ConversationRow[]>(() => {
    const byAthlete = new Map(
      (conversations.data ?? []).map((conversation) => [conversation.counterpartId, conversation]),
    );
    return (
      (athletes.data ?? [])
        // L'entrée SYNTHÉTIQUE de l'auto-coaching est écartée ici, et ici seulement (#198) : elle
        // reste sur `GET /athletes`, dont le builder et le tableau de bord dépendent (#14). La
        // messagerie est la seule surface où elle n'a pas de sens — le fil `(soi, soi)` ne peut pas
        // exister, et la ligne menait à un écran d'erreur.
        .filter((relation) => !relation.isSelf)
        .map((relation) => ({
          athleteId: relation.athleteId,
          athleteName: relation.athleteName,
          conversation: byAthlete.get(relation.athleteId) ?? null,
        }))
        .sort((a, b) =>
          (b.conversation?.lastMessageAt ?? "").localeCompare(a.conversation?.lastMessageAt ?? ""),
        )
    );
  }, [athletes.data, conversations.data]);

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
            selectedAthleteId={selectedAthleteId ?? null}
            onSelect={selectAthlete}
          />
          {selected == null ? (
            <div className="flex flex-1 items-center justify-center p-cmv-lg">
              <CmvEmptyState title={t("messages.pickThread.title")} />
            </div>
          ) : (
            <CoachThread
              key={selected.athleteId}
              athleteId={selected.athleteId}
              athleteName={selected.athleteName}
            />
          )}
        </div>
      ) : null}
    </CmvAppShell>
  );
}

// Résout le fil avec l'athlète sélectionné (get-or-create) avant de le rendre. Monté avec une
// `key` sur l'athlète : changer d'interlocuteur remonte un fil neuf plutôt que de recycler
// l'état du précédent (défilement, marquage lu).
function CoachThread({
  athleteId,
  athleteName,
}: Readonly<{ athleteId: string; athleteName: string }>) {
  const conversation = useConversationWith(athleteId);

  return (
    <MessageThread
      conversationId={conversation.data?.id}
      counterpartName={athleteName}
      hasResolveError={conversation.isError}
      onRetry={() => conversation.refetch()}
    />
  );
}

/**
 * Côté athlète : UN seul fil, celui avec son coach — il en a au plus un (invariant multi-tenant).
 * Donc pas de colonne de fils à gauche : il n'y aurait qu'une ligne à y mettre.
 *
 * Sans coach, il n'y a pas de fil à ouvrir du tout (l'API refuserait). On le dit, et on renvoie
 * vers l'écran qui permet d'en rejoindre un — plutôt qu'une messagerie vide sans explication.
 */
function AthleteMessages() {
  const { t } = useTranslation();
  const coach = useMyCoach();
  const conversation = useMyConversation(coach.data != null);

  return (
    <CmvAppShell title={t("messages.title")} subtitle={t("messages.athlete.subtitle")}>
      {coach.isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

      {coach.isError ? (
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => coach.refetch()}
        />
      ) : null}

      {!coach.isPending && !coach.isError && coach.data == null ? (
        <CmvEmptyState
          title={t("messages.athlete.noCoach.title")}
          description={t("messages.athlete.noCoach.description")}
          action={
            <Link
              to="/my-coach"
              className="inline-flex items-center rounded-cmv-md bg-cmv-accent px-cmv-lg py-cmv-sm text-cmv-body text-cmv-accent-fg transition-colors hover:bg-cmv-accent-hi"
            >
              {t("messages.athlete.noCoach.action")}
            </Link>
          }
        />
      ) : null}

      {coach.data == null ? null : (
        <div className="flex h-[calc(100vh-11rem)] overflow-hidden rounded-cmv-lg border border-cmv-border bg-cmv-bg-1">
          <MessageThread
            conversationId={conversation.data?.id}
            counterpartName={coach.data.coachName}
            hasResolveError={conversation.isError}
            onRetry={() => conversation.refetch()}
          />
        </div>
      )}
    </CmvAppShell>
  );
}
