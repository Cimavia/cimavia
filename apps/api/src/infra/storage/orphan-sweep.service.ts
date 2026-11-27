import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";
import { PrismaService } from "../prisma/prisma.service";
import { referencedObjectKeys } from "./object-references";
import { type SweepCandidate, triage } from "./orphan-sweep";
import { StorageService } from "./storage.service";

/**
 * Ce que le balayage a vu et fait. Les clés supprimées ou en échec sont gardées, pas seulement
 * comptées : l'opérateur doit savoir ce qui est parti.
 */
export type SweepReport = {
  scanned: number;
  unknown: string[];
  recent: number;
  referenced: number;
  orphans: SweepCandidate[];
  deleted: string[];
  failed: string[];
};

export function emptySweepReport(): SweepReport {
  return {
    scanned: 0,
    unknown: [],
    recent: 0,
    referenced: 0,
    orphans: [],
    deleted: [],
    failed: [],
  };
}

/**
 * Le balayage des objets sans ligne en base (#72) — le filet commun à tous les chemins qui laissent
 * un objet derrière eux (P2-1, P3-2, un objet que ni le stockage ni la file n'ont pris en charge —
 * #73…).
 *
 * Lancé à la main (`sweep-orphans.cli`), sous l'identité root du stockage : lister le bucket est un
 * droit que la clé d'API n'a pas (« Tranché en #267 »). Simulation par défaut — `remove` ne vient
 * que d'un `--delete` explicite.
 *
 * Page par page : chaque page est confrontée à la base puis, s'il le faut, purgée AVANT de lire la
 * suivante — la citation date de la page, pas d'une photo du bucket entier prise des minutes plus
 * tôt. Les colonnes se lisent dans UN instantané (`RepeatableRead`) : lues une à une, une copie
 * créée et sa source supprimée entre deux lectures feraient passer pour orpheline une clé encore
 * citée.
 *
 * Par le client de BASE (`PrismaService`), délibérément, et jamais par `TENANT_PRISMA` : le
 * balayage traverse tous les tenants, aucun acteur ne le lance. Une clé citée par n'importe qui
 * retient son objet (`referencedObjectKeys`).
 */
@Injectable()
export class OrphanSweepService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectPinoLogger(OrphanSweepService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * `now` vient de l'appelant, comme pour le tick des rappels : testable sans horloge. `prefix`
   * restreint le balayage à une branche du bucket — sans lui, tout le bucket.
   *
   * `report` se remplit au fil des pages : si le balayage échoue en route, l'appelant garde ce qui
   * a déjà été vu et supprimé.
   */
  async sweep(
    {
      now,
      remove,
      prefix,
    }: {
      now: Date;
      remove: boolean;
      prefix?: string | undefined;
    },
    report: SweepReport = emptySweepReport(),
  ): Promise<SweepReport> {
    for await (const page of this.storage.listObjects({ prefix })) {
      const { unknown, recent, candidates } = triage(page, now);
      const cited = await this.citedAmong(candidates.map((candidate) => candidate.key));
      const orphans = candidates.filter((candidate) => !cited.has(candidate.key));
      report.scanned += page.length;
      report.unknown.push(...unknown);
      report.recent += recent;
      report.referenced += candidates.length - orphans.length;
      report.orphans.push(...orphans);
      if (remove) await this.remove(orphans, report);
    }
    return report;
  }

  private async citedAmong(keys: string[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    return this.prisma.$transaction((tx) => referencedObjectKeys(tx, keys), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }

  /** Un échec ne coûte que son objet : gardé au rapport, journalisé, repris au prochain balayage. */
  private async remove(orphans: readonly SweepCandidate[], report: SweepReport): Promise<void> {
    for (const orphan of orphans) {
      try {
        await this.storage.deleteObject(orphan.key);
        report.deleted.push(orphan.key);
      } catch (err) {
        report.failed.push(orphan.key);
        // Le nom de l'erreur, jamais l'erreur entière : le SDK S3 y recopie la clé, qui porte le
        // nom du fichier (cf. DocumentCleanupService).
        const reason = err instanceof Error ? err.name : typeof err;
        this.logger.warn(
          { family: orphan.family, reason },
          "objet orphelin : suppression échouée, repris au prochain balayage",
        );
      }
    }
  }
}
