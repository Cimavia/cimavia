import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { RequireCapability } from "../../auth/decorator/require-capability.decorator";
import { AcceptInvitationDto } from "../dto/accept-invitation.dto";
import { CreateInvitationDto } from "../dto/create-invitation.dto";
import { DeclineInvitationDto } from "../dto/decline-invitation.dto";
import { InvitationService } from "../service/invitation.service";

@ApiTags("invitations")
@Controller("invitations")
export class InvitationController {
  constructor(private readonly invitations: InvitationService) {}

  @Post()
  @RequireCapability("coach")
  create(@Body() dto: CreateInvitationDto) {
    return this.invitations.create(dto);
  }

  @Get()
  @RequireCapability("coach")
  listMine() {
    return this.invitations.listMine();
  }

  /**
   * Athlète : ce qui l'attend (#146). Le filtre vient de la SESSION et d'elle seule — aucun
   * paramètre d'adresse, qui ferait de cette route l'annuaire des invitations émises.
   */
  @Get("for-me")
  @RequireCapability("athlete")
  listForMe(@Session() session: UserSession) {
    return this.invitations.listForMe({ email: session.user.email });
  }

  @Post("accept")
  @RequireCapability("athlete")
  accept(@Session() session: UserSession, @Body() dto: AcceptInvitationDto) {
    return this.invitations.accept({ id: session.user.id, email: session.user.email }, dto.code);
  }

  /**
   * Athlète : refuse une invitation. Rien à rendre — l'invitation refusée quitte la liste, et
   * c'est le seul état que le client ait besoin de constater. D'où un 204 plutôt qu'un DTO dont
   * personne ne lirait le contenu.
   */
  @Post("decline")
  @HttpCode(204)
  @RequireCapability("athlete")
  async decline(@Session() session: UserSession, @Body() dto: DeclineInvitationDto) {
    await this.invitations.decline({ id: session.user.id, email: session.user.email }, dto.code);
  }
}
