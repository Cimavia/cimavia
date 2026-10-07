import { Body, Controller, Delete, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CreateInvitationDto } from "../../account/dto/create-invitation.dto";
import { RequireCapability } from "../../auth/decorator/require-capability.decorator";
import { OrganizationService } from "../service/organization.service";

/**
 * L'espace Entreprise (#601) : ses Coachs et ses invitations. Toute la classe exige la capacité
 * `company`, qui est aussi le scope : un Coach ou un athlète y prend 403.
 */
@ApiTags("organization")
@Controller("organization")
@RequireCapability("company")
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  @Get("coaches")
  listCoaches() {
    return this.organization.listCoaches();
  }

  @Get("invitations")
  listInvitations() {
    return this.organization.listInvitations();
  }

  @Post("invitations")
  inviteCoach(@Body() dto: CreateInvitationDto) {
    return this.organization.inviteCoach(dto);
  }

  @Post("invitations/:id/revoke")
  @HttpCode(204)
  async revokeInvitation(@Param("id") id: string) {
    await this.organization.revokeInvitation(id);
  }

  @Delete("invitations/:id")
  @HttpCode(204)
  async removeInvitation(@Param("id") id: string) {
    await this.organization.removeInvitation(id);
  }
}
