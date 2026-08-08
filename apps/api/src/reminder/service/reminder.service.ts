import type {
  CreateReminderInput,
  ReminderDto,
  ReminderSummaryDto,
  UpdateReminderStatusInput,
} from "@cmv/shared";
import { REMINDER_PAGE_SIZE, ReminderEntityType, ReminderStatus } from "@cmv/shared";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, Reminder } from "@prisma/client";
import type { TenantPrisma, TenantTx } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { type ReminderTargetLabels, toReminderDto } from "../reminder.mapper";

/**
 * Rappels du coach (#44) — création manuelle, liste, marquage.
 *
 * Outil PRIVÉ du coach : le scope tenant est `coachId` seul, sans `athleteId`. Un athlète qui
 * atteindrait ce service serait refusé par l'extension Prisma — mais par une ERREUR, pas un 403,
 * d'où le `@Roles([Role.COACH])` porté par le contrôleur.
 *
 * Aucun scheduler : « dû » se calcule à la lecture (`isReminderDue`, @cmv/shared), comme le « en
 * retard » d'une facture. Ce service ne fait donc que du CRUD ; c'est le centre de notifications
 * (#51) qui applique la dérivation temporelle.
 */
@Injectable()
export class ReminderService {
  constructor(@Inject(TENANT_PRISMA) private readonly db: TenantPrisma) {}

  /**
   * Les rappels du coach : ceux **à traiter** d'abord (le plus en retard en tête), puis les traités
   * (les plus récemment touchés en tête).
   *
   * DEUX requêtes plutôt qu'un `orderBy` unique, et c'est le point important : avec une seule liste
   * bornée, un coach ayant cent rappels traités verrait ses rappels À TRAITER tomber hors de la
   * borne — l'écran cacherait précisément ce qu'il existe pour montrer. Chaque segment a donc sa
   * borne, et son ordre naturel : l'urgence pour l'un, la récence pour l'autre.
   */
  async list(): Promise<ReminderDto[]> {
    const [pending, handled] = await Promise.all([
      this.db.reminder.findMany({
        where: { status: ReminderStatus.PENDING },
        orderBy: { dueAt: "asc" },
        take: REMINDER_PAGE_SIZE,
      }),
      this.db.reminder.findMany({
        where: { status: { not: ReminderStatus.PENDING } },
        orderBy: { updatedAt: "desc" },
        take: REMINDER_PAGE_SIZE,
      }),
    ]);

    const reminders = [...pending, ...handled];
    if (reminders.length === 0) return [];

    const labels = await this.resolveTargetLabels(reminders);
    return reminders.map((reminder) => toReminderDto(reminder, labels));
  }

  /**
   * Les deux compteurs d'une tuile de tableau de bord, sans charger une seule ligne : deux `count`
   * sur l'index, là où `list()` renverrait jusqu'à 200 rappels pour qu'on en mesure deux.
   *
   * **`dueCount` ne filtre PAS sur `readAt`**, contrairement à `countDueUnread` qui alimente le badge
   * de la cloche. La différence est le cœur de la méthode : `readAt` dit « vu dans le centre »,
   * `status` dit « traité ». Compter les dus NON LUS viderait la tuile « à traiter » dès que le coach
   * a déroulé ses notifications, sans qu'il ait rien fait.
   *
   * Les deux nombres s'emboîtent (`dueCount <= pendingCount`) : un rappel dû est un rappel à traiter
   * dont l'échéance est passée. Les afficher côte à côte montrerait deux fois les mêmes rappels.
   */
  async summary(now: Date): Promise<ReminderSummaryDto> {
    const [dueCount, pendingCount] = await Promise.all([
      this.db.reminder.count({ where: dueWhere(now) }),
      this.db.reminder.count({ where: { status: ReminderStatus.PENDING } }),
    ]);
    return { dueCount, pendingCount };
  }

  /**
   * Crée un rappel sur un cycle ou une facture. La cible est vérifiée **possédée** avant écriture :
   * `entityId` n'a pas de clé étrangère, et une FK n'imposerait de toute façon pas le tenant
   * (piège n°3 du scope automatique). Sans ce contrôle, un coach poserait un rappel sur le cycle
   * d'un autre — et en lirait le titre dans `targetLabel`.
   */
  async create(input: CreateReminderInput): Promise<ReminderDto> {
    await this.assertTargetOwned(input.entityType, input.entityId);

    // coachId injecté par le tenancy layer (extension Prisma) — d'où le cast.
    const created = await this.db.reminder.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        dueAt: new Date(input.dueAt),
        note: input.note,
        status: ReminderStatus.PENDING,
      } satisfies Omit<
        Prisma.ReminderUncheckedCreateInput,
        "coachId"
      > as Prisma.ReminderUncheckedCreateInput,
    });
    return this.toDto(created);
  }

  /**
   * Marquage fait / abandonné, et retour en arrière — un simple toggle, réversible dans les deux
   * sens (comme le statut payé/impayé d'une facture) : rouvrir un rappel marqué fait par erreur ne
   * doit pas obliger à en recréer un.
   *
   * Idempotent : remarquer le même statut ne réécrit rien, donc ne redate pas `updatedAt` — sans
   * quoi un rappel traité remonterait en tête de l'historique à chaque clic répété.
   *
   * `readAt` n'est PAS touché : il dit « vu dans le centre », pas « traité ». Rouvrir un rappel déjà
   * vu ne le rend pas neuf ; il redevient simplement dû.
   */
  async updateStatus(id: string, input: UpdateReminderStatusInput): Promise<ReminderDto> {
    const reminder = await this.getOwnedOrThrow(id);
    if (reminder.status === input.status) return this.toDto(reminder);

    const updated = await this.db.reminder.update({
      where: { id },
      data: { status: input.status },
    });
    return this.toDto(updated);
  }

  /**
   * Purge les rappels visant un cycle et sa facture, DANS la transaction de suppression du cycle
   * (appelé par `PlanService.delete`).
   *
   * C'est ici que le raisonnement de la dette N-4 ne suffit plus. Pour une notification, la cible
   * disparue est théorique — « aucun flux MVP n'y mène » (#102). Pour un rappel, le flux existe :
   * un cycle DRAFT se supprime, et #45 propose justement de poser un rappel dessus. On ne laisse
   * donc pas la ligne pointer vers le vide, on la supprime avec sa cible.
   *
   * La facture est incluse parce qu'elle part en cascade avec le cycle (`Invoice.planId`, Cascade) :
   * un rappel « facture en retard » survivrait à une facture qui n'existe plus.
   */
  async purgeForPlan(tx: TenantTx, planId: string): Promise<void> {
    const invoice = await tx.invoice.findFirst({ where: { planId }, select: { id: true } });
    const targets: Prisma.ReminderWhereInput[] = [
      { entityType: ReminderEntityType.PLAN, entityId: planId },
    ];
    if (invoice != null) {
      targets.push({ entityType: ReminderEntityType.INVOICE, entityId: invoice.id });
    }
    await tx.reminder.deleteMany({ where: { OR: targets } });
  }

  // ── Rappels DUS, pour le centre de notifications (#51) ───────────────────────
  //
  // Ces méthodes sont appelées par `NotificationFeedService`, jamais par un contrôleur (à
  // l'exception de `summary`, ci-dessus) : elles gardent la table `reminder` accessible depuis un
  // seul module. Toutes s'appuient sur `dueWhere` (bas de fichier) pour le prédicat « dû ».

  /**
   * Les rappels dus du coach, le plus récemment échu en tête. `limit` est passé par l'appelant : la
   * borne est celle du CENTRE (une entrée de rappel y concourt avec les notifications), pas celle de
   * l'écran « mes rappels ».
   */
  async listDue(now: Date, limit: number): Promise<Reminder[]> {
    return this.db.reminder.findMany({
      where: dueWhere(now),
      orderBy: { dueAt: "desc" },
      take: limit,
    });
  }

  // Alimente le badge, aux côtés des notifications non lues. Le `readAt: null` est ce qui distingue
  // ce compteur de celui de `summary` : ici on compte ce qui n'a pas été VU, là ce qui reste à FAIRE.
  async countDueUnread(now: Date): Promise<number> {
    return this.db.reminder.count({
      where: { ...dueWhere(now), readAt: null },
    });
  }

  /**
   * Marque un rappel « vu dans le centre ». `null` si le rappel n'existe pas ou n'est pas au coach
   * courant (le scope s'en charge) — l'appelant en fait un 404, parce que du point de vue du client
   * c'est une entrée du centre qui est introuvable, pas un rappel.
   *
   * Non redaté s'il était déjà vu : rouvrir une entrée déjà lue ne doit pas la faire remonter comme
   * fraîche, exactement comme pour une notification persistée.
   */
  async markDueRead(id: string): Promise<Reminder | null> {
    const reminder = await this.db.reminder.findFirst({ where: { id } });
    if (reminder == null) return null;
    if (reminder.readAt != null) return reminder;

    return this.db.reminder.update({ where: { id }, data: { readAt: new Date() } });
  }

  /**
   * « Tout marquer comme lu » côté rappels. Ne touche QUE les rappels dus : marquer un rappel encore
   * à venir serait un mensonge (il n'était pas affiché), et surtout ça éteindrait son badge par
   * avance — le jour de son échéance, il n'annoncerait plus rien.
   */
  async markAllDueRead(now: Date): Promise<void> {
    await this.db.reminder.updateMany({
      where: { ...dueWhere(now), readAt: null },
      data: { readAt: new Date() },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Un rappel du coach courant, ou 404 (scope coachId appliqué par le tenancy layer).
  private async getOwnedOrThrow(id: string): Promise<Reminder> {
    const reminder = await this.db.reminder.findFirst({ where: { id } });
    if (reminder == null) {
      throw new NotFoundException("Rappel introuvable");
    }
    return reminder;
  }

  /**
   * La cible existe-t-elle, et appartient-elle au coach courant ? Le 400 (plutôt qu'un 404) dit la
   * vérité du point de vue du client : c'est le corps de sa requête qui est invalide — même
   * traitement que `SessionService.assertExercisesOwned`. Le message ne distingue PAS « absente »
   * de « à quelqu'un d'autre » : ce serait dire à un coach qu'un id existe ailleurs.
   *
   * Une facture DRAFT est une cible valide : un rappel posé dans le builder reste légitime, et la
   * purge le nettoie si le cycle est supprimé.
   */
  private async assertTargetOwned(entityType: ReminderEntityType, entityId: string): Promise<void> {
    const count =
      entityType === ReminderEntityType.PLAN
        ? await this.db.plan.count({ where: { id: entityId } })
        : await this.db.invoice.count({ where: { id: entityId } });

    if (count === 0) {
      throw new BadRequestException("Cible du rappel introuvable");
    }
  }

  /**
   * De quoi nommer chaque cible, en DEUX requêtes scopées — une par modèle visé. Jamais un `include`
   * imbriqué : l'extension n'intercepte que le premier niveau, une jointure lirait donc les cycles
   * et les factures SANS filtre tenant (piège n°2 du scope automatique).
   *
   * Les libellés sont BRUTS (titre du cycle, période « YYYY-MM » de la facture) : c'est le client
   * qui compose et traduit. Une cible absente de la map = cible disparue → `null` dans le DTO.
   */
  private async resolveTargetLabels(reminders: Reminder[]): Promise<ReminderTargetLabels> {
    const idsFor = (entityType: ReminderEntityType) =>
      reminders.filter((r) => r.entityType === entityType).map((r) => r.entityId);

    const planIds = idsFor(ReminderEntityType.PLAN);
    const invoiceIds = idsFor(ReminderEntityType.INVOICE);

    const [plans, invoices] = await Promise.all([
      planIds.length === 0
        ? []
        : this.db.plan.findMany({
            where: { id: { in: planIds } },
            select: { id: true, title: true },
          }),
      invoiceIds.length === 0
        ? []
        : this.db.invoice.findMany({
            where: { id: { in: invoiceIds } },
            select: { id: true, period: true },
          }),
    ]);

    return {
      [ReminderEntityType.PLAN]: new Map(plans.map((plan) => [plan.id, plan.title])),
      [ReminderEntityType.INVOICE]: new Map(
        invoices.map((invoice) => [invoice.id, invoice.period]),
      ),
    };
  }

  private async toDto(reminder: Reminder): Promise<ReminderDto> {
    return toReminderDto(reminder, await this.resolveTargetLabels([reminder]));
  }
}

/**
 * « Dû » en SQL — la moitié serveur d'`isReminderDue` (@cmv/shared), qui l'applique en mémoire.
 *
 * Appliqué en SQL et non par `isReminderDue` : filtrer en mémoire imposerait de charger tous les
 * rappels à traiter pour en retenir trois, en renonçant à l'index.
 */
function dueWhere(now: Date): Prisma.ReminderWhereInput {
  return { status: ReminderStatus.PENDING, dueAt: { lte: now } };
}
