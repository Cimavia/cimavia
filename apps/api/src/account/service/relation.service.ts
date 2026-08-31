import { type CoachAthleteDto, CoachAthleteStatus, SELF_RELATION_ID } from "@cmv/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { CoachAthlete } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { currentActor } from "../../tenancy/tenant-context.type";
import { toCoachAthleteDto } from "../coach-athlete.mapper";
import { UserDirectoryService } from "./user-directory.service";

@Injectable()
export class RelationService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly users: UserDirectoryService,
    private readonly cls: ClsService,
  ) {}

  /**
   * Coach : ses relations (scopé `coachId` → seulement SES athlètes), précédées de LUI-MÊME s'il
   * porte aussi la capacité athlète (#14).
   *
   * Cette entrée est **synthétique** : un coach qui se coache n'a pas de ligne `CoachAthlete`, et
   * ne peut pas en avoir — le CHECK `coach_athlete_not_self` l'interdit depuis #11. La produire
   * ici, plutôt que de laisser chaque écran gérer le cas, permet au builder et au tableau de bord
   * de rester inchangés : ils lisent déjà cette route.
   *
   * En TÊTE de liste, et pas par commodité d'affichage : c'est le destinataire le plus probable
   * d'un cycle qu'on est en train d'écrire pour soi.
   */
  async listAthletes(): Promise<CoachAthleteDto[]> {
    const relations = await this.db.coachAthlete.findMany({
      orderBy: { joinedAt: "desc" },
    });
    const dtos = await this.withNames(relations);
    const self = await this.selfEntry();
    return self == null ? dtos : [self, ...dtos];
  }

  /** `null` dès que le compte ne cumule pas : sans les deux capacités, il n'est pas son athlète. */
  private async selfEntry(): Promise<CoachAthleteDto | null> {
    const { userId, capabilities } = currentActor(this.cls);
    if (!capabilities.isCoach || !capabilities.isAthlete) return null;

    const names = await this.users.namesByIds([userId]);
    const name = names.get(userId);
    if (name == null) {
      throw new Error(`[account] utilisateur courant introuvable : ${userId}`);
    }
    return {
      id: SELF_RELATION_ID,
      coachId: userId,
      coachName: name,
      athleteId: userId,
      athleteName: name,
      status: CoachAthleteStatus.ACTIVE,
      // Aucune date : la relation n'a pas été nouée, elle découle des capacités. Les rendre à la
      // date du jour laisserait croire à un événement qui n'a pas eu lieu.
      invitedAt: new Date(0).toISOString(),
      joinedAt: null,
      isSelf: true,
    };
  }

  // Athlète : sa relation coach, ou null s'il est autonome (pas de fallback silencieux).
  async myCoach(): Promise<CoachAthleteDto | null> {
    const relation = await this.db.coachAthlete.findFirst();
    if (relation == null) return null;
    const [dto] = await this.withNames([relation]);
    return dto ?? null;
  }

  // Un seul aller-retour pour tous les noms, quel que soit le nombre de relations.
  private async withNames(relations: CoachAthlete[]): Promise<CoachAthleteDto[]> {
    const names = await this.users.namesByIds(
      relations.flatMap((relation) => [relation.coachId, relation.athleteId]),
    );
    return relations.map((relation) => toCoachAthleteDto(relation, names));
  }
}
