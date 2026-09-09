import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { VersionService } from "./version.service";

/**
 * Volontairement PAS `@AllowAnonymous()`, contrairement à `/health` juste à côté : la version qui
 * tourne dit quels correctifs sont passés et lesquels ne le sont pas. La divulgation est mineure,
 * mais elle n'a aucune raison d'être publique quand tous ses lecteurs sont authentifiés.
 *
 * Contrepartie assumée : la sonde de déploiement frappe `/health` sans session et ne peut donc pas
 * dire quelle version elle vient de rendre saine. C'est le journal de démarrage qui le fait
 * (`main.ts`), au même endroit que le tier.
 */
@ApiTags("version")
@Controller("version")
export class VersionController {
  constructor(private readonly version: VersionService) {}

  @Get()
  @ApiOkResponse({ description: "Version du produit, identité du build et tier de déploiement." })
  current() {
    return this.version.current();
  }
}
