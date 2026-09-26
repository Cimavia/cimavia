import type { AthleteSheetDto } from "@cmv/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { currentActor } from "../../tenancy/tenant-context.type";
import { toAthleteSheetDto } from "../athlete-sheet.mapper";

@Injectable()
export class AthleteSheetService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly cls: ClsService,
  ) {}

  /**
   * Vérifie que l'athlète est bien lié à CE coach (scopé coachId) avant tout accès à sa fiche.
   *
   * **Soi-même est le seul athlète sans relation** (auto-coaching, #14) : le CHECK
   * `coach_athlete_not_self` (#11) interdit la ligne, alors que `GET /athletes` en fabrique
   * l'entrée. Sans ce cas, la fiche de la ligne « (moi) » répondait 404 — masqué par le panneau
   * web jusqu'à #301, qui rendait l'échec comme une fiche vierge. Même garde que les cycles : la
   * capacité athlète est exigée, un coach pur n'est pas son propre athlète.
   */
  private async assertOwnedAthlete(athleteId: string): Promise<void> {
    const actor = currentActor(this.cls);
    if (athleteId === actor.userId && actor.capabilities.isAthlete) return;

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
