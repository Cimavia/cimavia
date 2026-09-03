import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireCapability } from "../../auth/decorator/require-capability.decorator";
import { CounterpartService } from "../service/counterpart.service";
import { RelationService } from "../service/relation.service";

@ApiTags("relations")
@Controller()
export class RelationController {
  constructor(
    private readonly relations: RelationService,
    private readonly counterparts: CounterpartService,
  ) {}

  // Coach : la liste de SES athlètes.
  @Get("athletes")
  @RequireCapability("coach")
  listAthletes() {
    return this.relations.listAthletes();
  }

  // Athlète : SON coach (ou null si autonome).
  @Get("me/coach")
  @RequireCapability("athlete")
  myCoach() {
    return this.relations.myCoach();
  }

  /**
   * A-t-on quelqu'un en face, de chaque côté ? (#198)
   *
   * AUCUNE capacité exigée, comme le centre de notifications, et c'est la raison d'être de cette
   * route : la navigation la lit avant de savoir à quel titre elle s'affiche, et pour les DEUX
   * espaces à la fois. Les deux routes ci-dessus ne peuvent pas répondre — gardées par capacité,
   * elles rendraient un 403 à un compte mono-capacité sur chaque écran.
   */
  @Get("me/counterparts")
  myCounterparts() {
    return this.counterparts.mine();
  }
}
