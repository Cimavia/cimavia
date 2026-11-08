import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ClsService } from "nestjs-cls";
import { ExercisesNoCapability } from "../../auth/decorator/require-capability.decorator";
import { currentActor } from "../../tenancy/tenant-context.type";
import { EraseAccountDto } from "../dto/erase-account.dto";
import { AccountErasureService } from "../service/account-erasure.service";

/**
 * Supprimer son propre compte (#256). Aucune capacité exigée : un compte Entreprise, qui n'en a
 * aucune des deux autres, doit pouvoir partir aussi. La cible est toujours l'acteur — l'id vient du
 * contexte tenant, jamais du client, et il n'y a donc rien à forger pour viser quelqu'un d'autre.
 *
 * `POST` plutôt que `DELETE` : le mot de passe voyage dans le corps, qu'un `DELETE` n'est pas
 * garanti de transporter jusqu'ici.
 */
@ApiTags("account")
@ExercisesNoCapability()
@Controller("me/erasure")
export class AccountErasureController {
  constructor(
    private readonly erasure: AccountErasureService,
    private readonly cls: ClsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async erase(@Body() dto: EraseAccountDto): Promise<void> {
    await this.erasure.eraseWithPassword(currentActor(this.cls).userId, dto.password);
  }
}
