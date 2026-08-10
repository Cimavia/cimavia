import type { ConversationDto, MessageDto, SendMessageInput } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { messageApi, messageKeys } from "@/feature/message/api";
import { useMutationToast } from "@/shared/hook/useMutationToast";

// Messagerie asynchrone (CDC §5.8) : les nouveaux messages remontent par polling. Sur le web,
// `refetchOnWindowFocus` (défaut TanStack) complète l'intervalle.
const CONVERSATIONS_POLL_MS = 15_000;
const THREAD_POLL_MS = 10_000;

/**
 * `poll: false` pour les écrans qui n'en tirent qu'un COMPTEUR (le tableau de bord). Le sondage à
 * 15 s existe pour la messagerie ouverte, où l'on attend une réponse ; sur la page d'accueil il
 * ferait tourner quatre requêtes par minute en permanence pour un nombre que personne ne regarde
 * changer. `refetchOnWindowFocus` (défaut TanStack) reste actif dans les deux cas.
 */
export function useConversations({ poll = true }: { poll?: boolean } = {}) {
  return useQuery<ConversationDto[]>({
    queryKey: messageKeys.conversations(),
    queryFn: messageApi.listConversations,
    refetchInterval: poll ? CONVERSATIONS_POLL_MS : false,
  });
}

// Ouvre (get-or-create) le fil avec un athlète. `staleTime` infini : c'est une résolution stable
// (le POST ne doit pas se rejouer à chaque focus/intervalle) — le polling vit sur les messages.
export function useConversationWith(athleteId: string | null) {
  return useQuery<ConversationDto>({
    queryKey: messageKeys.conversationWith(athleteId ?? ""),
    queryFn: () => messageApi.openConversation({ athleteId: athleteId as string }),
    enabled: athleteId != null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useThreadMessages(conversationId: string | undefined) {
  return useQuery<MessageDto[]>({
    queryKey: messageKeys.thread(conversationId ?? ""),
    queryFn: () => messageApi.getMessages(conversationId as string),
    enabled: conversationId != null,
    refetchInterval: conversationId != null ? THREAD_POLL_MS : false,
  });
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const toast = useMutationToast();
  return useMutation({
    mutationFn: (input: SendMessageInput) => messageApi.sendMessage(conversationId, input),
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
    mutationFn: () => messageApi.markRead(conversationId as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.conversations() });
    },
  });
}
