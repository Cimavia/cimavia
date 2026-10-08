import { createInvitationSchema, type PendingInvitationDto } from "../dto/invitation.schema";

/**
 * L'adresse qu'un Coach a saisie pour inviter, prête à partir — ou `null` si elle ne peut pas
 * partir telle quelle (#390).
 *
 * Le web et le mobile ferment leur bouton « Inviter » sur cette réponse, et c'est pour ça qu'elle
 * vit ici : sans elle, une adresse incomplète partait jusqu'à l'API, qui la refusait d'un message
 * Zod en anglais (#319). Écrite des deux côtés, la règle aurait fini par diverger.
 *
 * La validation est celle du schéma d'entrée lui-même, pas une expression à part : ce que le
 * client laisse passer est exactement ce que l'API accepte. Les blancs du copier-coller sont
 * retirés ; la casse, elle, reste celle de la saisie — la normalisation pour comparer est l'affaire
 * de l'API (`normalizeEmail`), le Coach doit retrouver dans sa liste ce qu'il a tapé.
 *
 * `null` veut dire « pas une adresse », jamais « rien de saisi » ni « indisponible » : l'appelant
 * n'a pas à distinguer, il garde son bouton fermé dans tous les cas.
 */
export function invitationEmailOf(raw: string): string | null {
  const email = raw.trim();
  return createInvitationSchema.safeParse({ email }).success ? email : null;
}

/**
 * Les textes de la carte d'une invitation reçue, selon qui l'émet (#602) — la même carte sur le web
 * et sur mobile, d'où une table ici plutôt qu'un ternaire de chaque côté.
 *
 * Un Coach se rejoint (« Rejoindre M ») ; une entreprise ne se rejoint pas, on est suivi par ses
 * Coachs : sa carte dit « Accepter », et nomme l'entreprise qui devra réinviter après un refus.
 * Chaque clé reçoit `{ name }`, le nom de l'émetteur, qu'elle l'emploie ou non.
 */
export const INVITATION_CARD_KEY = {
  coach: {
    title: "coach.invitation.title",
    accept: "coach.invitation.join",
    declineHint: "coach.invitation.declineHint",
  },
  organization: {
    title: "coach.invitation.fromOrganization.title",
    accept: "coach.invitation.fromOrganization.accept",
    declineHint: "coach.invitation.fromOrganization.declineHint",
  },
} as const satisfies Record<
  PendingInvitationDto["issuer"]["kind"],
  Record<"title" | "accept" | "declineHint", string>
>;
