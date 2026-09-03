import type { MediaRecapLine, MessageDto } from "@cmv/shared";
import { mediaRecapText } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { useFeedbackReply } from "@/feature/feedback/hook/useFeedbackReply";
import { Composer } from "@/feature/message/component/Composer";
import { MessageBubble } from "@/feature/message/component/MessageBubble";
import { mediaErrorMessage } from "@/feature/message/util/media.util";
import { CmvText } from "@/shared/component";

type Reply = ReturnType<typeof useFeedbackReply>;

/**
 * Les réponses à un débrief et la barre pour en écrire une — mais **pas au même endroit**.
 *
 * Les bulles défilent avec le débrief ; la barre est collée en bas de l'écran, hors de la zone
 * défilante, exactement comme dans la messagerie. Posée à l'intérieur du `ScrollView`, elle
 * descendait sous le contenu, s'arrêtait au padding de la page et fuyait sous le clavier — trois
 * symptômes d'une seule cause : ce n'est pas du contenu, c'est un plancher d'écran.
 *
 * D'où deux composants au lieu d'un : ils ne peuvent pas être frères dans l'arbre.
 */

/** Les réponses déjà envoyées, dans le flux du débrief. */
export function FeedbackReplyMessages({
  messages,
  currentUserId,
}: Readonly<{ messages: readonly MessageDto[]; currentUserId: string }>) {
  const { t } = useTranslation();

  return (
    <View className="gap-3 border-cmv-border border-t pt-4">
      <CmvText className="text-cmv-text-mid text-xs uppercase">{t("feedback.reply.title")}</CmvText>

      {/* Aucun bloc vide quand personne n'a répondu : les bulles disparaissent, l'intitulé reste
          pour dire à quoi sert la barre en bas. Les bulles n'ont PAS leur puce « à propos de… » :
          elles pointent toutes ce débrief-ci. */}
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          mine={message.senderId === currentUserId}
          hideAttachment
        />
      ))}
    </View>
  );
}

/** Le plancher de l'écran : ce qui a échoué, puis de quoi répondre. */
export function FeedbackReplyComposer({
  reply,
  preUploadErrorKey,
  onPreUploadError,
  recap,
  onRecap,
}: Readonly<{
  reply: Reply;
  preUploadErrorKey: string | null;
  onPreUploadError: (key: string | null) => void;
  recap: readonly MediaRecapLine[];
  onRecap: (recap: readonly MediaRecapLine[]) => void;
}>) {
  const { t } = useTranslation();
  const mediaError = mediaErrorMessage(reply.audioError, preUploadErrorKey, t);

  return (
    <View>
      {/* L'échec de RÉSOLUTION du fil se dit à part : il ne vient pas de ce qu'on a écrit, et
          masquer la barre sans rien dire laisserait croire qu'on n'a pas le droit de répondre. */}
      {reply.hasThreadError ? (
        <CmvText className="px-4 pb-1 text-cmv-error text-sm">
          {t("feedback.reply.threadError")}
        </CmvText>
      ) : null}

      {mediaError == null ? null : (
        <CmvText className="px-4 pb-1 text-cmv-error text-sm">{mediaError}</CmvText>
      )}

      {/* Une ligne PAR fichier : « 2 sur 5 n'ont pas pu partir » ne dirait pas lesquels, ce qui
          laisserait la sélection entière à refaire. */}
      {recap.map((entry) => (
        <CmvText key={entry.id} className="px-4 pb-1 text-cmv-error text-sm">
          {`${entry.fileName ?? t("messages.media.unnamedFile")} — ${mediaRecapText(entry.reason, t)}`}
        </CmvText>
      ))}

      <Composer
        onSendText={reply.sendText}
        onPickMedia={() => {
          onPreUploadError(null);
          onRecap([]);
          void reply.pickAndSend(onPreUploadError).then(onRecap);
        }}
        onRecordAudio={(audio) => {
          onPreUploadError(null);
          reply.recordAndSend(audio);
        }}
        onMediaError={onPreUploadError}
        // Tant que le fil n'est pas résolu, écrire n'aboutirait nulle part : la barre reste visible
        // mais fermée, plutôt que d'accepter un texte qu'elle perdrait.
        sending={reply.sending || !reply.ready}
        mediaBusy={reply.mediaBusy || !reply.ready}
        step={reply.step}
      />
    </View>
  );
}
