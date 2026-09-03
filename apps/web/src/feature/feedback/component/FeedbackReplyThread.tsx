import type { MessageDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { useFeedbackReply } from "@/feature/feedback/hook/useFeedbackReply";
import { Composer } from "@/feature/message/component/Composer";
import { MessageBubble } from "@/feature/message/component/MessageBubble";
import { authClient } from "@/shared/lib/auth";

type FeedbackReplyThreadProps = {
  feedbackId: string;
  messages: readonly MessageDto[];
  /** Le fil, résolu par la surface : le coach vise un athlète, l'athlète a son coach. */
  conversationId: string | undefined;
  isThreadError: boolean;
  /** Ce qu'il faut recharger après un envoi — la boîte du coach, ou le débrief de l'athlète. */
  onSent: () => void;
};

/**
 * Les réponses à un débrief, et de quoi en écrire une.
 *
 * `Composer` et `MessageBubble` viennent de `feature/message` sans être recopiés : répondre à un
 * débrief EST envoyer un message, et s'en écrire une seconde version ferait diverger la barre
 * d'envoi (pièce jointe, note vocale, progression de lot) de celle du fil.
 *
 * Les bulles s'affichent SANS leur puce « à propos de… » : elles pointent toutes ce débrief-ci,
 * la répéter à chaque ligne donnerait l'adresse de la page où l'on est déjà.
 *
 * Le fil n'est pas sondé ici, contrairement à la messagerie : le débrief se recharge à l'envoi et
 * au retour sur l'onglet. Un coach qui répond n'attend pas une réponse dans la seconde — et s'il
 * l'attend, c'est la messagerie qu'il ouvre.
 */
export function FeedbackReplyThread({
  feedbackId,
  messages,
  conversationId,
  isThreadError,
  onSent,
}: Readonly<FeedbackReplyThreadProps>) {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();
  const reply = useFeedbackReply({ feedbackId, conversationId, isThreadError, onSent });

  const currentUserId = session?.user.id ?? "";

  return (
    <section className="flex flex-col gap-cmv-sm border-cmv-border border-t pt-cmv-lg">
      <h4 className="text-cmv-caption text-cmv-accent uppercase tracking-wide">
        {t("feedback.reply.title")}
      </h4>

      {/* Aucun bloc vide quand personne n'a répondu : la liste des bulles disparaît, le composer
          reste. Une section « Réponses (0) » laisserait croire qu'on attend quelque chose. */}
      {messages.length > 0 ? (
        <div className="flex flex-col gap-cmv-sm">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              mine={message.senderId === currentUserId}
              hideAttachment
            />
          ))}
        </div>
      ) : null}

      {/* L'échec de RÉSOLUTION du fil se dit à part : il ne vient pas de ce qu'on a écrit, et
          masquer le composer sans rien dire laisserait croire qu'on n'a pas le droit de répondre. */}
      {reply.hasThreadError ? (
        <p className="text-cmv-body text-cmv-error-on">{t("feedback.reply.threadError")}</p>
      ) : null}

      <div className="rounded-cmv-md border border-cmv-border bg-cmv-bg-1">
        <Composer
          onSendText={reply.sendText}
          onSendFiles={reply.sendFiles}
          onRecordedAudio={reply.sendAudio}
          // Tant que le fil n'est pas résolu, écrire n'aboutirait nulle part : la barre reste
          // visible mais fermée, plutôt que d'accepter un texte qu'elle perdrait.
          sending={reply.sending || !reply.ready}
          mediaBusy={reply.mediaBusy || !reply.ready}
          progress={reply.progress}
          step={reply.step}
        />
      </div>
    </section>
  );
}
