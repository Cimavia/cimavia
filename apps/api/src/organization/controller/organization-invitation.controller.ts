import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { RequireCapability } from "../../auth/decorator/require-capability.decorator";
import { OrganizationInvitationService } from "../service/organization-invitation.service";

/**
 * Le Coach invité par une entreprise (#601). Gardé `coach` : un compte sans cette capacité ne peut
 * pas être invité par une entreprise — il ne voit rien et prend 403 à l'acceptation.
 */
@ApiTags("organization")
@Controller("organization-invitations")
@RequireCapability("coach")
export class OrganizationInvitationController {
  constructor(private readonly invitations: OrganizationInvitationService) {}

  /** Le filtre vient de la SESSION, jamais d'un paramètre : sinon un annuaire des invitations. */
  @Get("for-me")
  listForMe(@Session() session: UserSession) {
    return this.invitations.listForMe({ email: session.user.email });
  }

  @Post(":id/accept")
  @HttpCode(204)
  async accept(@Session() session: UserSession, @Param("id") id: string) {
    await this.invitations.accept({ id: session.user.id, email: session.user.email }, id);
  }

  @Post(":id/decline")
  @HttpCode(204)
  async decline(@Session() session: UserSession, @Param("id") id: string) {
    await this.invitations.decline({ email: session.user.email }, id);
  }
}
