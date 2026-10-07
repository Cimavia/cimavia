import { type OrganizationInvitationQuery, organizationInvitationQuerySchema } from "@cmv/shared";
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireCapability } from "../../auth/decorator/require-capability.decorator";
import { ZodSchemaPipe } from "../../zod/zod-schema.pipe";
import { CreateOrganizationInvitationDto } from "../dto/create-organization-invitation.dto";
import { OrganizationService } from "../service/organization.service";

/**
 * L'espace Entreprise (#601, #602) : ses Coachs, ses athlètes et ses invitations. Toute la classe
 * exige la capacité `company`, qui est aussi le scope : un Coach ou un athlète y prend 403.
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

  @Get("athletes")
  listAthletes() {
    return this.organization.listAthletes();
  }

  /** `?role=` requis : la page Coachs et la page Athlètes ne lisent chacune que les siennes. */
  @Get("invitations")
  listInvitations(
    @Query(new ZodSchemaPipe(organizationInvitationQuerySchema)) query: OrganizationInvitationQuery,
  ) {
    return this.organization.listInvitations(query.role);
  }

  @Post("invitations")
  invite(@Body() dto: CreateOrganizationInvitationDto) {
    return this.organization.invite(dto);
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
