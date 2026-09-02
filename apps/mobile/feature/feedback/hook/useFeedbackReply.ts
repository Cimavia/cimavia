import { useQueryClient } from "@tanstack/react-query";
import { coachFeedbackKeys } from "@/feature/feedback/api";
import { useConversationWith, useSendMessage } from "@/feature/message/hook/useConversation";
import { useSendMessageMedia } from "@/feature/message/hook/useMessageMedia";

/**
 * Répondre à un débrief depuis le mobile : de quoi écrire, et de quoi rafraîchir les deux endroits
 * où la réponse se lit.
 *
 * La réponse est un **message rattaché** (`Message.sessionFeedbackId`), pas une entité à part —
 * elle hérite ainsi des médias, des non-lus, du push et du throttle sans un octet de plus
 * (tranché en #190). Ce hook ne fait donc que composer ceux de la messagerie.
 *
 * Ce qu'il apporte, et que la messagerie ne peut pas savoir : **une seule information, deux
 * surfaces**. Le message envoyé d'ici apparaît dans le fil ET sous le débrief — c'est le même
 * enregistrement, lu par deux chemins. Sans l'invalidation du débrief, il n'apparaîtrait que là
 * où on ne l'a pas écrit.
 *
 * Jumeau de celui du web (#193) ; les deux ne partagent que les hooks de messagerie, parce que ce
 * qu'ils composent — pastilles de progression, sélection de galerie, enregistreur — n'a pas la
 * même forme d'un côté et de l'autre.
 */
export function useFeedbackReply(feedback: { id: string; athleteId: string }) {
  const queryClient = useQueryClient();
  // Get-or-create, idempotent et stable (`staleTime` infini) : ouvrir un débrief n'ouvre pas un
  // fil de plus, il résout celui qui existe.
  const conversation = useConversationWith(feedback.athleteId);
  const conversationId = conversation.data?.id ?? "";

  const attachment = { sessionFeedbackId: feedback.id };
  // La liste ENTIÈRE et pas seulement ce débrief : `repliedAt` y vit aussi, et c'est lui qui dira
  // « répondu » sur la ligne qu'on vient de traiter.
  const refreshFeedback = () => queryClient.invalidateQueries({ queryKey: coachFeedbackKeys.all });

  const send = useSendMessage(conversationId, attachment);
  const media = useSendMessageMedia(conversationId, { attachment, onSent: refreshFeedback });

  return {
    /** `false` tant que le fil n'est pas résolu : on n'écrit pas dans une conversation inconnue. */
    ready: conversation.data != null,
    /** La résolution du fil a échoué — distinct d'un échec d'envoi, et il faut le dire aussi. */
    hasThreadError: conversation.isError,
    sendText: (content: string) =>
      send.mutate({ type: "TEXT", content }, { onSuccess: refreshFeedback }),
    sending: send.isPending,
    pickAndSend: media.pickAndSend,
    recordAndSend: media.recordAndSend,
    mediaBusy: media.isUploading,
    step: media.step,
    audioError: media.audioError,
  };
}
