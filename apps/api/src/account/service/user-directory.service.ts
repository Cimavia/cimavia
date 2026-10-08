import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";

/**
 * Résolution des noms d'utilisateurs (affichage).
 *
 * `User` n'est PAS une entité scopée (absente de TENANT_SCOPES) : le client tenant la refuse, par
 * construction — il n'existe pas de « coachId » sur un compte. On la lit donc via le client de
 * base, exactement comme la redemption d'invitation. C'est sûr **à une condition**, respectée par
 * les deux appelants : les ids proviennent toujours d'une requête DÉJÀ scopée (les relations du
 * coach courant), jamais d'une entrée client.
 */
@Injectable()
export class UserDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Le compte ATHLÈTE portant cette adresse, ou `null` — de quoi savoir s'il y a quelqu'un à
   * prévenir quand un coach émet une invitation nominative (#146).
   *
   * **La seule lecture de ce service dont l'entrée vienne du CLIENT**, et elle demande donc sa
   * propre justification. Elle est sûre parce qu'elle ne rend qu'un `id`, jamais un profil, et
   * surtout parce que l'appelant ne fait AUCUNE différence visible entre « trouvé » et « pas
   * trouvé » : l'invitation est créée et rendue à l'identique dans les deux cas. Sans cette
   * symétrie, la route deviendrait un oracle d'existence de compte.
   *
   * `isAthlete` filtre, et ce n'est pas une précaution de style : un compte coach seul ne peut pas
   * accepter, et lui poser une notification allumerait la pastille d'un espace où il n'a rien à
   * faire. Il n'est pas pour autant introuvable — il est simplement à joindre autrement.
   *
   * Comparaison INSENSIBLE à la casse : l'adresse vient du coach, le compte a été créé par
   * l'athlète, et deux personnes n'écrivent pas forcément pareil (cf. `normalizeEmail`, dans
   * `@cmv/shared`).
   */
  async athleteIdByEmail(email: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, isAthlete: true },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  /**
   * Le compte qui porte cette adresse et ses capacités, ou `null` s'il n'y en a pas — de quoi
   * choisir le canal de l'invitation d'une entreprise (#601, #602) : notification à un compte qui
   * porte la capacité du rôle, e-mail à une adresse sans compte, rien du tout à un compte qui ne
   * la porte pas.
   *
   * Même justification que `athleteIdByEmail`, et même condition : l'appelant ne fait AUCUNE
   * différence visible entre les trois issues, la création répond à l'identique.
   */
  accountByEmail(
    email: string,
  ): Promise<{ id: string; isCoach: boolean; isAthlete: boolean } | null> {
    return this.prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, isCoach: true, isAthlete: true },
    });
  }

  /**
   * Nom et adresse des comptes demandés — la page Coachs d'une entreprise (#601). Les ids viennent
   * de ses lignes `OrganizationCoach`, déjà scopées : elle ne lit que ses membres, dont elle a
   * elle-même saisi l'adresse pour les inviter.
   */
  async contactsByIds(ids: string[]): Promise<Map<string, { name: string; email: string }>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();

    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true, email: true },
    });
    return new Map(users.map((user) => [user.id, { name: user.name, email: user.email }]));
  }

  async namesByIds(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();

    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(users.map((user) => [user.id, user.name]));
  }
}
