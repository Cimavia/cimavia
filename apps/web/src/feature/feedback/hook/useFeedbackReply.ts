import type { FeedbackReplyInput } from "@cmv/shared";
import { feedbackReplyAttachment, feedbackReplySurface } from "@cmv/shared";
import { useSendMessage } from "@/feature/message/hook/useMessages";
import { useSendMessageMedia } from "@/feature/message/hook/useSendMessageMedia";

/**
 * De quoi répondre à un débrief depuis le web.
 *
 * Le contrat et son pourquoi vivent dans `@cmv/shared` (`feedback-reply.util`) : les deux apps le
 * tenaient à l'identique. Ce hook n'ajoute que le transport — les mutations de la messagerie, avec
 * le rattachement, et l'invalidation du débrief en plus de celle du fil.
 *
 * **Une seule information, deux surfaces** : le message envoyé apparaît dans le fil ET sous le
 * débrief, parce que c'est le même enregistrement lu par deux chemins.
 */
export function useFeedbackReply(input: FeedbackReplyInput) {
  const attachment = feedbackReplyAttachment(input.feedbackId);
  const thread = input.conversationId ?? "";
  const send = useSendMessage(thread, attachment);
  const media = useSendMessageMedia(thread, { attachment, onSent: input.onSent });

  return {
    ...feedbackReplySurface(input, send.isPending, (content) =>
      send.mutate({ type: "TEXT", content }, { onSuccess: input.onSent }),
    ),
    sendFiles: media.sendFiles,
    sendAudio: media.sendAudio,
    mediaBusy: media.isUploading,
    progress: media.progress,
    step: media.step,
  };
}
