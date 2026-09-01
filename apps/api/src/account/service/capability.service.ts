import {
  type Capabilities,
  CapabilityBlocker,
  CoachAthleteStatus,
  Role,
  type UpdateCapabilitiesInput,
} from "@cmv/shared";
import { ConflictException, Injectable } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { currentActor } from "../../tenancy/tenant-context.type";

/**
 * Capacités du compte courant (#13) — les ajouter après coup, ou en retirer une.
 *
 * Client de base et NON le client tenant : la cible est la ligne `user` de l'acteur lui-même, qui
 * n'est pas une entité scopée (`User` n'est pas dans `TENANT_SCOPES`). Chaque requête vise
 * explicitement `currentActor(...).userId` — un id qui vient de la session, jamais du client.
 *
 * Point d'entrée UNIQUE, et c'est délibéré : c'est ici que viendra s'accrocher le contrôle
 * d'abonnement quand il existera (hors périmètre MVP, cf. `cahier-des-charges-mvp.md`). Un champ
 * modifiable dans le profil aurait dispersé cette décision.
 */
@Injectable()
export class CapabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async update(input: UpdateCapabilitiesInput): Promise<Capabilities> {
    const { userId } = currentActor(this.cls);
    // « Au moins une » est déjà refusé par le schéma partagé (400) : ici on ne garde que ce qui
    // dépend de l'ÉTAT — ce que le schéma ne peut pas connaître.
    await this.assertRemovable(userId, input);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isCoach: input.isCoach,
        isAthlete: input.isAthlete,
        // Le persona se recalcule, il ne se conserve pas. Retirer `isCoach` à un compte
        // `role=COACH` le laisserait atterrir dans un espace qu'il n'a plus — même dérivation
        // qu'à l'inscription (#12), coach l'emportant quand les deux restent.
        role: input.isCoach ? Role.COACH : Role.ATHLETE,
      },
      select: { isCoach: true, isAthlete: true },
    });
    return user;
  }

  /**
   * Refuse de retirer une capacité EN COURS D'USAGE — c'est-à-dire portée par une relation, jamais
   * par la donnée produite.
   *
   * Un coach sans athlète peut donc redevenir simple athlète en gardant sa bibliothèque et ses
   * cycles : ils ne sont pas supprimés, seulement hors de sa vue, et reviennent s'il réactive la
   * capacité. Bloquer là-dessus coincerait quiconque a seulement essayé l'application — c'est à
   * l'UI de prévenir, pas à l'API de refuser.
   */
  private async assertRemovable(userId: string, input: UpdateCapabilitiesInput): Promise<void> {
    if (!input.isCoach) {
      const athletes = await this.prisma.coachAthlete.count({
        where: { coachId: userId, status: CoachAthleteStatus.ACTIVE },
      });
      if (athletes > 0) {
        throw new ConflictException(CapabilityBlocker.ACTIVE_ATHLETES);
      }
    }

    if (!input.isAthlete) {
      const coach = await this.prisma.coachAthlete.count({ where: { athleteId: userId } });
      if (coach > 0) {
        throw new ConflictException(CapabilityBlocker.ACTIVE_COACH);
      }
    }
  }
}
