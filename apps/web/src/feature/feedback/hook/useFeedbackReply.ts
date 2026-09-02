import { useSendMessage } from "@/feature/message/hook/useMessages";
import { useSendMessageMedia } from "@/feature/message/hook/useSendMessageMedia";

type FeedbackReplyInput = {
  /** `null` tant que le débrief n'est pas chargé : on ne rattache pas à un id qu'on n'a pas. */
  feedbackId: string | null;
  /** Le fil DÉJÀ résolu par l'appelant, et ce qu'il faut rafraîchir en plus de lui. */
  conversationId: string | undefined;
  isThreadError: boolean;
  onSent: () => void;
};

/**
 * Répondre à un débrief : de quoi écrire, et de quoi rafraîchir les deux endroits où la réponse
 * se lit.
 *
 * La réponse est un **message rattaché** (`Message.sessionFeedbackId`), pas une entité à part —
 * elle hérite ainsi des médias, des non-lus, du push et du throttle sans un octet de plus
 * (tranché en #190). Ce hook ne fait donc que composer ceux de la messagerie ; il n'ouvre aucun
 * chemin d'écriture nouveau.
 *
 * Le fil arrive RÉSOLU, et le rafraîchissement du débrief arrive en `onSent` : c'est ce qui permet
 * au même hook de servir les deux bouts de la relation, qui ne résolvent ni le même fil (le coach
 * vise un athlète, l'athlète a son coach) ni le même cache (la boîte de réception du coach, le
 * débrief de l'athlète). Les faire deviner ici obligerait à y connaître les deux capacités.
 *
 * Ce qu'il apporte, et que la messagerie ne peut pas savoir : **une seule information, deux
 * surfaces**. Le message envoyé d'ici apparaît dans le fil ET sous le débrief — c'est le même
 * enregistrement, lu par deux chemins. Sans `onSent`, il n'apparaîtrait que là où on ne l'a pas
 * écrit.
 */
export function useFeedbackReply({
  feedbackId,
  conversationId,
  isThreadError,
  onSent,
}: FeedbackReplyInput) {
  const attachment = feedbackId == null ? undefined : { sessionFeedbackId: feedbackId };
  const send = useSendMessage(conversationId ?? "", attachment);
  const media = useSendMessageMedia(conversationId ?? "", { attachment, onSent });

  return {
    /** `false` tant que le fil n'est pas résolu : on n'écrit pas dans une conversation inconnue. */
    ready: feedbackId != null && conversationId != null,
    /** La résolution du fil a échoué — distinct d'un échec d'envoi, et il faut le dire aussi. */
    hasThreadError: isThreadError,
    sendText: (content: string) => send.mutate({ type: "TEXT", content }, { onSuccess: onSent }),
    sending: send.isPending,
    sendFiles: media.sendFiles,
    sendAudio: media.sendAudio,
    mediaBusy: media.isUploading,
    progress: media.progress,
    step: media.step,
  };
}
