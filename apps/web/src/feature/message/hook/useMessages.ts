import type { ConversationDto, MessageDto, SendMessageInput } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { messageApi, messageKeys } from "@/feature/message/api";
import { useExercisedCapability } from "@/shared/hook/useCapabilities";
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
  const as = useExercisedCapability();
  return useQuery<ConversationDto[]>({
    queryKey: messageKeys.conversations(as),
    queryFn: () => messageApi.listConversations(as),
    refetchInterval: poll ? CONVERSATIONS_POLL_MS : false,
  });
}

// Ouvre (get-or-create) le fil avec un athlète. `staleTime` infini : c'est une résolution stable
// (le POST ne doit pas se rejouer à chaque focus/intervalle) — le polling vit sur les messages.
export function useConversationWith(athleteId: string | null) {
  // Cibler un athlète, c'est agir en coach : le titre ne dépend pas du persona ici, il est dans
  // le geste lui-même. Un compte à double capacité qui ouvre le fil d'un de SES athlètes le fait
  // à ce titre, quel que soit l'univers où il a atterri.
  return useQuery<ConversationDto>({
    queryKey: messageKeys.conversationWith(athleteId ?? ""),
    queryFn: () => messageApi.openConversation({ athleteId: athleteId as string }, "coach"),
    enabled: athleteId != null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * Ouvre (get-or-create) le fil de l'athlète courant avec SON coach : aucun id à donner, l'API le
 * résout. `enabled` parce qu'un athlète sans coach n'a pas de fil à ouvrir — l'API refuserait.
 */
export function useMyConversation(enabled: boolean) {
  // Symétrique de `useConversationWith` : « mon coach » est une lecture d'athlète par nature.
  return useQuery<ConversationDto>({
    queryKey: messageKeys.myConversation(),
    queryFn: () => messageApi.openConversation({}, "athlete"),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useThreadMessages(conversationId: string | undefined) {
  const as = useExercisedCapability();
  return useQuery<MessageDto[]>({
    queryKey: messageKeys.thread(conversationId ?? "", as),
    queryFn: () => messageApi.getMessages(conversationId as string, as),
    enabled: conversationId != null,
    refetchInterval: conversationId != null ? THREAD_POLL_MS : false,
  });
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
  const toast = useMutationToast();
  const as = useExercisedCapability();
  return useMutation({
    mutationFn: (input: SendMessageInput) =>
      messageApi.sendMessage(conversationId, { ...input, ...attachment }, as),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.thread(conversationId, as) });
      queryClient.invalidateQueries({ queryKey: messageKeys.conversations(as) });
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
  const as = useExercisedCapability();
  return useMutation({
    mutationFn: () => messageApi.markRead(conversationId as string, as),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.conversations(as) });
    },
  });
}
