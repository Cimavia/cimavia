import type { ConversationDto, MessageDto, SendMessageInput } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  conversationKeys,
  getMessages,
  markConversationRead,
  messageKeys,
  openMyConversation,
  sendMessage,
} from "@/feature/message/api";

// Le fil se rafraîchit toutes les 10 s en messagerie asynchrone (CDC §5.8) — mais seulement quand
// l'écran est au premier plan : polling en continu viderait la batterie.
const POLL_INTERVAL_MS = 10_000;

/**
 * Ouvre (get-or-create) le fil de l'athlète avec son coach. Idempotent → sûr comme query. Activé
 * seulement si l'athlète a un coach : sans coach, l'API refuse (400) et il n'y a rien à ouvrir.
 */
export function useMyConversation(enabled: boolean) {
  return useQuery<ConversationDto>({
    queryKey: conversationKeys.mine(),
    queryFn: openMyConversation,
    enabled,
  });
}

export function useMessages(conversationId: string | undefined) {
  // Polling gated par le focus de l'écran (useFocusEffect) : pas de refetch quand l'onglet est
  // en arrière-plan. Le focusManager global (retour au premier plan) reste en plus actif.
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  return useQuery<MessageDto[]>({
    queryKey: conversationId != null ? messageKeys.list(conversationId) : messageKeys.all,
    queryFn: () => getMessages(conversationId as string),
    enabled: conversationId != null,
    refetchInterval: focused && conversationId != null ? POLL_INTERVAL_MS : false,
  });
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SendMessageInput) => sendMessage(conversationId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.list(conversationId) });
      queryClient.invalidateQueries({ queryKey: conversationKeys.mine() });
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
  return useMutation({
    mutationFn: () => markConversationRead(conversationId as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.mine() });
    },
  });
}
