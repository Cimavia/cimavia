import { Body, Controller, Patch } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { UpdateCapabilitiesDto } from "../dto/update-capabilities.dto";
import { CapabilityService } from "../service/capability.service";

/**
 * Capacités du compte courant (#13).
 *
 * AUCUNE capacité exigée, et ce n'est pas un oubli : c'est justement la route par laquelle on en
 * obtient une. `@RequireCapability("coach")` interdirait à un athlète de se mettre à coacher —
 * l'exact cas d'usage. La session suffit à décider, et la cible est toujours l'acteur lui-même :
 * l'id vient du contexte tenant, jamais du client.
 *
 * Route dédiée plutôt qu'un champ du profil : c'est ici que s'accrochera le contrôle d'abonnement
 * quand il existera (hors périmètre MVP). Un point d'entrée unique se surveille ; un champ
 * modifiable parmi d'autres se contourne.
 */
@ApiTags("account")
@Controller("me/capabilities")
export class CapabilityController {
  constructor(private readonly capabilities: CapabilityService) {}

  @Patch()
  update(@Body() dto: UpdateCapabilitiesDto) {
    return this.capabilities.update(dto);
  }
}
