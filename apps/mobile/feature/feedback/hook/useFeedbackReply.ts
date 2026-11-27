import type { FeedbackReplyInput, TrainingCapability } from "@cmv/shared";
import { feedbackReplyAttachment, feedbackReplySurface, isFollowEndedError } from "@cmv/shared";
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
 *
 * `onFollowEnded` : une réponse refusée parce que le suivi a pris fin (#911) — l'écran a lu ce qui
 * dit la fin du suivi avant la rupture, et c'est à lui de le relire (la séance côté athlète, les
 * liens côté coach) pour que la barre laisse place à la phrase de fin. Relire la seule liste des
 * fils, comme le fait l'envoi, ne fermerait rien : ces écrans ne la lisent pas.
 */
export function useFeedbackReply(
  input: FeedbackReplyInput,
  capability: TrainingCapability,
  onFollowEnded: () => void,
) {
  const attachment = feedbackReplyAttachment(input.feedbackId);
  const thread = input.conversationId ?? "";
  const send = useSendMessage(thread, { attachment, pinned: capability });
  const media = useSendMessageMedia(thread, {
    attachment,
    pinned: capability,
    onSent: input.onSent,
  });

  return {
    ...feedbackReplySurface(input, send.isPending, (content) =>
      send.mutateAsync(
        { type: "TEXT", content },
        {
          onSuccess: input.onSent,
          onError: (error) => {
            if (isFollowEndedError(error)) onFollowEnded();
          },
        },
      ),
    ),
    pickAndSend: media.pickAndSend,
    recordAndSend: media.recordAndSend,
    mediaBusy: media.isUploading,
    step: media.step,
    audioError: media.audioError,
    clearAudioError: media.clearAudioError,
  };
}
