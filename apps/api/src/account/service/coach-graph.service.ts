import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { hasCoachCycle } from "../coach-graph";

/**
 * La garde anti-boucle des liens coach-athlète (#11), pour tout chemin qui en crée : l'invitation
 * d'un Coach, et depuis #602 celles d'une entreprise, qui en créent plusieurs d'un coup.
 *
 * Client de BASE : la remontée traverse les liens d'autres comptes que l'acteur — c'est même tout
 * son objet. Elle ne rend rien d'autre qu'un refus.
 */
@Injectable()
export class CoachGraphService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Refuse (409) les liens de chacun des `coachIds` vers chacun des `athleteIds` s'ils bouclent.
   * L'appelant a déjà écarté le lien d'un compte vers lui-même : ici, un athlète qui figure parmi
   * les coachs serait atteint dès le départ, et lu comme une boucle.
   *
   * Remonter depuis les coachs suffit, même quand plusieurs liens naissent ensemble : ils arrivent
   * tous sur des athlètes de `athleteIds`. Un chemin qui en emprunte un passe donc d'abord par
   * l'un de ces athlètes, déjà au-dessus d'un coach dans le graphe existant — et c'est lui que la
   * remontée trouve.
   *
   * A coache B, B coache C, C invite A : A est au-dessus de C, et le lien refermerait la boucle.
   *
   * Une boucle DÉJÀ présente en base — un chemin de création qui oublierait cette garde, une
   * écriture manuelle — n'est pas un refus métier mais une incohérence de données : on lève,
   * bruyamment et distinctement, plutôt que de la déguiser en 409. Elle se cherche APRÈS le
   * chargement, par `hasCoachCycle` : pendant le parcours, retomber sur un compte déjà vu ne la
   * prouve plus (voir le losange qu'elle décrit).
   */
  async assertNoCycle(coachIds: readonly string[], athleteIds: readonly string[]): Promise<void> {
    if (coachIds.length === 0 || athleteIds.length === 0) return;

    const coaches = await this.coachesAbove(coachIds);
    if (athleteIds.some((athleteId) => coaches.has(athleteId))) {
      throw new ConflictException("Ce lien créerait une boucle avec tes propres athlètes");
    }
    if (hasCoachCycle(coaches)) {
      throw new Error(
        `[relation] cycle DÉJÀ présent dans CoachAthlete au-dessus de ${coachIds.join(", ")}`,
      );
    }
  }

  /**
   * Tous les comptes au-dessus des `coachIds` (eux compris), avec leurs coachs. Une requête par
   * NIVEAU, pas par compte : la profondeur se compte en unités, la largeur peut croître avec les
   * entreprises.
   *
   * Termine même sur une base qui boucle : un compte n'entre qu'une fois dans la frontière.
   */
  private async coachesAbove(coachIds: readonly string[]): Promise<Map<string, string[]>> {
    const coaches = new Map<string, string[]>();
    let frontier = [...new Set(coachIds)];

    while (frontier.length > 0) {
      const links = await this.prisma.coachAthlete.findMany({
        where: { athleteId: { in: frontier } },
        select: { coachId: true, athleteId: true },
      });
      for (const account of frontier) coaches.set(account, []);
      for (const link of links) coaches.get(link.athleteId)?.push(link.coachId);
      frontier = [...new Set(links.map((link) => link.coachId))].filter(
        (account) => !coaches.has(account),
      );
    }
    return coaches;
  }
}
