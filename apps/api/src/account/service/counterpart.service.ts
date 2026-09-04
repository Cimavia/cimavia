import { CoachAthleteStatus, type CounterpartsDto } from "@cmv/shared";
import { Injectable } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { currentActor } from "../../tenancy/tenant-context.type";

/**
 * A-t-on quelqu'un en face, de chaque côté ? (#198)
 *
 * Client de base et NON le client tenant, pour la même raison que `CapabilityService` : la route
 * n'exerce aucune capacité, et `CoachAthlete` se scope sur `coachId` OU `athleteId` selon le titre
 * — sans titre, l'extension refuse la table (fail closed). Ici les deux côtés sont demandés en même
 * temps, chacun visant explicitement `currentActor(...).userId`, un id qui vient de la session et
 * jamais du client.
 *
 * `runAsCapability` deux fois aurait marché aussi, mais aurait fait passer pour une lecture scopée
 * ce qui est une question SUR le scope : « ai-je un interlocuteur à ce titre ». La formuler en clair
 * vaut mieux que de la déguiser en deux requêtes de tenant.
 */
@Injectable()
export class CounterpartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  /**
   * Les relations ACTIVES seulement : une invitation en attente n'ouvre pas encore de fil, et
   * afficher l'entrée avant l'acceptation mènerait à une messagerie que l'API refuse.
   *
   * L'auto-coaching ne peut pas compter : le CHECK `coach_athlete_not_self` (#11) interdit la ligne
   * `coachId === athleteId`, et l'entrée synthétique de `GET /athletes` (#14) est fabriquée
   * ailleurs. Un compte qui se coache seul rend donc `{ false, false }` — ce qui est exact : il n'a
   * personne à qui écrire.
   */
  async mine(): Promise<CounterpartsDto> {
    const { userId } = currentActor(this.cls);
    const [asCoach, asAthlete] = await Promise.all([
      this.prisma.coachAthlete.count({
        where: { coachId: userId, status: CoachAthleteStatus.ACTIVE },
      }),
      this.prisma.coachAthlete.count({
        where: { athleteId: userId, status: CoachAthleteStatus.ACTIVE },
      }),
    ]);
    return { asCoach: asCoach > 0, asAthlete: asAthlete > 0 };
  }
}
