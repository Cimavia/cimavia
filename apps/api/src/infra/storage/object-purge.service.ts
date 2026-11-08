import { Injectable } from "@nestjs/common";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "./storage.service";

/** Par passage : un compte volumineux se vide en plusieurs ticks, sans tenir une requête. */
export const OBJECT_PURGE_BATCH_SIZE = 200;

/** Le cron coupe le tick à 60 s : la purge s'arrête d'elle-même, le passage suivant reprend. */
export const OBJECT_PURGE_BUDGET_MS = 20_000;

/**
 * Vide la file des objets à retirer du stockage (#256).
 *
 * L'effacement d'un compte écrit ses clés dans la transaction qui supprime ses lignes, puis appelle
 * ce service ; le tick externe reprend ce qui reste. Une ligne ne part qu'une fois son objet retiré :
 * un stockage en panne laisse la file intacte, et le passage suivant recommence.
 *
 * Par le client de base : la file ne relève d'aucun tenant, le compte n'existe plus.
 */
@Injectable()
export class ObjectPurgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectPinoLogger(ObjectPurgeService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Rend le nombre d'objets retirés. Les moins tentés d'abord : un objet qui échoue toujours ne doit
   * pas occuper le lot et priver les suivants de leur tour.
   */
  async drain(limit = OBJECT_PURGE_BATCH_SIZE, budgetMs = OBJECT_PURGE_BUDGET_MS): Promise<number> {
    const deadline = Date.now() + budgetMs;
    const pending = await this.prisma.pendingObjectDeletion.findMany({
      orderBy: [{ attempts: "asc" }, { createdAt: "asc" }],
      take: limit,
      select: { id: true, key: true },
    });
    let purged = 0;
    for (const object of pending) {
      if (Date.now() >= deadline) break;
      if (await this.purgeOne(object)) purged += 1;
    }
    return purged;
  }

  private async purgeOne({ id, key }: { id: string; key: string }): Promise<boolean> {
    try {
      await this.storage.deleteObject(key);
    } catch (err) {
      // L'id et non la clé : une clé porte le nom du fichier, qui n'a rien à faire dans les logs.
      this.logger.warn({ err, pendingId: id }, "objet à retirer : échec, repris au prochain tick");
      await this.prisma.pendingObjectDeletion.updateMany({
        where: { id },
        data: { attempts: { increment: 1 } },
      });
      return false;
    }
    // `deleteMany` : le tick et la fin d'un effacement peuvent traiter la même ligne.
    await this.prisma.pendingObjectDeletion.deleteMany({ where: { id } });
    return true;
  }
}
