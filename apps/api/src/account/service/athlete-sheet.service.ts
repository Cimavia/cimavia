import type { AthleteSheetDto, UpdateAthleteSheetInput } from "@cmv/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { AthleteSheet, Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { isUniqueViolation } from "../../infra/prisma/prisma-error";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { currentActor } from "../../tenancy/tenant-context.type";
import { StaleWriteException } from "../../util/stale-write.util";
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

  /**
   * Coach seul : remplace le champ libre, à condition que la fiche n'ait pas changé depuis que la
   * saisie a commencé (#440) — sinon 409 `STALE_WRITE`, et la base garde l'autre écriture.
   *
   * - `expectedUpdatedAt` à `null` (le coach n'a vu aucune fiche) : création. Si une fiche est née
   *   entre-temps — un autre onglet —, l'unicité `(coachId, athleteId)` la refuse, et c'est le même
   *   conflit, pas une panne.
   * - Sinon : écriture conditionnée sur la version lue, dans la même requête SQL. Aucune fiche à
   *   cette version — elle a changé, ou n'existe pas — et rien n'est écrit.
   */
  async upsert(athleteId: string, input: UpdateAthleteSheetInput): Promise<AthleteSheetDto> {
    await this.assertOwnedAthlete(athleteId);
    const { content, expectedUpdatedAt } = input;

    if (expectedUpdatedAt == null) return toAthleteSheetDto(await this.create(athleteId, content));

    const { count } = await this.db.athleteSheet.updateMany({
      where: { athleteId, updatedAt: new Date(expectedUpdatedAt) },
      data: { content },
    });
    if (count === 0) throw new StaleWriteException();

    // `updateMany` ne rend pas la ligne. Relue après coup, elle peut déjà porter une écriture
    // suivante : c'est alors celle-ci que le client reçoit, contenu et version ensemble.
    const sheet = await this.db.athleteSheet.findFirstOrThrow({ where: { athleteId } });
    return toAthleteSheetDto(sheet);
  }

  private async create(athleteId: string, content: string): Promise<AthleteSheet> {
    try {
      return await this.db.athleteSheet.create({
        // coachId injecté par le tenancy layer (extension Prisma) — d'où le cast.
        data: { athleteId, content } satisfies Omit<
          Prisma.AthleteSheetUncheckedCreateInput,
          "coachId"
        > as Prisma.AthleteSheetUncheckedCreateInput,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new StaleWriteException();
      throw error;
    }
  }
}
