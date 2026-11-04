import type { RequestMessageUploadUrlInput } from "../dto/message.schema";

/**
 * Un média de message prêt à partir, tel que le web et le mobile le préparent. Ce qui le porte (un
 * `File` côté web, une `uri` côté mobile) reste à l'appelant : seul le descripteur est commun.
 */
export type MessageUploadSource = {
  type: RequestMessageUploadUrlInput["type"];
  fileName: string;
  mimeType: string;
  size: number;
  durationSeconds?: number;
};

/**
 * Le descripteur commun à la demande d'URL et à l'envoi du message : une source, pas de dérive
 * entre la taille signée et la taille rattachée. Il ne recopie QUE les champs du schéma — le
 * schéma est strict, et le `File` ou l'`uri` du média le feraient refuser.
 *
 * AUDIO et VIDEO portent en plus leur durée. Le cast couvre l'union discriminée, que TS ne narrow
 * pas quand `type` et `mimeType` restent ouverts.
 */
export function messageUploadInput(media: MessageUploadSource): RequestMessageUploadUrlInput {
  const descriptor = {
    type: media.type,
    fileName: media.fileName,
    mimeType: media.mimeType,
    size: media.size,
  };
  return (
    media.durationSeconds == null
      ? descriptor
      : { ...descriptor, durationSeconds: media.durationSeconds }
  ) as RequestMessageUploadUrlInput;
}
