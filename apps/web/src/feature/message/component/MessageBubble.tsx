import type { MessageAttachmentDto } from "@cmv/shared";
import {
  AttachmentDestination,
  attachmentTarget,
  MESSAGE_ATTACHMENT_LABEL_KEY,
  type MessageDto,
  MessageType,
} from "@cmv/shared";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ImageMessage } from "@/feature/message/component/ImageMessage";
import { useActingCapability } from "@/shared/hook/useCapabilities";
import { cn } from "@/shared/util/cn.util";
import { formatDate } from "@/shared/util/date.util";

type MessageBubbleProps = {
  message: MessageDto;
  mine: boolean;
};

// Rendu d'un média reçu (URL GET signée). Le web lit tout nativement — pas de lib : <audio> pour
// une note vocale, <img> pour une photo, <video> pour une vidéo.
function MediaContent({ message }: Readonly<{ message: MessageDto }>) {
  const media = message.media;
  if (media == null) return null;

  if (message.type === MessageType.AUDIO) {
    // biome-ignore lint/a11y/useMediaCaption: note vocale d'un athlète — pas de piste de sous-titres.
    return <audio controls src={media.url} className="max-w-full" />;
  }
  if (message.type === MessageType.IMAGE) {
    return <ImageMessage url={media.url} alt={media.fileName} />;
  }
  // biome-ignore lint/a11y/useMediaCaption: vidéo d'entraînement d'un athlète — pas de sous-titres.
  return <video controls src={media.url} className="max-h-80 rounded-cmv-md" />;
}

/**
 * `self-start` n'est pas cosmétique : la bulle est un `flex-col`, dont les enfants s'étirent par
 * défaut — sans lui, la puce fait toute la largeur du message et cesse d'être une pastille.
 */
const CHIP =
  "mb-cmv-sm inline-flex max-w-full items-center self-start rounded-cmv-sm border border-cmv-border bg-cmv-bg-1 px-cmv-sm py-cmv-xs text-cmv-caption text-cmv-text-mid";

/**
 * « À propos de… » : ce sur quoi porte le message, en tête de bulle.
 *
 * Le libellé se compose ICI et non côté serveur — l'API rend le titre et la date, le type choisit
 * la clé i18n (`MESSAGE_ATTACHMENT_LABEL_KEY`).
 *
 * La destination dépend de la capacité du LECTEUR, pas de celle de l'auteur : le coach et son
 * athlète n'ont pas les mêmes écrans. Quand il n'y a nulle part où aller, la puce reste un libellé
 * — jamais un lien mort.
 */
function AttachmentChip({ attachment }: Readonly<{ attachment: MessageAttachmentDto }>) {
  const { t } = useTranslation();
  // `useActingCapability` et non `useExercisedCapability` : ce dernier rend `null` pour tout compte
  // MONO-capacité — il répond à « faut-il poser `?as=` sur l'API », pas à « quel écran montrer ».
  const as = useActingCapability();
  const target = attachmentTarget(attachment, as);
  const label = t(MESSAGE_ATTACHMENT_LABEL_KEY[attachment.type], {
    title: attachment.sessionTitle,
    date: formatDate(attachment.scheduledDate),
  });

  if (target.destination === AttachmentDestination.SESSION) {
    return (
      <Link
        to="/sessions/$sessionId"
        params={{ sessionId: target.scheduledSessionId }}
        className={cn(CHIP, "hover:text-cmv-text-hi")}
      >
        {label}
      </Link>
    );
  }

  // Le débrief, adressé PAR SA SÉANCE des deux côtés : le coach l'ouvre dans sa boîte de réception,
  // l'athlète sur son propre écran d'écriture.
  if (as === "coach") {
    return (
      <Link
        to="/feedbacks"
        search={{ feedback: undefined, session: target.scheduledSessionId }}
        className={cn(CHIP, "hover:text-cmv-text-hi")}
      >
        {label}
      </Link>
    );
  }

  return (
    <Link
      to="/sessions/$sessionId/feedback"
      params={{ sessionId: target.scheduledSessionId }}
      className={cn(CHIP, "hover:text-cmv-text-hi")}
    >
      {label}
    </Link>
  );
}

export function MessageBubble({ message, mine }: Readonly<MessageBubbleProps>) {
  return (
    <div
      className={cn(
        "flex max-w-[70%] flex-col rounded-cmv-lg px-cmv-md py-cmv-sm",
        mine
          ? "self-end bg-cmv-accent text-cmv-text-hi"
          : "self-start bg-cmv-surface text-cmv-text-hi",
      )}
    >
      {/* `null` couvre DEUX cas : le message ne porte sur rien, ou sa cible a disparu (SetNull).
          Les deux se rendent pareil — une bulle ordinaire, pas un « à propos de quelque chose ». */}
      {message.attachment == null ? null : <AttachmentChip attachment={message.attachment} />}

      {message.content != null ? (
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      ) : (
        <MediaContent message={message} />
      )}
    </div>
  );
}
