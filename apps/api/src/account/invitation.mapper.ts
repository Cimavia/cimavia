import type { InvitationDto, PendingInvitationDto } from "@cmv/shared";
import { required } from "@cmv/shared";
import type { Invitation } from "@prisma/client";

export function toInvitationDto(invitation: Invitation): InvitationDto {
  return {
    id: invitation.id,
    email: invitation.email,
    status: invitation.status,
    role: invitation.role,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  };
}

/**
 * Qui émet une invitation : un Coach, ou une entreprise depuis #602. Le CHECK
 * `invitation_single_issuer` garantit qu'il y en a exactement un — un `null` des deux côtés serait
 * une donnée incohérente, pas un cas.
 */
export type InvitationIssuer =
  | { kind: "coach"; coachId: string }
  | { kind: "organization"; organizationId: string };

export function issuerOf(
  invitation: Pick<Invitation, "id" | "coachId" | "organizationId">,
): InvitationIssuer {
  if (invitation.organizationId != null) {
    return { kind: "organization", organizationId: invitation.organizationId };
  }
  return {
    kind: "coach",
    coachId: required(invitation.coachId, `[account] invitation sans émetteur : ${invitation.id}`),
  };
}

/**
 * L'invitation telle que l'ATHLÈTE la reçoit (#146) — un mapping séparé, et pas une projection de
 * `toInvitationDto` : les deux vues ne répondent pas à la même question, et rien ne doit pouvoir
 * faire fuiter `email`, `coachId` ou `organizationId` du côté de celui qui est invité.
 *
 * Les noms viennent d'une résolution séparée (`UserDirectoryService`), `User` étant hors scope
 * tenant. Un nom introuvable ne se remplace pas par un blanc : proposer « quelqu'un t'invite »
 * serait un fallback silencieux au sens de la règle dure n°5, et une invitation dont l'émetteur a
 * disparu signale une donnée incohérente — les colonnes d'émetteur sont en `Cascade`, la ligne
 * aurait dû partir avec lui. Même contrat que `toCoachAthleteDto`.
 *
 * Une invitation d'entreprise (#602) nomme aussi ses Coachs : ceux qui suivront l'athlète.
 * `coachNamesByOrganization` les porte, l'invité déjà retiré ; une entreprise absente de la map
 * n'a pas de Coach — liste vide, un état normal.
 */
export function toPendingInvitationDto(
  invitation: Invitation,
  namesById: Map<string, string>,
  coachNamesByOrganization: Map<string, string[]>,
): PendingInvitationDto {
  const issuer = issuerOf(invitation);
  const issuerId = issuer.kind === "coach" ? issuer.coachId : issuer.organizationId;
  const name = required(
    namesById.get(issuerId),
    `[account] émetteur introuvable pour l'invitation ${invitation.id}`,
  );

  return {
    id: invitation.id,
    issuer:
      issuer.kind === "coach"
        ? { kind: "coach", name }
        : {
            kind: "organization",
            name,
            coachNames: coachNamesByOrganization.get(issuer.organizationId) ?? [],
          },
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  };
}
