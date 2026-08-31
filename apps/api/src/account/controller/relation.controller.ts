import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireCapability } from "../../auth/decorator/require-capability.decorator";
import { RelationService } from "../service/relation.service";

@ApiTags("relations")
@Controller()
export class RelationController {
  constructor(private readonly relations: RelationService) {}

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
}
