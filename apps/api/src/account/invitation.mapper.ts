import type { InvitationDto } from "@cmv/shared";
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
