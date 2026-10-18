import {
  type ConversationCandidatesDto,
  type ConversationDto,
  type CreateConversationInput,
  type MessageDto,
  type SendMessageInput,
  withConversation,
} from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { messageApi, messageKeys } from "@/feature/message/api";
import { useExercisedCapability } from "@/shared/hook/useExercisedCapability";
import { keepThreadUrls } from "@/shared/lib/signed-url";

// Le fil se rafraîchit toutes les 10 s en messagerie asynchrone (CDC §5.8) — mais seulement quand
// l'écran est au premier plan : polling en continu viderait la batterie.
const POLL_INTERVAL_MS = 10_000;

/**
 * Les fils de l'acteur, sous le titre qu'il exerce — chacun porte SA marque de lecture (#611). Pas
 * de sondage : le retour au premier plan, le tirer-pour-rafraîchir et l'invalidation par `markRead`
 * suffisent (un intervalle permanent viderait la batterie pour des compteurs qu'on ne regarde pas
 * changer).
 */
export function useConversations() {
  const as = useExercisedCapability();
  return useQuery<ConversationDto[]>({
    queryKey: messageKeys.conversations(as),
    queryFn: () => messageApi.listConversations(as),
  });
}

/**
 * Une conversation de MA liste, par son id : c'est la liste qui porte ses participants et ma
 * marque de lecture (#611), et `markRead` l'invalide. Pas de requête de plus — la liste, montée
 * sous le fil dans la pile de l'onglet Messages, la tient déjà. `undefined` tant qu'elle charge,
 * `null` une fois chargée sans elle (lien périmé, conversation qui n'est pas la mienne).
 */
export function useConversation(conversationId: string) {
  const conversations = useConversations();
  const conversation =
    conversations.data == null
      ? undefined
      : (conversations.data.find((listed) => listed.id === conversationId) ?? null);
  return { conversation, conversations };
}

/** Qui l'acteur peut réunir, au titre qu'il exerce (#611) : de quoi « Nouvelle conversation ». */
export function useConversationCandidates() {
  const as = useExercisedCapability();
  return useQuery<ConversationCandidatesDto>({
    queryKey: messageKeys.candidates(as),
    queryFn: () => messageApi.listCandidates(as),
  });
}

/**
 * Crée une conversation, ou rouvre celle qui réunit déjà ces participants (#611) — c'est l'API qui
 * le décide, l'écran ouvre ce qu'elle rend. Posée aussitôt dans la liste en cache : le fil s'y lit
 * par son id, et y serait absent jusqu'à la relecture.
 */
export function useCreateConversation() {
  const queryClient = useQueryClient();
  const as = useExercisedCapability();
  return useMutation({
    mutationFn: (input: CreateConversationInput) => messageApi.createConversation(input, as),
    onSuccess: (conversation) => {
      queryClient.setQueryData<ConversationDto[]>(messageKeys.conversations(as), (list) =>
        withConversation(list, conversation),
      );
      void queryClient.invalidateQueries({ queryKey: messageKeys.conversations(as) });
    },
  });
}

/**
 * Ouvre (get-or-create) le fil du coach avec UN athlète désigné. Idempotent → sûr comme query.
 * `staleTime` infini : c'est une résolution stable, le sondage vit sur les messages.
 */
export function useConversationWith(athleteId: string | null) {
  return useQuery<ConversationDto>({
    queryKey: messageKeys.conversationWith(athleteId ?? ""),
    // Cibler un athlète, c'est agir en coach : le titre est dans le geste, pas dans le persona.
    queryFn: () =>
      messageApi.createConversation(
        { participants: [{ userId: athleteId as string, capability: "athlete" }] },
        "coach",
      ),
    // `null` tant que l'écran n'a pas chargé de quoi désigner l'athlète : un get-or-create sans
    // cible créerait un fil au hasard. Le hook est appelé inconditionnellement (règle des hooks),
    // c'est `enabled` qui décide s'il part.
    enabled: athleteId != null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * Ouvre (get-or-create) le fil de l'athlète avec UN de ses coachs (#599) : il en a 0..N, c'est
 * donc à lui de désigner lequel. Symétrique de `useConversationWith` : désigner un de ses coachs,
 * c'est agir en athlète. `null` tant que rien n'est désigné — même raison que côté coach.
 */
export function useConversationWithCoach(coachId: string | null) {
  return useQuery<ConversationDto>({
    queryKey: messageKeys.conversationWithCoach(coachId ?? ""),
    queryFn: () =>
      messageApi.createConversation(
        { participants: [{ userId: coachId as string, capability: "coach" }] },
        "athlete",
      ),
    enabled: coachId != null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * Ouvre (get-or-create) la conversation À DEUX avec un de mes coachs, depuis « Mes coachs » (#612).
 * Une mutation et non une query comme `useConversationWithCoach` : c'est un geste, et l'écran
 * navigue vers ce qu'elle rend. Toujours à titre d'athlète — c'est l'écran qui y bascule un compte
 * à double capacité —, donc pas de pose dans une liste dont la clé change sous ses pieds : la
 * conversation la relit si elle n'y est pas.
 */
export function useOpenCoachConversation() {
  return useMutation({
    mutationFn: (coachId: string) =>
      messageApi.createConversation(
        { participants: [{ userId: coachId, capability: "coach" }] },
        "athlete",
      ),
  });
}

export function useMessages(conversationId: string | undefined) {
  // Polling gated par le focus de l'écran (useFocusEffect) : pas de refetch quand l'onglet est
  // en arrière-plan. Le focusManager global (retour au premier plan) reste en plus actif.
  const [focused, setFocused] = useState(false);
  const as = useExercisedCapability();

  const query = useQuery<MessageDto[]>({
    queryKey: conversationId != null ? messageKeys.thread(conversationId, as) : messageKeys.all,
    queryFn: () => messageApi.getMessages(conversationId as string, as),
    enabled: conversationId != null,
    refetchInterval: focused && conversationId != null ? POLL_INTERVAL_MS : false,
    // Chaque sondage re-signe les médias : sans ça, une note vocale repart de zéro toutes les 10 s.
    structuralSharing: keepThreadUrls,
  });

  /**
   * Le polling seul ne suffit PAS à l'arrivée sur l'écran : le cache est persisté et frais 5 min,
   * donc rien n'est redemandé, et le premier tick n'arrive qu'au bout de 10 s. C'est précisément
   * le moment où l'on ouvre le fil — souvent depuis une notification — donc le pire endroit où
   * afficher l'état d'avant. On redemande à chaque passage au premier plan.
   *
   * `refetch` est stable (TanStack Query) : l'abonnement n'est pas recréé à chaque rendu.
   */
  const { refetch } = query;
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void refetch();
      return () => setFocused(false);
    }, [refetch]),
  );

  return query;
}

/**
 * `attachment` : ce sur quoi le message porte (« à propos de… »).
 *
 * Il vit ICI et non dans le `Composer` : la barre d'envoi ne sait rien du contexte où on l'a
 * posée, et c'est très bien — c'est l'écran qui répond depuis un débrief, pas elle. Sans ce
 * paramètre, une réponse écrite depuis le débrief partirait nue dans le fil.
 */
export function useSendMessage(conversationId: string, attachment?: { sessionFeedbackId: string }) {
  const queryClient = useQueryClient();
  const as = useExercisedCapability();
  return useMutation({
    mutationFn: (input: SendMessageInput) =>
      messageApi.sendMessage(conversationId, { ...input, ...attachment }, as),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.thread(conversationId, as) });
      // La liste des fils porte l'aperçu du dernier message : sans ça, le coach revient sur une
      // liste qui date d'avant son propre envoi (#309).
      queryClient.invalidateQueries({ queryKey: messageKeys.conversations(as) });
    },
  });
}

/**
 * Marque le fil comme lu. N'invalide QUE la liste des fils (unreadCount, la pastille), jamais les
 * messages : sinon le refetch relancerait le marquage en boucle. C'est l'écran qui décide quand
 * repartir — à chaque nouvel entrant, par son id (#305).
 *
 * Pas le fil résolu (`conversationWithCoach`) : on n'en lit que l'id, et l'invalider rejouerait
 * le get-or-create à chaque lecture (#309).
 */
export function useMarkRead(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  const as = useExercisedCapability();
  return useMutation({
    mutationFn: () => messageApi.markRead(conversationId as string, as),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.conversations(as) });
    },
  });
}
