import type { ConversationDto, MessageDto, SendMessageInput } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMessages,
  listConversations,
  markConversationRead,
  messageKeys,
  openConversation,
  sendMessage,
} from "@/feature/message/api";
import { useMutationToast } from "@/shared/hook/useMutationToast";

// Messagerie asynchrone (CDC §5.8) : les nouveaux messages remontent par polling. Sur le web,
// `refetchOnWindowFocus` (défaut TanStack) complète l'intervalle.
const CONVERSATIONS_POLL_MS = 15_000;
const THREAD_POLL_MS = 10_000;

export function useConversations() {
  return useQuery<ConversationDto[]>({
    queryKey: messageKeys.conversations(),
    queryFn: listConversations,
    refetchInterval: CONVERSATIONS_POLL_MS,
  });
}

// Ouvre (get-or-create) le fil avec un athlète. `staleTime` infini : c'est une résolution stable
// (le POST ne doit pas se rejouer à chaque focus/intervalle) — le polling vit sur les messages.
export function useConversationWith(athleteId: string | null) {
  return useQuery<ConversationDto>({
    queryKey: messageKeys.conversationWith(athleteId ?? ""),
    queryFn: () => openConversation({ athleteId: athleteId as string }),
    enabled: athleteId != null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useThreadMessages(conversationId: string | undefined) {
  return useQuery<MessageDto[]>({
    queryKey: messageKeys.thread(conversationId ?? ""),
    queryFn: () => getMessages(conversationId as string),
    enabled: conversationId != null,
    refetchInterval: conversationId != null ? THREAD_POLL_MS : false,
  });
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const toast = useMutationToast();
  return useMutation({
    mutationFn: (input: SendMessageInput) => sendMessage(conversationId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.thread(conversationId) });
      queryClient.invalidateQueries({ queryKey: messageKeys.conversations() });
    },
    onError: toast.onError,
  });
}

/**
 * Marque le fil comme lu. N'invalide QUE la liste de fils (unreadCount), jamais les messages :
 * sinon le refetch relancerait le marquage en boucle.
 */
export function useMarkRead(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markConversationRead(conversationId as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.conversations() });
    },
  });
}
