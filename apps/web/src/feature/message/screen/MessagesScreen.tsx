import {
  type ConversationCandidatesDto,
  type ConversationDto,
  hasCandidates as hasAnyone,
  type TrainingCapability,
} from "@cmv/shared";
import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConversationList } from "@/feature/message/component/ConversationList";
import { MessageThread } from "@/feature/message/component/MessageThread";
import { NewConversationPanel } from "@/feature/message/component/NewConversationPanel";
import {
  seedConversation,
  useConversationCandidates,
  useConversations,
  useConversationWith,
  useConversationWithCoach,
} from "@/feature/message/hook/useMessages";
import type { MessagesSearch } from "@/routes/messages";
import { CmvAppShell, CmvButton, CmvEmptyState, CmvErrorState } from "@/shared/component";
import { useActingCapability, useExercisedCapability } from "@/shared/hook/useCapabilities";
import { authClient } from "@/shared/lib/auth";

// `getRouteApi` plutôt qu'un import de `Route` : l'écran est importé PAR la route, l'inverse
// fermerait le cycle. Le typage des search params est conservé.
const route = getRouteApi("/messages");

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values messages.noConversations: coach, athlete

/**
 * Messagerie (CDC §5.8), ouverte aux deux rôles depuis #29 : la liste des conversations à gauche,
 * celle qu'on a choisie à droite, à deux ou à plusieurs (#612).
 *
 * Une ligne par CONVERSATION, plus par interlocuteur (tranché en #612) : on écrit à quelqu'un de
 * nouveau par « Nouvelle conversation ». Les candidats (`GET /conversations/candidates`) et la
 * liste servent les deux titres par les mêmes routes — un seul écran, là où #599 en tenait deux.
 *
 * Le fil ouvert est porté par l'URL (`?conversation=`) et non par un `useState` : une notification
 * l'ouvre directement, et recharger la page ou revenir en arrière ne perd pas le fil.
 */
export function MessagesScreen() {
  const { t } = useTranslation();
  const as = useActingCapability();
  const exercised = useExercisedCapability();
  const navigate = useNavigate();
  const search = route.useSearch();
  const { data: session } = authClient.useSession();
  const conversations = useConversations();
  const candidates = useConversationCandidates();
  const [creating, setCreating] = useState(false);

  // Changer de fil ne change pas le TITRE auquel on lit : `as` est préservé, sinon un compte à
  // double capacité basculerait d'univers en cliquant sur une ligne. `replace: true` — parcourir
  // ses fils ne doit pas empiler vingt entrées d'historique à remonter une par une.
  const select = (conversationId: string) =>
    navigate({ to: "/messages", search: searchOf(conversationId, search.as), replace: true });

  const entry = useCounterpartEntry(as, exercised, search, candidates.data);

  const hasCandidates = hasAnyone(candidates.data);
  const isPending = conversations.isPending || candidates.isPending || entry.isLoading;
  const isError = conversations.isError || candidates.isError || entry.isError;
  const list = conversations.data ?? [];

  return (
    <CmvAppShell
      title={t("messages.title")}
      subtitle={t(as === "coach" ? "messages.subtitle" : "messages.athlete.subtitle")}
      actions={
        // Sans personne à réunir, il n'y a rien à créer (#598, E1) : le bouton n'est pas proposé.
        hasCandidates ? (
          <CmvButton onClick={() => setCreating(true)}>{t("messages.newConversation")}</CmvButton>
        ) : null
      }
    >
      {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

      {/* Trois états distincts, jamais confondus : « personne à qui écrire » sur une panne réseau
          serait un mensonge. */}
      {isError ? (
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => {
            conversations.refetch();
            candidates.refetch();
            if (entry.isError) entry.refetch();
          }}
        />
      ) : null}

      {!isPending && !isError && list.length === 0 ? (
        <NoConversation as={as} hasCandidates={hasCandidates} />
      ) : null}

      {!isPending && !isError && list.length > 0 ? (
        <ConversationsPane
          conversations={list}
          currentUserId={session?.user.id ?? null}
          selectedId={search.conversation}
          onSelect={select}
        />
      ) : null}

      {creating && candidates.data != null ? (
        <NewConversationPanel
          as={as}
          candidates={candidates.data}
          onClose={() => setCreating(false)}
          onOpened={(conversationId) => {
            setCreating(false);
            select(conversationId);
          }}
        />
      ) : null}
    </CmvAppShell>
  );
}

/** La liste et le fil choisi — ou l'invitation à en choisir un. */
function ConversationsPane({
  conversations,
  currentUserId,
  selectedId,
  onSelect,
}: Readonly<{
  conversations: readonly ConversationDto[];
  currentUserId: string | null;
  selectedId: string | undefined;
  onSelect: (conversationId: string) => void;
}>) {
  const { t } = useTranslation();
  const selected = conversations.find((listed) => listed.id === selectedId) ?? null;

  return (
    <div className="flex h-[calc(100vh-11rem)] overflow-hidden rounded-cmv-lg border border-cmv-border bg-cmv-bg-1">
      <ConversationList
        conversations={conversations}
        currentUserId={currentUserId}
        selectedId={selected?.id ?? null}
        onSelect={onSelect}
      />
      {selected == null ? (
        <div className="flex flex-1 items-center justify-center p-cmv-lg">
          <CmvEmptyState title={t("messages.pickThread.title")} />
        </div>
      ) : (
        // Une `key` sur la conversation : changer de fil remonte un fil neuf plutôt que de recycler
        // l'état du précédent (défilement, marquage lu).
        <MessageThread key={selected.id} conversation={selected} />
      )}
    </div>
  );
}

/** Le fil désigné par son id, au titre déjà précisé par l'URL. */
function searchOf(conversationId: string, as: TrainingCapability | undefined): MessagesSearch {
  return { athlete: undefined, coach: undefined, conversation: conversationId, as };
}

/**
 * Les entrées par interlocuteur — `?athlete=` depuis le tableau de suivi (#113), `?coach=` depuis
 * « Mes coachs » — ouvrent le fil À DEUX avec lui, créé au besoin, puis l'URL passe à
 * `?conversation=` : la liste ne sélectionne que par conversation.
 *
 * Seulement vers un CANDIDAT, au titre qui le permet : désigner un athlète, c'est agir en Coach. Un
 * lien périmé (athlète parti, coach quitté) n'ouvre rien, plutôt qu'un refus de l'API. Les deux
 * résolutions sont appelées inconditionnellement (règle des hooks), l'autre restant à `null`.
 */
function useCounterpartEntry(
  as: TrainingCapability,
  exercised: TrainingCapability | null,
  search: MessagesSearch,
  candidates: ConversationCandidatesDto | undefined,
) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pool = as === "coach" ? candidates?.athletes : candidates?.coaches;
  const requested = as === "coach" ? search.athlete : search.coach;
  const target = pool?.some((person) => person.userId === requested) ? (requested ?? null) : null;
  const withAthlete = useConversationWith(as === "coach" ? target : null);
  const withCoach = useConversationWithCoach(as === "athlete" ? target : null);
  const entry = as === "coach" ? withAthlete : withCoach;
  const resolved = entry.data;

  const asSearch = search.as;
  useEffect(() => {
    if (resolved == null) return;
    seedConversation(queryClient, exercised, resolved);
    void navigate({ to: "/messages", search: searchOf(resolved.id, asSearch), replace: true });
  }, [resolved, queryClient, exercised, navigate, asSearch]);

  return entry;
}

/**
 * Aucune conversation : sans personne à réunir, le dire et renvoyer vers ce qui y remédie ; sinon,
 * inviter à la première (#598, E1 et E2).
 */
function NoConversation({
  as,
  hasCandidates,
}: Readonly<{ as: TrainingCapability; hasCandidates: boolean }>) {
  const { t } = useTranslation();

  if (hasCandidates) {
    return (
      <CmvEmptyState
        title={t("messages.noConversations.title")}
        description={t(`messages.noConversations.${as}`)}
      />
    );
  }
  if (as === "coach") {
    return (
      <CmvEmptyState
        title={t("messages.noAthletes.title")}
        description={t("messages.noAthletes.description")}
      />
    );
  }
  // On garde le chemin vers « Mes coachs », seul accès aux invitations — la planche l'avait retiré.
  return (
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
  );
}
