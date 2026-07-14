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
