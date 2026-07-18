import { type MessageDto, MessageType } from "@cmv/shared";
import { ImageMessage } from "@/feature/message/component/ImageMessage";
import { cn } from "@/shared/util/cn.util";

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

export function MessageBubble({ message, mine }: Readonly<MessageBubbleProps>) {
  return (
    <div
      className={cn(
        "max-w-[70%] rounded-cmv-lg px-cmv-md py-cmv-sm",
        mine
          ? "self-end bg-cmv-accent text-cmv-text-hi"
          : "self-start bg-cmv-surface text-cmv-text-hi",
      )}
    >
      {message.content != null ? (
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      ) : (
        <MediaContent message={message} />
      )}
    </div>
  );
}
