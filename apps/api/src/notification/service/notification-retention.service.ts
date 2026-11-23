import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { retentionCutoff } from "../../util/retention.util";

/**
 * La rétention des notifications lues (#76, dette N-2) : une notification lue depuis plus de
 * `HANDLED_RETENTION_DAYS` est supprimée, au passage du tick récurrent — le seul déclencheur de
 * l'API (`POST /internal/reminders/tick`), qui vide déjà la file des objets et purge les rappels
 * traités. Pas de second cron.
 *
 * - **Jamais une non-lue**, quelle que soit son ancienneté : c'est précisément le signal qu'elle
 *   porte. `readAt < seuil` l'écarte d'office — une comparaison avec `NULL` n'est jamais vraie.
 * - **`readAt`, pas `createdAt`** : six mois depuis la LECTURE. Une notification ancienne ouverte
 *   hier reste six mois de plus.
 * - **Par le client de base**, chez tous les destinataires d'un coup. Le scope `recipientId`
 *   suppose un acteur, et un tick n'en a pas ; en ouvrir un par compte (coachs ET athlètes)
 *   n'ajouterait rien à un prédicat qui ne dépend d'aucun tenant. C'est la même exception que
 *   l'émission (`NotificationService`, règle 1), limitée ici à une suppression par date.
 */
@Injectable()
export class NotificationRetentionService {
  constructor(private readonly prisma: PrismaService) {}

  /** `now` vient de l'appelant : le service reste testable sans horloge. */
  async purgeRead(now: Date): Promise<number> {
    const { count } = await this.prisma.notification.deleteMany({
      where: { readAt: { lt: retentionCutoff(now) } },
    });
    return count;
  }
}
