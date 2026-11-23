import type { ReminderTickResultDto } from "@cmv/shared";
import {
  InvoiceStatus,
  PlanStatus,
  planEndDate,
  ReminderEntityType,
  ReminderReason,
  ReminderStatus,
} from "@cmv/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { ownedBy } from "../../access/access.mapper";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { NotificationService } from "../../notification/notification.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { runAsCoach } from "../../tenancy/tenant-context.type";
import { shiftDbDate, startOfProductDay, toDbDate, toIsoDate } from "../../util/date.util";
import { retentionCutoff } from "../../util/retention.util";

/**
 * Combien de jours AVANT la fin d'un cycle le rappel de renouvellement devient dû. Une semaine :
 * assez tôt pour composer la suite, assez tard pour que la question soit d'actualité.
 */
const PLAN_ENDING_LEAD_DAYS = 7;

/**
 * Jusqu'où, en arrière, un rappel peut encore naître (#107). Il se compte depuis le plus tardif de
 * deux instants : l'échéance dérivée, ou l'émission de la cible (diffusion du cycle, émission de la
 * facture). Au-delà, le tick l'ignore : un cycle fini depuis des mois n'a plus de renouvellement à
 * proposer.
 *
 * L'émission compte, parce qu'une facture de rattrapage peut naître déjà échue depuis longtemps :
 * l'écran des factures la dit en retard dès son émission, la liste des rappels doit le dire aussi.
 *
 * C'est surtout ce qui rend la purge des rappels traités sans danger. L'index unique empêche la
 * régénération tant que la ligne existe ; une fois purgée, plus rien ne l'empêcherait, et un cycle
 * diffusé reste candidat pour toujours (`PlanStatus` n'a pas d'état « terminé »). Or les deux
 * instants précèdent la création du rappel — l'échéance est atteinte, la cible émise —, et une
 * ligne purgée n'a plus bougé depuis la rétention : tant que la fenêtre est plus courte que la
 * rétention, ils sont hors fenêtre. L'émission ne bouge pas : `publishedAt` et `issuedAt` ne sont
 * posés qu'une fois.
 *
 * L'échéance, elle, peut bouger : un cycle diffusé qu'on allonge, une facture dont on reporte
 * l'échéance. Si le rappel traité a déjà été purgé, la nouvelle échéance en fait naître un autre —
 * voulu : c'est une nouvelle fin, ou un nouveau retard. Tant que la ligne existe, l'index unique
 * l'empêche encore ; la différence tient au délai de rétention, et elle est assumée.
 */
export const REMINDER_GENERATION_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * Libellé FRANÇAIS d'un motif, pour le corps du push — et uniquement pour lui.
 *
 * C'est l'exception assumée du push, déjà consignée en #48 : il n'y a aucun client pour traduire au
 * moment de la livraison, le texte part donc rendu et en français. Partout ailleurs — écran des
 * rappels, centre de notifications — c'est `REMINDER_REASON_KEY` qui voyage, et le rendu se fait
 * côté client. Le jour du catalogue serveur (#63), cette table le rejoindra.
 */
const REASON_PUSH_LABEL: Record<ReminderReason, string> = {
  [ReminderReason.PLAN_ENDING]: "Un cycle se termine — proposer le renouvellement.",
  [ReminderReason.INVOICE_OVERDUE]: "Une facture est en retard — relancer.",
};

/**
 * Génération automatique des rappels (#47) — le « scheduler », déclenché de l'extérieur.
 *
 * ## Le scope tenant hors requête
 *
 * Un tick n'a ni session ni acteur courant, là où l'extension Prisma **refuse** (fail closed) tout
 * modèle sans scope. On ne la contourne pas : **on lui donne un acteur**. Le balayage ouvre un
 * contexte CLS par coach (`cls.run` + `set`), si bien que chaque lecture reste filtrée et que le
 * `coachId` des rappels créés est **injecté par l'extension**, jamais écrit par ce service. Un bug
 * dans une requête de génération ne peut donc pas franchir la frontière d'un coach.
 *
 * Une seule lecture reste hors scope, et elle est nommée : **la liste des coachs**. `User` n'est pas
 * dans `TENANT_SCOPES` — le client tenant la refuserait par construction — d'où le `PrismaService`
 * de base, précédent établi par `UserDirectoryService` et `NotificationService`.
 *
 * ## L'idempotence n'est pas dans ce code
 *
 * Elle est dans l'index unique `(coachId, entityType, entityId, reason)` et dans `skipDuplicates`.
 * C'est délibéré : un tick toutes les cinq minutes rejouerait sinon les mêmes insertions, et une
 * vérification préalable en JavaScript laisserait une fenêtre entre la lecture et l'écriture. La
 * base tranche, le service n'a rien à retenir d'un passage à l'autre.
 *
 * ## Les échéances ne dépendent pas de l'heure du cron
 *
 * `dueAt` est **dérivé de la donnée** (fin du cycle moins une semaine, lendemain de l'échéance de
 * facture), jamais de `now`. Un tick en retard d'une heure — ou rejoué — produit donc exactement les
 * mêmes rappels : c'est ce qui rend la granularité du déclencheur externe sans conséquence.
 *
 * ## Les rappels restent au propriétaire du cycle (#607)
 *
 * Un Coach lit aussi les cycles qu'on lui ouvre, et leurs factures : le scope seul lui en ferait
 * générer les rappels. Chaque lecture de génération se borne donc à SES cycles (`coachId`) — c'est
 * le propriétaire qui renouvelle et qui relance. Et quand un autre Coach règle une facture, le
 * rappel du propriétaire se clôt au passage suivant (`closeSettledOverdue`).
 *
 * ## Une fenêtre, pas tout l'historique (#107)
 *
 * Seule une cible échue ou émise dans les `REMINDER_GENERATION_WINDOW_DAYS` derniers jours engendre
 * un rappel. Une panne du tick plus longue que la fenêtre en perdrait donc : elle serait bruyante
 * bien avant (le job rouge à chaque passage).
 *
 * Les conversions passent par `util/date.util` (`toDbDate`, `shiftDbDate`, `toIsoDate`), qui fait
 * déjà le pont entre les colonnes `@db.Date` et les dates civiles de `@cmv/shared` : `Plan.startDate`
 * et `Invoice.dueDate` sont des dates SANS heure, ancrées à minuit UTC en base.
 *
 * Une échéance, elle, est un INSTANT : le jour où elle tombe commence à minuit **à Paris**
 * (`startOfProductDay`, « Tranché en #321 »), pas à minuit UTC. Sans quoi le rappel « facture en
 * retard » ne devenait dû qu'à 1 h ou 2 h du matin, quand l'écran des factures — qui compte dans le
 * fuseau du lecteur — l'annonçait déjà en retard depuis minuit.
 */
@Injectable()
export class ReminderTickService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly cls: ClsService,
    private readonly notifications: NotificationService,
  ) {}

  async run(now: Date): Promise<Omit<ReminderTickResultDto, "purgedObjects">> {
    // `isCoach` et non `role` : depuis #9, un compte peut coacher SANS avoir COACH pour persona
    // (il porte les deux capacités et atterrit côté athlète). Filtrer sur le rôle l'aurait laissé
    // hors du balayage — pas d'erreur, juste des rappels qui n'arrivent plus.
    const coaches = await this.prisma.user.findMany({
      where: { isCoach: true },
      select: { id: true },
    });

    let createdReminders = 0;
    let pushedReminders = 0;
    // Séquentiel, et non `Promise.all` : chaque itération pose un contexte CLS distinct, et les
    // paralléliser ferait courir N balayages sur la même connexion pour un gain nul à l'échelle du
    // MVP. Le jour où ça compte, c'est le nombre de coachs par tick qu'on bornera, pas ceci.
    for (const coach of coaches) {
      const result = await this.runForCoach(coach.id, now);
      createdReminders += result.created;
      pushedReminders += result.pushed;
    }

    // La purge dans une SECONDE passe, une fois les rappels de TOUS les coachs générés et poussés :
    // une suppression qui lève chez l'un ne doit priver aucun autre de ses rappels. Le tick rend
    // alors une erreur — le job rouge —, mais après que tout ce qui comptait est parti.
    let purgedReminders = 0;
    for (const coach of coaches) {
      purgedReminders += await runAsCoach(this.cls, coach.id, () => this.purgeHandled(now));
    }

    return { scannedCoaches: coaches.length, createdReminders, pushedReminders, purgedReminders };
  }

  /**
   * Un contexte tenant pour CE coach (`runAsCoach`) : tout ce qui suit passe par l'extension,
   * filtré et injecté. Acteur SYNTHÉTIQUE, à titre de coach seulement : les rappels sont un outil
   * privé du coach (seul modèle sans scope athlète, cf. TENANT_SCOPES).
   */
  private runForCoach(coachId: string, now: Date): Promise<{ created: number; pushed: number }> {
    return runAsCoach(this.cls, coachId, async () => {
      // La clôture d'abord : un rappel dont la facture est réglée ne doit plus partir en push.
      await this.closeSettledOverdue();
      // La génération ensuite : un rappel créé par CE tick et déjà dû doit partir en push dans la
      // foulée, pas au tick suivant.
      const created = await this.generate(coachId, now);
      const pushed = await this.pushDue(coachId, now);
      return { created, pushed };
    });
  }

  private async generate(coachId: string, now: Date): Promise<number> {
    const candidates = [
      ...(await this.planEndingRows(coachId, now)),
      ...(await this.invoiceOverdueRows(coachId, now)),
    ];
    if (candidates.length === 0) return 0;

    // `coachId` n'est PAS dans les données : l'extension l'injecte (`scopeData`). C'est la
    // garantie que ce service ne peut pas écrire chez un autre coach, même en se trompant.
    const { count } = await this.db.reminder.createMany({
      data: candidates as Prisma.ReminderCreateManyInput[],
      skipDuplicates: true,
    });
    return count;
  }

  /**
   * Clôt le rappel « facture en retard » d'une facture que le coach ne doit plus relancer (#607).
   *
   * Quand il la règle lui-même, `ReminderService.closeInvoiceOverdue` le clôt dans la transaction.
   * Mais un Coach à qui le cycle est ouvert en Écriture peut la régler aussi : sa transaction ne
   * voit que SES rappels, et celui du propriétaire resterait ouvert. On ne l'écrit pas depuis la
   * transaction de l'autre par le client de base : le tick du propriétaire le rattrape, sous son
   * propre acteur, et la frontière du coach n'est franchie par aucune écriture.
   *
   * Même règle que la clôture en transaction : le rappel GÉNÉRÉ seul, et `PENDING` seul.
   */
  private async closeSettledOverdue(): Promise<void> {
    const overdue = {
      entityType: ReminderEntityType.INVOICE,
      reason: ReminderReason.INVOICE_OVERDUE,
      status: ReminderStatus.PENDING,
    };
    const reminders = await this.db.reminder.findMany({
      where: overdue,
      select: { entityId: true },
    });
    if (reminders.length === 0) return;

    const settled = await this.db.invoice.findMany({
      where: {
        id: { in: reminders.map((reminder) => reminder.entityId) },
        status: { not: InvoiceStatus.PENDING },
      },
      select: { id: true },
    });
    if (settled.length === 0) return;

    await this.db.reminder.updateMany({
      where: { ...overdue, entityId: { in: settled.map((invoice) => invoice.id) } },
      data: { status: ReminderStatus.DONE },
    });
  }

  /**
   * Le push à l'échéance (#47) — la dette **R-1**. Sans lui, un rappel qui devient dû n'émettait
   * aucun signal : il n'apparaissait qu'au prochain chargement du centre.
   *
   * `pushedAt: null` est ce qui rend le tick idempotent : la sélection ne voit que ce qui n'est pas
   * encore parti, deux passages rapprochés ne poussent donc pas deux fois, et un tick manqué
   * rattrape au suivant. Rien n'est persisté côté notifications — l'entrée du centre reste
   * CALCULÉE, sinon le rappel apparaîtrait en double (cf. `NotificationService.notifyReminderDue`).
   *
   * L'estampille est posée APRÈS l'envoi, en un seul `updateMany`. Le compromis se lit dans cet
   * ordre : un arrêt brutal entre les deux fait repartir le push au tick suivant. Un doublon vaut
   * mieux qu'un rappel silencieux — et `push()` ne lève jamais (règle 2 de `NotificationService`),
   * donc le cas ne peut venir que d'un process tué.
   *
   * L'estampille ne vaut que pour l'échéance LUE (#295) : le coach peut repousser un rappel pendant
   * que les envois défilent, et son report remet `pushedAt` à `null`. Estampiller par `id` seul
   * marquerait alors la NOUVELLE échéance comme poussée sans que rien ne soit parti pour elle — le
   * rappel resterait muet le jour venu. Le couple `(id, dueAt)` laisse ce report intact.
   */
  private async pushDue(coachId: string, now: Date): Promise<number> {
    const due = await this.db.reminder.findMany({
      where: { status: ReminderStatus.PENDING, dueAt: { lte: now }, pushedAt: null },
      select: { id: true, dueAt: true, note: true, reason: true },
    });
    /**
     * La note du coach l'emporte sur le motif — même précédence que `reminderLabel`, appliquée ici
     * au texte français du push plutôt qu'à une clé i18n.
     *
     * Un rappel sans note NI motif est écarté, pas rattrapé par un libellé par défaut : l'API
     * garantit qu'au moins l'un des deux existe, et inventer un texte ferait pousser une phrase que
     * personne n'a écrite (règle « nullable, pas de repli silencieux »). Il reste alors non poussé,
     * donc visible comme anomalie plutôt que déguisé en notification plausible.
     */
    const pushable = due.flatMap((reminder) => {
      const label = reminder.note ?? (reminder.reason && REASON_PUSH_LABEL[reminder.reason]);
      return label == null ? [] : [{ id: reminder.id, dueAt: reminder.dueAt, label }];
    });
    if (pushable.length === 0) return 0;

    for (const reminder of pushable) {
      await this.notifications.notifyReminderDue({
        coachId,
        reminderId: reminder.id,
        label: reminder.label,
      });
    }

    await this.db.reminder.updateMany({
      where: { OR: pushable.map(({ id, dueAt }) => ({ id, dueAt })) },
      data: { pushedAt: now },
    });
    return pushable.length;
  }

  /**
   * La rétention des rappels traités (#107, dette R-5) : un rappel fait ou écarté que personne n'a
   * retouché depuis `HANDLED_RETENTION_DAYS` est supprimé. `DISMISSED` étant la suppression douce,
   * c'est ici que le rappel écarté quitte vraiment la base.
   *
   * - **`PENDING` jamais**, quelle que soit son ancienneté : un rappel en retard depuis six mois
   *   reste un rappel en retard. Les statuts traités sont NOMMÉS plutôt que « tout sauf PENDING » :
   *   un statut ajouté demain ne sera pas purgé sans qu'on l'ait décidé.
   * - **`updatedAt`, faute de date de traitement** : c'est le dernier geste du coach (statut, note,
   *   lecture). Toute retouche après coup repousse donc la purge — le sens sûr.
   * - **Par le client scopé**, dans le contexte de CE coach : la purge ne peut pas franchir sa
   *   frontière, et n'a demandé aucune exception au scope.
   * - **Sans renaissance** : le rappel généré, une fois purgé, n'est plus protégé par l'index
   *   unique ; c'est la fenêtre de génération, plus courte que la rétention, qui l'empêche de
   *   revenir (`REMINDER_GENERATION_WINDOW_DAYS`).
   */
  private async purgeHandled(now: Date): Promise<number> {
    const { count } = await this.db.reminder.deleteMany({
      where: {
        status: { in: [ReminderStatus.DONE, ReminderStatus.DISMISSED] },
        updatedAt: { lt: retentionCutoff(now) },
      },
    });
    return count;
  }

  /**
   * « Le cycle se termine » — sur les cycles DIFFUSÉS dont la dernière semaine approche.
   *
   * L'échéance du rappel est la fin du cycle **moins une semaine**, donc une valeur dérivée du
   * cycle : le rappel se range dans le centre au moment où il commence à compter, et deux ticks
   * successifs calculent la même. Ne sont retenus que ceux dont cette échéance est déjà atteinte —
   * générer plus tôt remplirait la liste de rappels qui ne veulent encore rien dire. Et seulement
   * si elle tombe dans la fenêtre de génération : sans elle, tout cycle diffusé resterait candidat
   * à vie (#107).
   *
   * Les cycles DRAFT sont ignorés : un cycle jamais diffusé n'a pas de renouvellement à proposer.
   */
  private async planEndingRows(coachId: string, now: Date): Promise<ReminderSeed[]> {
    /**
     * DEUX requêtes scopées plutôt qu'un `_count` imbriqué : l'extension n'intercepte que le
     * premier niveau, un compteur de relation se lirait donc SANS filtre tenant (piège n°2 du scope
     * automatique). Le `groupBy` sur `PlanWeek`, lui, passe par l'extension comme le reste — même
     * précaution que `ReminderService.resolveTargetLabels`.
     */
    const [plans, weekCounts] = await Promise.all([
      this.db.plan.findMany({
        where: { ...ownedBy(coachId), status: PlanStatus.PUBLISHED },
        select: { id: true, startDate: true, publishedAt: true },
      }),
      this.db.planWeek.groupBy({ by: ["planId"], where: ownedBy(coachId), _count: { _all: true } }),
    ]);

    const weeksByPlan = new Map(weekCounts.map((row) => [row.planId, row._count._all]));

    return plans.flatMap((plan) => {
      const endDate = planEndDate(toIsoDate(plan.startDate), weeksByPlan.get(plan.id) ?? 0);
      // `null` = cycle sans semaine, ou date illisible. On ne devine pas une fin de cycle.
      if (endDate == null) return [];

      const dueAt = startOfProductDay(shiftDbDate(toDbDate(endDate), -PLAN_ENDING_LEAD_DAYS));
      if (!inGenerationWindow(dueAt, plan.publishedAt, now)) return [];

      return [
        {
          entityType: ReminderEntityType.PLAN,
          entityId: plan.id,
          reason: ReminderReason.PLAN_ENDING,
          dueAt,
          note: null,
          status: ReminderStatus.PENDING,
        },
      ];
    });
  }

  /**
   * « Facture en retard » — sur les factures ÉMISES dont l'échéance est dépassée.
   *
   * `OVERDUE` n'est pas un statut stocké (cf. `resolveInvoiceState`) : c'est une facture `PENDING`
   * dont la `dueDate` est passée. L'échéance du rappel est le **lendemain** de celle de la facture,
   * l'instant exact où elle bascule en retard — encore une fois dérivée de la donnée, pas de `now`.
   *
   * Les brouillons et les factures annulées sont hors du lot : rien à relancer.
   */
  private async invoiceOverdueRows(coachId: string, now: Date): Promise<ReminderSeed[]> {
    const invoices = await this.db.invoice.findMany({
      // Un athlète qui a supprimé son compte ne se relance plus (#256) : le statut reste au coach.
      where: { ...ownedBy(coachId), status: InvoiceStatus.PENDING, erasedAthleteName: null },
      select: { id: true, dueDate: true, issuedAt: true },
    });

    return invoices.flatMap((invoice) => {
      const dueAt = startOfProductDay(shiftDbDate(invoice.dueDate, 1));
      // La facture n'est pas encore en retard : `resolveInvoiceState` dirait `PENDING`, pas
      // `OVERDUE`. Les deux moitiés doivent s'accorder, sinon la liste des rappels annoncerait un
      // retard que l'écran des factures ne montre pas. `now` vient de l'appelant, jamais de
      // `new Date()` ici : le service reste testable sans horloge, comme `ReminderService.summary`.
      // Échue ET émise depuis plus longtemps que la fenêtre : on ne relance plus (#107).
      if (!inGenerationWindow(dueAt, invoice.issuedAt, now)) return [];

      return [
        {
          entityType: ReminderEntityType.INVOICE,
          entityId: invoice.id,
          reason: ReminderReason.INVOICE_OVERDUE,
          dueAt,
          note: null,
          status: ReminderStatus.PENDING,
        },
      ];
    });
  }
}

/**
 * L'échéance est atteinte, et elle ou l'émission de la cible tombe dans la fenêtre de génération.
 * Bornes incluses. La fenêtre se compte en heures (30 × 24 h), pas en jours civils : un changement
 * d'heure la décale d'une heure, sans conséquence sur ce qu'elle protège.
 *
 * `issuedAt` à `null` (cible jamais émise, ou donnée d'avant le champ) : seule l'échéance compte.
 */
function inGenerationWindow(dueAt: Date, issuedAt: Date | null, now: Date): boolean {
  if (dueAt > now) return false;
  const oldest = now.getTime() - REMINDER_GENERATION_WINDOW_DAYS * DAY_MS;
  return Math.max(dueAt.getTime(), issuedAt?.getTime() ?? 0) >= oldest;
}

// Une ligne à insérer, SANS son tenant : `coachId` est ajouté par l'extension Prisma. Le type le dit
// plutôt que de laisser un `as` isolé s'en charger — c'est la même précaution que dans
// `ReminderService.create`.
type ReminderSeed = Omit<Prisma.ReminderCreateManyInput, "coachId">;
