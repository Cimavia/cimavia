import { type CoachAthleteDto, CoachAthleteStatus, required } from "@cmv/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CoachAthlete, Prisma } from "@prisma/client";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { NotificationService } from "../../notification/notification.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { withNames } from "../coach-athlete.mapper";
import { UserDirectoryService } from "./user-directory.service";

/** L'autre partie du lien, vue de l'acteur : le scope pose la sienne. */
type Counterpart = { athleteId: string } | { coachId: string };

/** Qui rompt : le titre sous lequel l'acteur agit. */
type EndedBy = "coach" | "athlete";

/**
 * Rompre un lien coach↔athlète (#909), de l'un ou l'autre côté — sans rien effacer (tranché en
 * #213). Le lien passe à ENDED et garde sa date de fin ; les cycles du couple en reçoivent une
 * copie (`Plan.followEndedAt`), que le scope tenant lit pour les fermer en écriture à TOUS : le
 * Coach, l'athlète, et l'autre Coach à qui le cycle était ouvert.
 *
 * Idempotent : rompre un lien déjà rompu le rend tel quel, sans rien redater ni reprévenir.
 */
@Injectable()
export class RelationEndService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly prisma: PrismaService,
    private readonly users: UserDirectoryService,
    private readonly notifications: NotificationService,
  ) {}

  /** Coach : met fin au suivi de l'un de ses athlètes. */
  endWithAthlete(athleteId: string): Promise<CoachAthleteDto> {
    return this.end({ athleteId }, "coach");
  }

  /** Athlète : quitte l'un de ses Coachs. */
  leaveCoach(coachId: string): Promise<CoachAthleteDto> {
    return this.end({ coachId }, "athlete");
  }

  /**
   * Le lien se trouve par une lecture SCOPÉE — celui de l'acteur avec cette personne, ou 404, sans
   * dire si l'autre suit quelqu'un d'autre. Il s'écrit ensuite par le client de BASE : la fin du
   * suivi se pose sur TOUS les cycles du couple, y compris ceux qu'un athlète ne pourrait pas
   * écrire par son propre scope.
   */
  private async end(counterpart: Counterpart, endedBy: EndedBy): Promise<CoachAthleteDto> {
    const found = await this.db.coachAthlete.findFirst({
      where: counterpart,
      select: { id: true },
    });
    if (found == null) {
      throw new NotFoundException("Lien introuvable");
    }
    const { relation, ended } = await this.prisma.$transaction((tx) => endLink(tx, found.id));
    // APRÈS la transaction : une notification est un effet de bord d'une rupture déjà acquise.
    if (ended) {
      await this.notifications.notifyRelationEnded({
        relationId: relation.id,
        coachId: relation.coachId,
        athleteId: relation.athleteId,
        endedBy,
      });
    }
    const [dto] = await withNames(this.users, [relation]);
    return required(dto, `[account] lien ${relation.id} rompu mais non mappable`);
  }
}

/**
 * Le lien à ENDED, puis la fin du suivi sur les cycles du couple — dans la transaction de
 * l'appelant. L'écriture conditionnée sur ACTIVE rend la rupture idempotente sous concurrence :
 * la seconde attend le verrou de la première, puis ne trouve plus rien à rompre.
 *
 * Ce verrou, tenu jusqu'au commit, est aussi celui qu'attend la création d'un cycle
 * (`holdActiveLink`) : un cycle écrit pendant la rupture est vu ici, ou voit la rupture.
 *
 * `ended` : la rupture vient d'avoir lieu — faux si le lien l'était déjà.
 */
async function endLink(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<{ relation: CoachAthlete; ended: boolean }> {
  const endedAt = new Date();
  const { count } = await tx.coachAthlete.updateMany({
    where: { id, status: CoachAthleteStatus.ACTIVE },
    data: { status: CoachAthleteStatus.ENDED, endedAt },
  });
  const relation = await tx.coachAthlete.findUniqueOrThrow({ where: { id } });
  if (count > 0) {
    await tx.plan.updateMany({
      where: { coachId: relation.coachId, athleteId: relation.athleteId, followEndedAt: null },
      data: { followEndedAt: endedAt },
    });
  }
  return { relation, ended: count > 0 };
}
