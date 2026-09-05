import type { InvitationDto, PendingInvitationDto } from "@cmv/shared";
import type { Invitation } from "@prisma/client";

export function toInvitationDto(invitation: Invitation): InvitationDto {
  return {
    id: invitation.id,
    code: invitation.code,
    email: invitation.email,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  };
}

/**
 * L'invitation telle que l'ATHLÈTE la reçoit (#146) — un mapping séparé, et pas une projection de
 * `toInvitationDto` : les deux vues ne répondent pas à la même question, et rien ne doit pouvoir
 * faire fuiter `email` ou `coachId` du côté de celui qui est invité.
 *
 * Le nom du coach vient d'une résolution séparée (`UserDirectoryService`), `User` étant hors scope
 * tenant. Un nom introuvable ne se remplace pas par un blanc : proposer « quelqu'un t'invite »
 * serait un fallback silencieux au sens de la règle dure n°5, et une invitation dont l'émetteur a
 * disparu signale une donnée incohérente — la colonne `coachId` est en `Cascade`, la ligne aurait
 * dû partir avec lui. Même contrat que `toCoachAthleteDto`.
 */
export function toPendingInvitationDto(
  invitation: Invitation,
  namesById: Map<string, string>,
): PendingInvitationDto {
  const coachName = namesById.get(invitation.coachId);
  if (coachName == null) {
    throw new Error(`[account] coach introuvable pour l'invitation ${invitation.id}`);
  }

  return {
    id: invitation.id,
    code: invitation.code,
    coachName,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  };
}
