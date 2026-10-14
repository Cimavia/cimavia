import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireCapability } from "../../auth/decorator/require-capability.decorator";
import { AccessService } from "../service/access.service";

/** Les entreprises du Coach courant, pour le panneau des accès de sa bibliothèque (#605, #606). */
@ApiTags("access")
@Controller("me/organizations")
@RequireCapability("coach")
export class CoachOrganizationController {
  constructor(private readonly access: AccessService) {}

  @Get()
  list() {
    return this.access.myOrganizations();
  }
}
