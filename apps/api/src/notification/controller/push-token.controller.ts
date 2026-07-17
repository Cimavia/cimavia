import { Body, Controller, Delete, HttpCode, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RegisterPushTokenDto } from "../dto/register-push-token.dto";
import { PushTokenService } from "../service/push-token.service";

// Appareils de l'utilisateur courant. Aucun @Roles : les DEUX rôles reçoivent des notifications
// (l'athlète une planif diffusée ou ajustée, le coach un débrief) — le scope tenant suffit,
// chacun ne gérant que ses propres appareils.
@ApiTags("notifications")
@Controller("me/push-tokens")
export class PushTokenController {
  constructor(private readonly tokens: PushTokenService) {}

  @Post()
  register(@Body() dto: RegisterPushTokenDto) {
    return this.tokens.register(dto);
  }

  // Révocation à la déconnexion. Le token vit dans l'URL : il n'est pas secret (c'est une
  // adresse de livraison), et le scope tenant garantit qu'on ne révoque que les siens.
  @Delete(":token")
  @HttpCode(204)
  revoke(@Param("token") token: string) {
    return this.tokens.revoke(token);
  }
}
