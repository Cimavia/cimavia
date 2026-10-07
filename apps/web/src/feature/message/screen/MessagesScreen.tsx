import {
  type CapabilityName,
  type ConversationRelation,
  type ConversationRow,
  conversationRows,
  counterpartOfConversation,
} from "@cmv/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAthletes } from "@/feature/athlete/hook/useAthletes";
import { useMyCoaches } from "@/feature/coach";
import { ConversationList } from "@/feature/message/component/ConversationList";
import { MessageThread } from "@/feature/message/component/MessageThread";
import {
  useConversations,
  useConversationWith,
  useConversationWithCoach,
} from "@/feature/message/hook/useMessages";
import { CmvAppShell, CmvEmptyState, CmvErrorState } from "@/shared/component";
import { useActingCapability } from "@/shared/hook/useCapabilities";

// `getRouteApi` plutôt qu'un import de `Route` : l'écran est importé PAR la route, l'inverse
// fermerait le cycle. Le typage des search params est conservé.
const route = getRouteApi("/messages");

/**
 * Messagerie (CDC §5.8), ouverte aux deux rôles depuis #29.
 *
 * Les deux côtés ont la même forme depuis #599 — une liste de fils à gauche, le fil choisi à
 * droite — puisqu'un athlète peut être suivi par plusieurs coachs. Seules changent la source des
 * interlocuteurs et la façon d'ouvrir un fil.
 *
 * DEUX composants d'entrée plutôt qu'un seul avec des conditions, et ce n'est pas du style : le
 * coach lit la liste de SES athlètes (`GET /athletes`, coach seul) et l'athlète SES coachs
 * (`GET /me/coaches`, athlète seul). Les hooks React s'exécutent inconditionnellement — un `if` à
 * l'intérieur d'un composant unique ferait partir les deux requêtes et donnerait un 403 à chacun
 * sur sa propre messagerie.
 */
export function MessagesScreen() {
  // Le titre EXERCÉ décide de l'écran : un compte qui cumule a des fils des deux côtés.
  const isCoach = useActingCapability() === "coach";
  return isCoach ? <CoachMessages /> : <AthleteMessages />;
}

function CoachMessages() {
  const { t } = useTranslation();

  return (
    <ConversationsView
      as="coach"
      relations={useAthletes()}
      subtitle={t("messages.subtitle")}
      pickTitle={t("messages.pickThread.title")}
      empty={
        <CmvEmptyState
          title={t("messages.noAthletes.title")}
          description={t("messages.noAthletes.description")}
        />
      }
      renderThread={(row) => (
        <CoachThread
          key={row.counterpartId}
          athleteId={row.counterpartId}
          athleteName={row.counterpartName}
        />
      )}
    />
  );
}

/**
 * Sans coach, il n'y a pas de fil à ouvrir du tout (l'API refuserait). On le dit, et on renvoie
 * vers l'écran où une invitation s'accepte — plutôt qu'une messagerie vide sans explication.
 */
function AthleteMessages() {
  const { t } = useTranslation();

  return (
    <ConversationsView
      as="athlete"
      relations={useMyCoaches()}
      subtitle={t("messages.athlete.subtitle")}
      pickTitle={t("messages.athlete.pickThread")}
      empty={
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
      }
      renderThread={(row) => (
        <AthleteThread
          key={row.counterpartId}
          coachId={row.counterpartId}
          coachName={row.counterpartName}
        />
      )}
    />
  );
}

type ConversationsViewProps = {
  as: CapabilityName;
  relations: UseQueryResult<ConversationRelation[]>;
  subtitle: string;
  pickTitle: string;
  empty: ReactNode;
  /** Monté avec une `key` sur l'interlocuteur : changer de fil remonte un fil neuf plutôt que de
   * recycler l'état du précédent (défilement, marquage lu). */
  renderThread: (row: ConversationRow) => ReactNode;
};

/**
 * La liste des interlocuteurs (enrichie du dernier message et des non-lus) et le fil sélectionné.
 * Sélectionner un interlocuteur jamais contacté crée le fil à la volée.
 *
 * Le fil ouvert est porté par l'URL et non par un `useState` : c'est ce qui permet d'arriver
 * directement sur une conversation depuis le tableau de suivi (#113), « Mes coachs » ou une
 * notification, et ça évite de tenir deux sources de vérité en phase. `replace: true` — parcourir
 * ses fils ne doit pas empiler vingt entrées d'historique à remonter une par une.
 */
function ConversationsView({
  as,
  relations,
  subtitle,
  pickTitle,
  empty,
  renderThread,
}: Readonly<ConversationsViewProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const conversations = useConversations();
  const search = route.useSearch();

  const rows = useMemo(
    () => conversationRows(relations.data ?? [], conversations.data ?? [], as),
    [relations.data, conversations.data, as],
  );

  // L'interlocuteur nommé par l'URL, sinon celui du fil qu'une notification désigne.
  const requested =
    (as === "coach" ? search.athlete : search.coach) ??
    counterpartOfConversation(rows, search.conversation);
  const selected = rows.find((row) => row.counterpartId === requested) ?? null;

  // Changer de fil ne change pas le TITRE auquel on lit : `as` est préservé, sinon un compte à
  // double capacité basculerait d'univers en cliquant sur une ligne.
  const select = (counterpartId: string) =>
    navigate({
      to: "/messages",
      search: {
        athlete: as === "coach" ? counterpartId : undefined,
        coach: as === "athlete" ? counterpartId : undefined,
        conversation: undefined,
        as: search.as,
      },
      replace: true,
    });

  const isPending = relations.isPending || conversations.isPending;
  const isError = relations.isError || conversations.isError;

  return (
    <CmvAppShell title={t("messages.title")} subtitle={subtitle}>
      {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

      {/* Trois états distincts, jamais confondus : « personne à qui écrire » sur une panne réseau
          serait un mensonge. */}
      {isError ? (
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => {
            relations.refetch();
            conversations.refetch();
          }}
        />
      ) : null}

      {!isPending && !isError && rows.length === 0 ? empty : null}

      {!isPending && !isError && rows.length > 0 ? (
        <div className="flex h-[calc(100vh-11rem)] overflow-hidden rounded-cmv-lg border border-cmv-border bg-cmv-bg-1">
          <ConversationList
            rows={rows}
            selectedId={selected?.counterpartId ?? null}
            onSelect={select}
          />
          {selected == null ? (
            <div className="flex flex-1 items-center justify-center p-cmv-lg">
              <CmvEmptyState title={pickTitle} />
            </div>
          ) : (
            renderThread(selected)
          )}
        </div>
      ) : null}
    </CmvAppShell>
  );
}

// Résout le fil avec l'athlète sélectionné (get-or-create) avant de le rendre.
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

// Résout le fil avec le coach sélectionné (get-or-create) avant de le rendre (#599).
function AthleteThread({ coachId, coachName }: Readonly<{ coachId: string; coachName: string }>) {
  const conversation = useConversationWithCoach(coachId);

  return (
    <MessageThread
      conversationId={conversation.data?.id}
      counterpartName={coachName}
      hasResolveError={conversation.isError}
      onRetry={() => conversation.refetch()}
    />
  );
}
