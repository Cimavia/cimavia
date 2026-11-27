import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";
import { PrismaService } from "../prisma/prisma.service";
import { chunked } from "./object-citations";
import { keysCitedByRows } from "./object-references";
import { StorageService } from "./storage.service";

/** Par passage : un compte volumineux se vide en plusieurs ticks, sans tenir une requête. */
export const OBJECT_PURGE_BATCH_SIZE = 200;

/** Le cron coupe le tick à 60 s : la purge s'arrête d'elle-même, le passage suivant reprend. */
export const OBJECT_PURGE_BUDGET_MS = 20_000;

/**
 * Retraits simultanés d'un même geste, au plus. Un exercice n'a pas de plafond de documents, et le
 * client S3 n'a que 50 sockets : un stockage muet (BO-4) en tiendrait autant que de fichiers, et
 * les URLs signées et rattachements des autres utilisateurs attendraient derrière.
 */
export const OBJECT_DELETE_CONCURRENCY = 10;

/**
 * Le NOM de l'erreur, jamais l'erreur : le SDK S3 recopie sur l'exception les champs de la réponse
 * (`Key`, `Resource`), donc la clé et le nom du fichier qu'elle porte. Comme le balayage (#72).
 */
function reasonOf(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

/** Les noms d'erreur distincts d'un même geste, en une ligne. */
function reasonsOf(errors: readonly unknown[]): string {
  return [...new Set(errors.map(reasonOf))].join(", ");
}

/**
 * Ce qui situe un retrait dans les journaux : les identifiants des lignes parties (exercice,
 * document, média), jamais une clé — elle porte le nom du fichier.
 */
export type PurgeContext = Readonly<Record<string, string>>;

const REMOVAL_FAILED = "objet à retirer : retrait en échec, confié à la file";
const CITATIONS_UNREADABLE =
  "objet à retirer : citations illisibles, confié à la file sans retrait";

/** Ce qui arrête un geste en cours de route, et ce que son journal en dira. */
type Halt = { reasons: unknown[]; message: string };

/**
 * Vide la file des objets à retirer du stockage (#256).
 *
 * L'effacement d'un compte écrit ses clés dans la transaction qui supprime ses lignes, puis appelle
 * ce service ; le tick externe reprend ce qui reste. Une ligne ne part qu'une fois son objet retiré :
 * un stockage en panne laisse la file intacte, et le passage suivant recommence.
 *
 * Par le client de base : la file ne relève d'aucun tenant, le compte n'existe plus.
 *
 * La citation se relit juste avant CHAQUE retrait (#73), et non au début du lot : une clé mise en
 * file au remplacement d'un justificatif peut être rattachée de nouveau pendant le passage, par un
 * client qui la rejoue. Citée, elle reste en file sans que son objet parte : sa prise en charge ne
 * se retire jamais sur la foi d'une lecture, c'est l'objet retiré qui la solde.
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
   *
   * Une ligne qui cite encore la clé ne peut être qu'une AUTRE ligne, l'appelant ayant écrit la
   * sienne : une clé rattachée deux fois (S-2), un justificatif d'avant le contrôle de préfixe
   * (#293), ou la copie d'un document qu'une séance planifiée ou une variante partage (P3, #315).
   * L'objet reste, comme il resterait par la file.
   */
  async deleteOrDefer(key: string, context: PurgeContext = {}): Promise<void> {
    await this.deleteManyOrDefer([key], context);
  }

  /**
   * La même chose pour les objets de plusieurs lignes parties ensemble — les documents d'un
   * exercice supprimé, les images qu'une consigne ne cite plus (#75). Un décompte par lot, les
   * retraits d'un lot en parallèle : la réponse les attend (#330).
   *
   * La citation illisible, aucune clé n'est jugée : toutes rejoignent la file, qui relira chacune
   * avant de la retirer — celles qu'une copie partage y attendent que leur dernière copie parte.
   *
   * Une ligne de journal par geste, pas par clé, situé par le `context` de l'appelant.
   */
  async deleteManyOrDefer(keys: readonly string[], context: PurgeContext = {}): Promise<void> {
    const deferred: string[] = [];
    let halt: Halt | null = null;
    for (const batch of chunked([...new Set(keys)], OBJECT_DELETE_CONCURRENCY)) {
      // Un lot en échec dit un stockage en panne : chaque lot suivant attendrait à son tour le
      // délai TCP (BO-4). Le reste rejoint la file sans tentative, la réponse n'attend qu'un lot.
      if (halt != null) {
        deferred.push(...batch);
        continue;
      }
      const outcome = await this.deleteBatch(batch);
      deferred.push(...outcome.deferred);
      halt = outcome.halt;
    }
    if (deferred.length === 0) return;
    if (halt != null) {
      this.logger.warn(
        { ...context, count: deferred.length, reason: reasonsOf(halt.reasons) },
        halt.message,
      );
    }
    try {
      // `skipDuplicates` : la clé peut déjà attendre son tour, un double envoi l'y aurait mise.
      await this.prisma.pendingObjectDeletion.createMany({
        data: deferred.map((key) => ({ key })),
        skipDuplicates: true,
      });
    } catch (err) {
      this.logger.error(
        { ...context, count: deferred.length, reason: reasonOf(err) },
        "objet à retirer : ni retiré ni mis en file, laissé au balayage",
      );
    }
  }

  /**
   * Un lot : ses citations relues juste avant ses retraits, comme la file avant chacun des siens
   * (#73) — un seul instantané en tête de geste laisserait les derniers lots partir sur une lecture
   * vieille de plusieurs lots. Rend les clés à confier à la file, et ce qui arrête le geste.
   */
  private async deleteBatch(batch: string[]): Promise<{ deferred: string[]; halt: Halt | null }> {
    let cited: Set<string>;
    try {
      cited = await this.citedKeys(batch);
    } catch (err) {
      return { deferred: batch, halt: { reasons: [err], message: CITATIONS_UNREADABLE } };
    }
    const orphans = batch.filter((key) => !cited.has(key));
    const results = await Promise.allSettled(orphans.map((key) => this.storage.deleteObject(key)));
    const failures = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    return {
      deferred: orphans.filter((_, index) => results[index]?.status === "rejected"),
      halt: failures.length === 0 ? null : { reasons: failures, message: REMOVAL_FAILED },
    };
  }

  private async purgeOne({ id, key }: { id: string; key: string }): Promise<boolean> {
    if ((await this.citedKeys([key])).size > 0) {
      // Reportée comme un échec : elle ne doit pas occuper la tête du lot à chaque passage.
      await this.prisma.pendingObjectDeletion.updateMany({
        where: { id },
        data: { attempts: { increment: 1 } },
      });
      return false;
    }
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

  /**
   * Parmi ces clés, celles qu'une ligne cite encore. Toutes les colonnes dans UN instantané
   * (`RepeatableRead`), comme le balayage (#72) : lues une à une, une copie créée et sa source
   * supprimée entre deux lectures feraient passer pour orpheline une clé encore citée.
   */
  private citedKeys(keys: readonly string[]): Promise<Set<string>> {
    return this.prisma.$transaction((tx) => keysCitedByRows(tx, keys), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }
}
