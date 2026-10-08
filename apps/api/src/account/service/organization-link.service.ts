import { type CoachAthleteDto, CoachAthleteStatus, InvitationStatus } from "@cmv/shared";
import { ConflictException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { NotificationService } from "../../notification/notification.service";
import { withNames } from "../coach-athlete.mapper";
import { CoachGraphService } from "./coach-graph.service";
import { UserDirectoryService } from "./user-directory.service";

/** L'invitation d'entreprise qu'on accepte : déjà vérifiée par l'appelant (`assertActionable`). */
type OrganizationInvitation = { id: string; organizationId: string };

/**
 * Les liens qu'une entreprise crée entre ses Coachs et ses athlètes (#602) : un athlète qui
 * rejoint F est suivi par chacun de ses Coachs, un Coach qui rejoint F suit chacun de ses athlètes.
 *
 * Vit dans l'AccountModule, et pas dans celui de l'entreprise : c'est le module des liens
 * coach-athlète, et l'OrganizationModule l'importe déjà — l'inverse ferait une dépendance
 * circulaire.
 *
 * Client de BASE : l'acteur est l'invité, qui n'est le propriétaire d'aucune des lignes lues — ni
 * des membres de F, ni de leurs liens.
 *
 * Les règles d'un lien, pour chaque couple :
 * - un lien DIRECT déjà là est gardé tel quel, sans provenance : il précède l'entreprise et ne
 *   doit pas partir avec elle ;
 * - le lien d'un compte vers lui-même est sauté (CHECK `coach_athlete_not_self`, #11) ;
 * - une boucle refuse TOUTE l'acceptation (409) : un athlète suivi par une partie seulement des
 *   Coachs de F contredirait ce que l'invitation lui a annoncé.
 */
@Injectable()
export class OrganizationLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: CoachGraphService,
    private readonly users: UserDirectoryService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * L'athlète accepte l'invitation de F : son appartenance, un lien par Coach de F, et
   * l'invitation acceptée — dans une seule transaction. Rend ses liens avec les Coachs de F, ceux
   * qui existaient compris : c'est ce qu'il voit désormais dans « Mes coachs ».
   *
   * Seuls les Coachs dont le lien vient de NAÎTRE sont prévenus : celui qui le suivait déjà en
   * direct n'apprend rien.
   */
  async athleteJoins(
    athlete: { id: string },
    invitation: OrganizationInvitation,
  ): Promise<CoachAthleteDto[]> {
    const { organizationId } = invitation;

    const { relations, created } = await this.prisma.$transaction(async (tx) => {
      await lockOrganization(tx, organizationId);

      const member = await tx.organizationAthlete.findUnique({
        where: { organizationId_athleteId: { organizationId, athleteId: athlete.id } },
        select: { id: true },
      });
      if (member != null) {
        throw new ConflictException("Tu es déjà athlète de cette entreprise");
      }

      const coachIds = (
        await tx.organizationCoach.findMany({
          where: { organizationId, coachId: { not: athlete.id } },
          select: { coachId: true },
        })
      ).map((coach) => coach.coachId);
      await this.graph.assertNoCycle(coachIds, [athlete.id]);

      await tx.organizationAthlete.create({ data: { organizationId, athleteId: athlete.id } });
      const created = await link(
        tx,
        organizationId,
        coachIds.map((coachId) => ({ coachId, athleteId: athlete.id })),
      );
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED, acceptedById: athlete.id },
      });

      const relations = await tx.coachAthlete.findMany({
        where: { athleteId: athlete.id, coachId: { in: coachIds } },
        orderBy: { joinedAt: "asc" },
      });
      return { relations, created };
    });

    // APRÈS la transaction : une notification est un effet de bord d'une action déjà réussie.
    for (const relation of created) {
      await this.notifications.notifyInvitationAccepted({
        coachId: relation.coachId,
        athleteId: athlete.id,
        invitationId: invitation.id,
      });
    }
    return withNames(this.users, relations);
  }

  /**
   * Le Coach accepte l'invitation de F : son appartenance, un lien vers chaque athlète de F, et
   * l'invitation acceptée — dans une seule transaction, sous le même verrou que `athleteJoins`.
   *
   * Seuls les athlètes dont le lien vient de NAÎTRE sont prévenus : un nouveau Coach apparaît dans
   * leur « Mes coachs » sans qu'ils l'aient invité. Celui qui le suivait déjà en direct n'apprend
   * rien.
   */
  async coachJoins(coach: { id: string }, invitation: OrganizationInvitation): Promise<void> {
    const { organizationId } = invitation;

    const created = await this.prisma.$transaction(async (tx) => {
      await lockOrganization(tx, organizationId);

      const member = await tx.organizationCoach.findUnique({
        where: { organizationId_coachId: { organizationId, coachId: coach.id } },
        select: { id: true },
      });
      if (member != null) {
        throw new ConflictException("Tu es déjà membre de cette entreprise");
      }

      const athleteIds = (
        await tx.organizationAthlete.findMany({
          where: { organizationId, athleteId: { not: coach.id } },
          select: { athleteId: true },
        })
      ).map((athlete) => athlete.athleteId);
      await this.graph.assertNoCycle(
        [coach.id],
        athleteIds,
        "Un athlète de cette entreprise te coache déjà, directement ou non",
      );

      await tx.organizationCoach.create({ data: { organizationId, coachId: coach.id } });
      const created = await link(
        tx,
        organizationId,
        athleteIds.map((athleteId) => ({ coachId: coach.id, athleteId })),
      );
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED, acceptedById: coach.id },
      });
      return created;
    });

    for (const relation of created) {
      await this.notifications.notifyOrganizationCoachJoined({
        athleteId: relation.athleteId,
        coachId: coach.id,
        organizationId,
        invitationId: invitation.id,
      });
    }
  }
}

/**
 * Sérialise les arrivées dans une MÊME entreprise. Sans ce verrou, un athlète et un Coach qui
 * rejoignent F au même instant liraient chacun la liste de l'autre AVANT son arrivée, et leur lien
 * ne naîtrait jamais. Les entreprises différentes ne s'attendent pas.
 */
async function lockOrganization(tx: Prisma.TransactionClient, organizationId: string) {
  // biome-ignore lint/plugin/noRawSql: Prisma n'exprime pas FOR UPDATE ; ne lit aucune donnée, verrouille une ligne par son id
  await tx.$queryRaw`SELECT 1 FROM "organization" WHERE "id" = ${organizationId} FOR UPDATE`;
}

/**
 * Crée les liens qui manquent, avec F pour provenance, et rend ceux-là seuls. `skipDuplicates`
 * laisse en place un lien déjà présent — direct, ou né d'une autre entreprise — sans y toucher.
 */
function link(
  tx: Prisma.TransactionClient,
  organizationId: string,
  pairs: { coachId: string; athleteId: string }[],
) {
  if (pairs.length === 0) return Promise.resolve([]);
  const joinedAt = new Date();
  return tx.coachAthlete.createManyAndReturn({
    data: pairs.map((pair) => ({
      ...pair,
      organizationId,
      status: CoachAthleteStatus.ACTIVE,
      joinedAt,
    })),
    skipDuplicates: true,
  });
}
