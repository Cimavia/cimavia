import { Role } from "@cmv/shared";
import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles, Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { AcceptInvitationDto } from "../dto/accept-invitation.dto";
import { CreateInvitationDto } from "../dto/create-invitation.dto";
import { InvitationService } from "../service/invitation.service";

@ApiTags("invitations")
@Controller("invitations")
export class InvitationController {
  constructor(private readonly invitations: InvitationService) {}

  @Post()
  @Roles([Role.COACH])
  create(@Body() dto: CreateInvitationDto) {
    return this.invitations.create(dto);
  }

  @Get()
  @Roles([Role.COACH])
  listMine() {
    return this.invitations.listMine();
  }

  @Post("accept")
  @Roles([Role.ATHLETE])
  accept(@Session() session: UserSession, @Body() dto: AcceptInvitationDto) {
    return this.invitations.accept({ id: session.user.id, email: session.user.email }, dto.code);
  }
}
