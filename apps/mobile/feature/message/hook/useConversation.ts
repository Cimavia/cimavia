import type { ConversationDto, MessageDto, SendMessageInput } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { messageApi, messageKeys } from "@/feature/message/api";
import { useExercisedCapability } from "@/shared/hook/useCapabilities";

// Le fil se rafraîchit toutes les 10 s en messagerie asynchrone (CDC §5.8) — mais seulement quand
// l'écran est au premier plan : polling en continu viderait la batterie.
const POLL_INTERVAL_MS = 10_000;

/**
 * Ouvre (get-or-create) le fil de l'athlète avec son coach. Idempotent → sûr comme query. Activé
 * seulement si l'athlète a un coach : sans coach, l'API refuse (400) et il n'y a rien à ouvrir.
 */
export function useMyConversation(enabled: boolean) {
  // « Mon coach » est une lecture d'athlète par nature : le titre est dans le geste, pas dans le
  // persona du compte.
  return useQuery<ConversationDto>({
    queryKey: messageKeys.myConversation(),
    queryFn: () => messageApi.openConversation({}, "athlete"),
    enabled,
  });
}

/**
 * Les fils du coach — un par athlète avec qui il a échangé. Le tableau de bord n'en tire que des
 * compteurs de non-lus : pas de sondage, le retour au premier plan et le tirer-pour-rafraîchir
 * suffisent (un intervalle permanent viderait la batterie pour un chiffre qu'on ne regarde pas
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
 * Ouvre (get-or-create) le fil du coach avec UN athlète désigné. Idempotent → sûr comme query.
 * `staleTime` infini : c'est une résolution stable, le sondage vit sur les messages.
 */
export function useConversationWith(athleteId: string) {
  return useQuery<ConversationDto>({
    queryKey: messageKeys.conversationWith(athleteId),
    // Symétrique de `useMyConversation` : cibler un athlète, c'est agir en coach.
    queryFn: () => messageApi.openConversation({ athleteId }, "coach"),
    staleTime: Number.POSITIVE_INFINITY,
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

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const as = useExercisedCapability();
  return useMutation({
    mutationFn: (input: SendMessageInput) => messageApi.sendMessage(conversationId, input, as),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.thread(conversationId, as) });
      queryClient.invalidateQueries({ queryKey: messageKeys.myConversation() });
    },
  });
}

/**
 * Marque le fil comme lu. N'invalide QUE la conversation (unreadCount), jamais la liste de
 * messages : sinon le refetch relancerait le marquage en boucle. Le prochain poll ramène les
 * messages avec `readAt` posé — l'écran cesse alors de re-déclencher.
 */
export function useMarkRead(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  const as = useExercisedCapability();
  return useMutation({
    mutationFn: () => messageApi.markRead(conversationId as string, as),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.myConversation() });
    },
  });
}
