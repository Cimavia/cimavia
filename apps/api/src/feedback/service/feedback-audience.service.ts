import { CoachAthleteStatus } from "@cmv/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { SessionFeedback } from "@prisma/client";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { coachesWhoRead } from "../../tenancy/coach-reads";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";

/**
 * Les Coachs à prévenir d'un débrief (#610) : le propriétaire du cycle, et chaque Coach de
 * l'athlète que son filtre de lecture laisse voir le débrief. C et M suivent le cycle de TI, et M
 * n'apprenait rien du débrief qu'il lisait pourtant.
 *
 * Évalués à CHAQUE annonce, jamais retenus : un droit retiré entre deux compléments fait taire le
 * Coach qui l'a perdu, un droit accordé fait parler celui qui l'a reçu.
 */
@Injectable()
export class FeedbackAudienceService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    // L'athlète ne voit pas ce qu'un Coach lit : on relit sous son filtre (`coachesWhoRead`).
    private readonly prisma: PrismaService,
    @InjectPinoLogger(FeedbackAudienceService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Appelé au nom de l'ATHLÈTE, qui vient d'écrire : ses liens se lisent dans son scope.
   *
   * Les candidats sont ses Coachs actifs, plus le propriétaire du cycle — qui le lit toujours, même
   * si son lien a pris fin. Un droit ne s'ouvre qu'aux Coachs de l'athlète (#607) : nul autre ne
   * peut le lire, inutile de le chercher plus loin.
   *
   * L'athlète n'en est jamais (#316) : en auto-coaching, le débrief est le sien, et le prévenir
   * ouvrirait un fil avec soi-même, où l'avis passerait pour une réponse.
   *
   * Ne lève jamais : le débrief est déjà écrit, c'est la donnée. Une lecture en panne se rabat sur
   * le seul propriétaire, qui lit toujours son cycle — et le dit dans les logs : les Coachs qui le
   * lisent par un droit manquent cet avis, le prochain geste de l'athlète les retrouve.
   */
  async recipientsOf(feedback: SessionFeedback): Promise<string[]> {
    try {
      const links = await this.db.coachAthlete.findMany({
        where: { athleteId: feedback.athleteId, status: CoachAthleteStatus.ACTIVE },
        select: { coachId: true },
      });
      const candidates = new Set([feedback.coachId, ...links.map((link) => link.coachId)]);
      candidates.delete(feedback.athleteId);
      return await coachesWhoRead(this.prisma, "SessionFeedback", feedback.id, [...candidates]);
    } catch (error) {
      this.logger.error(
        { err: error, sessionFeedbackId: feedback.id },
        "Destinataires du débrief introuvables : seul le propriétaire du cycle est prévenu",
      );
      return feedback.coachId === feedback.athleteId ? [] : [feedback.coachId];
    }
  }
}
