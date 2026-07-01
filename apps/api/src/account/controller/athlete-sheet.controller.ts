import { Role } from "@cmv/shared";
import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { UpdateAthleteSheetDto } from "../dto/update-athlete-sheet.dto";
import { AthleteSheetService } from "../service/athlete-sheet.service";

// Fiche athlète : champ libre, éditable par le coach uniquement (rôle + tenancy layer).
@ApiTags("athlete-sheets")
@Roles([Role.COACH])
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
