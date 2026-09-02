import type { CapabilityName } from "../capability";
import { type MessageAttachmentDto, MessageAttachmentType } from "../dto/message.schema";
import type { TypesValuesOf } from "../type/generics.type";

/**
 * La clé i18n du libellé d'une puce « à propos de… », par type de cible.
 *
 * Le libellé n'est PAS produit par l'API (elle ne rend aucune string) et n'est pas non plus écrit
 * en dur dans deux composants : c'est le type qui choisit la clé, comme `NOTIFICATION_LABEL_KEY`.
 * Le titre et la date s'y interpolent.
 */
export const MESSAGE_ATTACHMENT_LABEL_KEY = {
  [MessageAttachmentType.SCHEDULED_SESSION]: "messages.attachment.session",
  [MessageAttachmentType.SESSION_FEEDBACK]: "messages.attachment.feedback",
} as const satisfies Record<MessageAttachmentType, string>;

/**
 * L'écran vers lequel une puce mène — pas une route, que ce paquet ne connaît pas.
 *
 * Chaque app traduit ça dans son propre routeur : `/sessions/$id` et `/session/[id]` ne s'écrivent
 * pas pareil, mais « la séance » est la même intention des deux côtés.
 */
export const AttachmentDestination = {
  SESSION: "SESSION",
  FEEDBACK: "FEEDBACK",
} as const;
export type AttachmentDestination = TypesValuesOf<typeof AttachmentDestination>;

export type AttachmentTarget = {
  destination: AttachmentDestination;
  /** Les deux écrans s'adressent par la séance — y compris le débrief, côté coach comme athlète. */
  scheduledSessionId: string;
};

/**
 * Où mène la puce, selon la capacité de CELUI QUI LIT.
 *
 * Le même message n'ouvre pas le même écran des deux côtés du fil, et ce n'est pas une préférence
 * d'UI : les deux univers n'ont pas les mêmes écrans.
 *
 * - **Athlète** : la séance citée, ou son débrief. Les deux existent chez lui.
 * - **Coach** : le débrief, dans les DEUX cas. Il n'existe aucune page de séance côté coach — ni
 *   web ni mobile — et le débrief est le seul endroit où il a quelque chose à faire d'une séance
 *   de son athlète. Une puce qui mènerait à une route inexistante serait pire qu'inerte.
 *
 * Il y a donc TOUJOURS une destination, d'où un retour non nullable. `as` l'est aussi, et pas par
 * confort : le hook qui rend `CapabilityName | null` (`useExercisedCapability`) répond à une autre
 * question — faut-il poser `?as=` sur l'API — et vaut `null` pour tout compte mono-capacité. Le
 * passer ici rendait la puce inerte chez 99 % des comptes. Le type refuse maintenant l'erreur :
 * c'est `useActingCapability`, toujours résolu, qu'on attend.
 */
export function attachmentTarget(
  attachment: MessageAttachmentDto,
  as: CapabilityName,
): AttachmentTarget {
  if (as === "coach") {
    return {
      destination: AttachmentDestination.FEEDBACK,
      scheduledSessionId: attachment.scheduledSessionId,
    };
  }

  return {
    destination:
      attachment.type === MessageAttachmentType.SESSION_FEEDBACK
        ? AttachmentDestination.FEEDBACK
        : AttachmentDestination.SESSION,
    scheduledSessionId: attachment.scheduledSessionId,
  };
}
