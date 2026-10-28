import { type VersionQuery, versionQuerySchema } from "@cmv/shared";
import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireCapability } from "../../auth/decorator/require-capability.decorator";
import { ZodSchemaPipe } from "../../zod/zod-schema.pipe";
import { ScheduledCompositionDto } from "../dto/scheduled-composition.dto";
import { ScheduledDosageDto } from "../dto/scheduled-dosage.dto";
import { ScheduledCompositionService } from "../service/scheduled-composition.service";

// La composition d'une séance planifiée pour les semaines choisies (#720), et ses valeurs (#721). Chaque route rend les
// copies de la séance-type dans le Plan : la fenêtre « Pour quelles semaines ? » et l'étiquette des
// changements se lisent sur elles.
@ApiTags("plans")
@RequireCapability("coach")
@Controller("scheduled-sessions/:id")
export class ScheduledCompositionController {
  constructor(private readonly composition: ScheduledCompositionService) {}

  @Get("copies")
  copies(@Param("id") id: string) {
    return this.composition.copies(id);
  }

  // Un geste, écrit tout de suite sur les semaines cochées, défait sur les décochées.
  @Post("composition")
  @HttpCode(200)
  compose(@Param("id") id: string, @Body() dto: ScheduledCompositionDto) {
    return this.composition.compose(id, dto);
  }

  // « Tout réinitialiser » : la séance de cette semaine seule, sous sa version lue (#604).
  @Post("composition/reset")
  @HttpCode(200)
  reset(@Param("id") id: string, @Body(new ZodSchemaPipe(versionQuerySchema)) body: VersionQuery) {
    return this.composition.reset(id, body);
  }

  // « Enregistrer » de Dosage : les valeurs des semaines changées, en une écriture (#721).
  @Post("values")
  @HttpCode(200)
  dose(@Param("id") id: string, @Body() dto: ScheduledDosageDto) {
    return this.composition.dose(id, dto);
  }
}
