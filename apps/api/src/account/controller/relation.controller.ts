import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  ExercisesNoCapability,
  RequireCapability,
} from "../../auth/decorator/require-capability.decorator";
import { CounterpartService } from "../service/counterpart.service";
import { RelationService } from "../service/relation.service";
import { RelationEndService } from "../service/relation-end.service";

@ApiTags("relations")
@Controller()
export class RelationController {
  constructor(
    private readonly relations: RelationService,
    private readonly counterparts: CounterpartService,
    private readonly ends: RelationEndService,
  ) {}

  // Coach : la liste de SES athlètes.
  @Get("athletes")
  @RequireCapability("coach")
  listAthletes() {
    return this.relations.listAthletes();
  }

  /**
   * Coach : met fin au suivi de l'un de ses athlètes (#909). Rend le lien rompu — 200 et non 201 :
   * rien n'est créé, et la rupture est idempotente. 404 si ce n'est pas l'un des siens.
   */
  @Post("athletes/:athleteId/end")
  @HttpCode(200)
  @RequireCapability("coach")
  endWithAthlete(@Param("athleteId") athleteId: string) {
    return this.ends.endWithAthlete(athleteId);
  }

  // Athlète : SES coachs (#599), liste vide s'il est autonome.
  @Get("me/coaches")
  @RequireCapability("athlete")
  myCoaches() {
    return this.relations.myCoaches();
  }

  /** Athlète : quitte l'un de ses Coachs (#909) — même réponse que la rupture côté Coach. */
  @Post("me/coaches/:coachId/leave")
  @HttpCode(200)
  @RequireCapability("athlete")
  leaveCoach(@Param("coachId") coachId: string) {
    return this.ends.leaveCoach(coachId);
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
  @ExercisesNoCapability()
  myCounterparts() {
    return this.counterparts.mine();
  }
}
