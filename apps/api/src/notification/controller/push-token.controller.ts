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

  // Révocation à la déconnexion. Le token vit dans l'URL, et il EST un secret : la sécurité
  // renforcée des push n'est pas activée sur le compte Expo, si bien que le connaître suffit à
  // pousser une notification vers l'appareil. D'où son blanchiment dans les journaux et dans Sentry
  // (`redactUrlSecrets`, #433). Le scope tenant garantit qu'on ne révoque que les siens.
  @Delete(":token")
  @HttpCode(204)
  revoke(@Param("token") token: string) {
    return this.tokens.revoke(token);
  }
}
