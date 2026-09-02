import type { MediaRecapLine, MessageDto } from "@cmv/shared";
import { mediaRecapText } from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useFeedbackReply } from "@/feature/feedback/hook/useFeedbackReply";
import { Composer } from "@/feature/message/component/Composer";
import { MessageBubble } from "@/feature/message/component/MessageBubble";
import { mediaErrorMessage } from "@/feature/message/util/media.util";
import { CmvText } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

type FeedbackReplySectionProps = {
  feedback: { id: string; athleteId: string };
  messages: readonly MessageDto[];
};

/**
 * Les réponses à un débrief, et de quoi en écrire une — le bouton « Répondre » que la maquette
 * `coach_mobile.dc.html` dessinait sans qu'il existe (#33 l'avait laissé de côté, faute de
 * fonctionnalité derrière).
 *
 * `Composer` et `MessageBubble` viennent de `feature/message` sans être recopiés : répondre à un
 * débrief EST envoyer un message. La note vocale arrive gratuitement avec eux — et c'est le geste
 * naturel sur un téléphone, demandé en bêta.
 *
 * Les bulles s'affichent SANS leur puce « à propos de… » : elles pointent toutes ce débrief-ci.
 */
export function FeedbackReplySection({ feedback, messages }: Readonly<FeedbackReplySectionProps>) {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();
  const reply = useFeedbackReply(feedback);

  // Refus qui PRÉCÈDE l'upload (permission galerie, permission/erreur micro) : porté à la main, il
  // ne passe par aucune mutation. Réinitialisé à chaque nouvelle tentative.
  const [preUploadErrorKey, setPreUploadErrorKey] = useState<string | null>(null);
  // Ce qui n'a pas pu partir au dernier lot, fichier par fichier.
  const [recap, setRecap] = useState<readonly MediaRecapLine[]>([]);

  const currentUserId = session?.user.id ?? "";
  const mediaError = mediaErrorMessage(reply.audioError, preUploadErrorKey, t);

  return (
    <View className="gap-3 border-cmv-border border-t pt-4">
      <CmvText className="text-cmv-text-mid text-xs uppercase">{t("feedback.reply.title")}</CmvText>

      {/* Aucun bloc vide quand personne n'a répondu : les bulles disparaissent, la barre d'envoi
          reste. Une section « Réponses (0) » laisserait croire qu'on attend quelque chose. */}
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          mine={message.senderId === currentUserId}
          hideAttachment
        />
      ))}

      {/* L'échec de RÉSOLUTION du fil se dit à part : il ne vient pas de ce qu'on a écrit, et
          masquer la barre sans rien dire laisserait croire qu'on n'a pas le droit de répondre. */}
      {reply.hasThreadError ? (
        <CmvText className="text-cmv-error text-sm">{t("feedback.reply.threadError")}</CmvText>
      ) : null}

      {mediaError == null ? null : (
        <CmvText className="text-cmv-error text-sm">{mediaError}</CmvText>
      )}

      {/* Une ligne PAR fichier : « 2 sur 5 n'ont pas pu partir » ne dirait pas lesquels, ce qui
          laisserait la sélection entière à refaire. */}
      {recap.map((entry) => (
        <CmvText key={entry.id} className="text-cmv-error text-sm">
          {`${entry.fileName ?? t("messages.media.unnamedFile")} — ${mediaRecapText(entry.reason, t)}`}
        </CmvText>
      ))}

      <Composer
        onSendText={reply.sendText}
        onPickMedia={() => {
          setPreUploadErrorKey(null);
          setRecap([]);
          void reply.pickAndSend(setPreUploadErrorKey).then(setRecap);
        }}
        onRecordAudio={(audio) => {
          setPreUploadErrorKey(null);
          reply.recordAndSend(audio);
        }}
        onMediaError={setPreUploadErrorKey}
        // Tant que le fil n'est pas résolu, écrire n'aboutirait nulle part : la barre reste visible
        // mais fermée, plutôt que d'accepter un texte qu'elle perdrait.
        sending={reply.sending || !reply.ready}
        mediaBusy={reply.mediaBusy || !reply.ready}
        step={reply.step}
      />
    </View>
  );
}
