import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireCapability } from "../../auth/decorator/require-capability.decorator";
import { UpdateAthleteSheetDto } from "../dto/update-athlete-sheet.dto";
import { AthleteSheetService } from "../service/athlete-sheet.service";

// Fiche athlète : champ libre, éditable par le coach uniquement (rôle + tenancy layer).
@ApiTags("athlete-sheets")
@RequireCapability("coach")
@Controller("athletes/:athleteId/sheet")
export class AthleteSheetController {
  constructor(private readonly sheets: AthleteSheetService) {}

  @Get()
  get(@Param("athleteId") athleteId: string) {
    return this.sheets.get(athleteId);
  }

  @Put()
  upsert(@Param("athleteId") athleteId: string, @Body() dto: UpdateAthleteSheetDto) {
    return this.sheets.upsert(athleteId, dto.content);
  }
}
