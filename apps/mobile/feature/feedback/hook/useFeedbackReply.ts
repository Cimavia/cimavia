import type { FeedbackReplyInput, TrainingCapability } from "@cmv/shared";
import { feedbackReplyAttachment, feedbackReplySurface } from "@cmv/shared";
import { useSendMessage } from "@/feature/message/hook/useConversation";
import { useSendMessageMedia } from "@/feature/message/hook/useMessageMedia";

/**
 * De quoi répondre à un débrief depuis le mobile.
 *
 * Le contrat et son pourquoi vivent dans `@cmv/shared` (`feedback-reply.util`). Ce qui diffère du
 * web, et qui justifie un hook par app plutôt qu'un seul : la barre d'envoi n'expose pas les mêmes
 * gestes. Ici la galerie s'ouvre et l'enregistreur natif rend une note vocale ; là-bas ce sont des
 * fichiers et `MediaRecorder`.
 *
 * `capability` : le titre de l'écran, coach ou athlète — requis, et pas le sélecteur (#343). Celui-ci
 * vit sur Factures et Messages ; laissé sur l'autre titre, il faisait refuser la réponse par l'API,
 * qui cherche le fil sous le titre reçu. Le web n'en a pas besoin : son titre vient du chemin.
 */
export function useFeedbackReply(input: FeedbackReplyInput, capability: TrainingCapability) {
  const attachment = feedbackReplyAttachment(input.feedbackId);
  const thread = input.conversationId ?? "";
  const send = useSendMessage(thread, attachment, capability);
  const media = useSendMessageMedia(thread, {
    attachment,
    onSent: input.onSent,
    pinned: capability,
  });

  return {
    ...feedbackReplySurface(input, send.isPending, (content) =>
      send.mutateAsync({ type: "TEXT", content }, { onSuccess: input.onSent }),
    ),
    pickAndSend: media.pickAndSend,
    recordAndSend: media.recordAndSend,
    mediaBusy: media.isUploading,
    step: media.step,
    audioError: media.audioError,
  };
}
