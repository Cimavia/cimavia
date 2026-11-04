import {
  isAllowedMessageFileMime,
  MAX_MESSAGE_FILE_SIZE_BYTES,
  type MessageFileMimeType,
} from "../dto/message.schema";
import { megabytesOf } from "./media-format.util";

export type MessageFileCheck =
  | { accepted: true; mimeType: MessageFileMimeType; size: number }
  | { accepted: false; reasonKey: string; params: Record<string, number> };

/**
 * Ce qui laisse partir un fichier joint de message (#771), ou la raison de son refus — avant tout
 * envoi, et dite pareil sur le web et le mobile.
 *
 * `size` `null` ou `0` : le fournisseur de documents ne l'a pas donnée, ou ne laisse pas lire le
 * fichier. L'envoyer signerait un objet vide, que l'API refuserait à l'arrivée sans dire pourquoi.
 */
export function checkMessageFile(mimeType: string, size: number | null): MessageFileCheck {
  if (!isAllowedMessageFileMime(mimeType)) {
    return { accepted: false, reasonKey: "messages.media.unsupported", params: {} };
  }
  if (size == null || size === 0) {
    return { accepted: false, reasonKey: "messages.media.unreadable", params: {} };
  }
  if (size > MAX_MESSAGE_FILE_SIZE_BYTES) {
    return {
      accepted: false,
      reasonKey: "messages.media.fileTooBig",
      params: { max: megabytesOf(MAX_MESSAGE_FILE_SIZE_BYTES) },
    };
  }
  return { accepted: true, mimeType, size };
}
