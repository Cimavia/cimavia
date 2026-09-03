import {
  AttachmentDestination,
  type AttachmentTarget,
  attachmentTarget,
  type CapabilityName,
  MESSAGE_ATTACHMENT_LABEL_KEY,
  type MessageAttachmentDto,
  type MessageDto,
  MessageType,
} from "@cmv/shared";
import { type Href, router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { CmvAudioPlayer, CmvImageViewer, CmvText, CmvVideoLink } from "@/shared/component";
import { useActingCapability } from "@/shared/hook/useExercisedCapability";
import { formatDate } from "@/shared/util/date.util";

type MessageBubbleProps = {
  message: MessageDto;
  mine: boolean;
  /**
   * Masque la puce « à propos de… » — pour les surfaces qui SONT la cible citée.
   *
   * Dans un débrief, tous les messages rattachés pointent ce même débrief : la puce y répéterait
   * à chaque bulle l'adresse de l'écran où l'on se trouve déjà.
   */
  hideAttachment?: boolean;
};

// Rendu du contenu média. L'URL est signée (bucket privé), régénérée à chaque lecture.
function MediaContent({ message }: Readonly<{ message: MessageDto }>) {
  const media = message.media;
  if (media == null) return null;

  if (message.type === MessageType.AUDIO) {
    return <CmvAudioPlayer url={media.url} durationSeconds={media.durationSeconds} />;
  }
  if (message.type === MessageType.IMAGE) {
    return <CmvImageViewer url={media.url} />;
  }
  // Vidéo : ouverte dans le lecteur système. Pas de `resolveUrl` — le fil sonde toutes les 10 s,
  // ses URLs signées n'ont pas le temps d'expirer sous la main de l'utilisateur.
  return <CmvVideoLink url={media.url} durationSeconds={media.durationSeconds} />;
}

/**
 * « À propos de… » : ce sur quoi porte le message, en tête de bulle.
 *
 * Le libellé se compose ICI — l'API rend le titre et la date, le type choisit la clé i18n
 * (`MESSAGE_ATTACHMENT_LABEL_KEY`). La destination dépend de la capacité du LECTEUR : le coach et
 * son athlète n'ont pas les mêmes écrans. Sans destination, la puce reste un libellé — jamais un
 * lien mort.
 */
function AttachmentChip({ attachment }: Readonly<{ attachment: MessageAttachmentDto }>) {
  const { t } = useTranslation();
  // `useActingCapability` et non `useExercisedCapability` : ce dernier rend `null` pour tout compte
  // MONO-capacité — il répond à « faut-il poser `?as=` sur l'API », pas à « quel écran montrer ».
  const as = useActingCapability();
  const target = attachmentTarget(attachment, as);
  const label = (
    <CmvText className="text-cmv-text-mid text-xs">
      {t(MESSAGE_ATTACHMENT_LABEL_KEY[attachment.type], {
        title: attachment.sessionTitle,
        date: formatDate(attachment.scheduledDate),
      })}
    </CmvText>
  );

  return (
    <Pressable onPress={() => router.push(routeOf(target, as))} hitSlop={4}>
      <View className="mb-2 self-start rounded-lg bg-cmv-bg-1 px-2 py-1">{label}</View>
    </Pressable>
  );
}

/**
 * La route d'un écran mobile pour une destination donnée.
 *
 * Le débrief s'adresse PAR SA SÉANCE des deux côtés — le coach l'ouvre dans sa boîte de réception
 * (`/feedbacks/[sessionId]`), l'athlète sur son propre écran d'écriture. Une fonction nommée
 * plutôt qu'un ternaire imbriqué : ce qui se lit ici est une règle de navigation, pas un
 * branchement.
 */
function routeOf(target: AttachmentTarget, as: CapabilityName): Href {
  if (target.destination === AttachmentDestination.SESSION) {
    return `/session/${target.scheduledSessionId}`;
  }
  return as === "coach"
    ? `/feedbacks/${target.scheduledSessionId}`
    : `/session/${target.scheduledSessionId}/feedback`;
}

export function MessageBubble({
  message,
  mine,
  hideAttachment = false,
}: Readonly<MessageBubbleProps>) {
  return (
    <View
      className={`max-w-[80%] rounded-2xl px-3 py-2 ${
        mine ? "self-end bg-cmv-accent" : "self-start bg-cmv-surface"
      }`}
    >
      {/* `null` couvre DEUX cas : le message ne porte sur rien, ou sa cible a disparu (SetNull).
          Les deux se rendent pareil — une bulle ordinaire, pas un « à propos de quelque chose ». */}
      {message.attachment == null || hideAttachment ? null : (
        <AttachmentChip attachment={message.attachment} />
      )}

      {message.content != null ? (
        <CmvText className="text-cmv-text-hi">{message.content}</CmvText>
      ) : (
        <MediaContent message={message} />
      )}
    </View>
  );
}
