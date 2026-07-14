import type { AthleteSheetDto } from "@cmv/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toAthleteSheetDto } from "../athlete-sheet.mapper";

@Injectable()
export class AthleteSheetService {
  constructor(@Inject(TENANT_PRISMA) private readonly db: TenantPrisma) {}

  // Vérifie que l'athlète est bien lié à CE coach (scopé coachId) avant tout accès à sa fiche.
  private async assertOwnedAthlete(athleteId: string): Promise<void> {
    const relation = await this.db.coachAthlete.findFirst({
      where: { athleteId },
    });
    if (relation == null) {
      throw new NotFoundException("Athlète introuvable parmi les vôtres");
    }
  }

  // Coach : lit la fiche de son athlète (null si pas encore rédigée — pas de fallback).
  async get(athleteId: string): Promise<AthleteSheetDto | null> {
    await this.assertOwnedAthlete(athleteId);
    const sheet = await this.db.athleteSheet.findFirst({
      where: { athleteId },
    });
    return sheet == null ? null : toAthleteSheetDto(sheet);
  }

  // Coach seul : édite le champ libre. Crée la fiche si absente (coachId injecté par le tenancy layer).
  async upsert(athleteId: string, content: string): Promise<AthleteSheetDto> {
    await this.assertOwnedAthlete(athleteId);
    const existing = await this.db.athleteSheet.findFirst({
      where: { athleteId },
    });
    const sheet =
      existing == null
        ? await this.db.athleteSheet.create({
            // coachId injecté par le tenancy layer (extension Prisma) — d'où le cast.
            data: { athleteId, content } satisfies Omit<
              Prisma.AthleteSheetUncheckedCreateInput,
              "coachId"
            > as Prisma.AthleteSheetUncheckedCreateInput,
          })
        : await this.db.athleteSheet.update({
            where: { id: existing.id },
            data: { content },
          });
    return toAthleteSheetDto(sheet);
  }
}
