import { Role } from "@cmv/shared";
import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { RelationService } from "../service/relation.service";

@ApiTags("relations")
@Controller()
export class RelationController {
  constructor(private readonly relations: RelationService) {}

  // Coach : la liste de SES athlètes.
  @Get("athletes")
  @Roles([Role.COACH])
  listAthletes() {
    return this.relations.listAthletes();
  }

  // Athlète : SON coach (ou null si autonome).
  @Get("me/coach")
  @Roles([Role.ATHLETE])
  myCoach() {
    return this.relations.myCoach();
  }
}
