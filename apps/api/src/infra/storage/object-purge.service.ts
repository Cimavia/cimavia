import { Injectable } from "@nestjs/common";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";
import { PrismaService } from "../prisma/prisma.service";
import { keysCitedByRows } from "./object-references";
import { StorageService } from "./storage.service";

/** Par passage : un compte volumineux se vide en plusieurs ticks, sans tenir une requête. */
export const OBJECT_PURGE_BATCH_SIZE = 200;

/** Le cron coupe le tick à 60 s : la purge s'arrête d'elle-même, le passage suivant reprend. */
export const OBJECT_PURGE_BUDGET_MS = 20_000;

/**
 * Le NOM de l'erreur, jamais l'erreur : le SDK S3 recopie sur l'exception les champs de la réponse
 * (`Key`, `Resource`), donc la clé et le nom du fichier qu'elle porte. Comme le balayage (#72).
 */
function reasonOf(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

/**
 * Vide la file des objets à retirer du stockage (#256).
 *
 * L'effacement d'un compte écrit ses clés dans la transaction qui supprime ses lignes, puis appelle
 * ce service ; le tick externe reprend ce qui reste. Une ligne ne part qu'une fois son objet retiré :
 * un stockage en panne laisse la file intacte, et le passage suivant recommence.
 *
 * Par le client de base : la file ne relève d'aucun tenant, le compte n'existe plus.
 *
 * Chaque lot relit les citations avant de rien retirer (#73) : une clé mise en file au remplacement
 * d'un justificatif peut être rattachée de nouveau avant le passage, par un client qui la rejoue.
 * Citée, elle n'est plus orpheline — sa prise en charge part, l'objet reste.
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
    const cited = await keysCitedByRows(
      this.prisma,
      pending.map((object) => object.key),
    );
    if (cited.size > 0) {
      await this.prisma.pendingObjectDeletion.deleteMany({ where: { key: { in: [...cited] } } });
    }
    let purged = 0;
    for (const object of pending) {
      if (Date.now() >= deadline) break;
      if (cited.has(object.key)) continue;
      if (await this.purgeOne(object)) purged += 1;
    }
    return purged;
  }

  /** Pour qui n'a pas à échouer si la purge échoue : la file reste, le tick suivant reprend. */
  async drainSafely(): Promise<number> {
    try {
      return await this.drain();
    } catch (err) {
      this.logger.warn({ err }, "objets à retirer : passage abandonné, repris au prochain tick");
      return 0;
    }
  }

  /**
   * Retire l'objet d'une ligne qui vient de partir, sans faire échouer l'appelant : son écriture
   * est faite, un 500 lui dirait le contraire (#73). Le stockage en panne, la clé rejoint la file,
   * que le tick vide sans opérateur. La base en panne à son tour, l'objet reste orphelin : c'est le
   * balayage de #72 qui le ramasse.
   *
   * Par le client de base, hors de la transaction de l'appelant : la file n'a pas de scope tenant,
   * et l'objet ne se retire qu'une fois la ligne partie pour de bon.
   */
  async deleteOrDefer(key: string): Promise<void> {
    try {
      await this.storage.deleteObject(key);
      return;
    } catch (err) {
      this.logger.warn(
        { reason: reasonOf(err) },
        "objet à retirer : stockage en échec, confié à la file",
      );
    }
    try {
      // `skipDuplicates` : la clé peut déjà attendre son tour, un double envoi l'y aurait mise.
      await this.prisma.pendingObjectDeletion.createMany({ data: [{ key }], skipDuplicates: true });
    } catch (err) {
      this.logger.error(
        { reason: reasonOf(err) },
        "objet à retirer : ni retiré ni mis en file, laissé au balayage",
      );
    }
  }

  private async purgeOne({ id, key }: { id: string; key: string }): Promise<boolean> {
    try {
      await this.storage.deleteObject(key);
    } catch (err) {
      // L'id et non la clé : une clé porte le nom du fichier, qui n'a rien à faire dans les logs.
      this.logger.warn(
        { reason: reasonOf(err), pendingId: id },
        "objet à retirer : échec, repris au prochain tick",
      );
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
