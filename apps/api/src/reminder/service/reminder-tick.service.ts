import type { ReminderTickResultDto } from "@cmv/shared";
import {
  InvoiceStatus,
  PlanStatus,
  planEndDate,
  ReminderEntityType,
  ReminderReason,
  ReminderStatus,
  Role,
} from "@cmv/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { NotificationService } from "../../notification/notification.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { TENANT_CLS_KEY, type TenantContext } from "../../tenancy/tenant-context.type";
import { shiftDbDate, toDbDate, toIsoDate } from "../../util/date.util";

/**
 * Combien de jours AVANT la fin d'un cycle le rappel de renouvellement devient dû. Une semaine :
 * assez tôt pour composer la suite, assez tard pour que la question soit d'actualité.
 */
const PLAN_ENDING_LEAD_DAYS = 7;

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
 * Les conversions passent par `util/date.util` (`toDbDate`, `shiftDbDate`, `toIsoDate`), qui fait
 * déjà le pont entre les colonnes `@db.Date` et les dates civiles de `@cmv/shared` : `Plan.startDate`
 * et `Invoice.dueDate` sont des dates SANS heure, ancrées à minuit UTC parce que l'API n'a aucun
 * fuseau — c'est le client qui les affiche dans le sien.
 */
@Injectable()
export class ReminderTickService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly cls: ClsService,
    private readonly notifications: NotificationService,
  ) {}

  async run(now: Date): Promise<ReminderTickResultDto> {
    const coaches = await this.prisma.user.findMany({
      where: { role: Role.COACH },
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

    return { scannedCoaches: coaches.length, createdReminders, pushedReminders };
  }

  /** Un contexte tenant pour CE coach : tout ce qui suit passe par l'extension, filtré et injecté. */
  private runForCoach(coachId: string, now: Date): Promise<{ created: number; pushed: number }> {
    // Acteur SYNTHÉTIQUE : aucune session derrière, donc aucune capacité à lire — on les pose.
    // `exercised: "coach"` parce que le tick n'agit qu'à ce titre : les rappels sont un outil privé
    // du coach (seul modèle sans scope athlète, cf. TENANT_SCOPES).
    const actor: TenantContext = {
      userId: coachId,
      role: Role.COACH,
      capabilities: { isCoach: true, isAthlete: false },
      exercised: "coach",
    };

    // `run` + `set`, exactement comme `TenancyInterceptor` le fait pour une requête HTTP : c'est le
    // MÊME contrat, avec un acteur choisi au lieu d'un acteur résolu depuis une session.
    return this.cls.run(async () => {
      this.cls.set(TENANT_CLS_KEY, actor);
      // La génération d'abord : un rappel créé par CE tick et déjà dû doit partir en push dans la
      // foulée, pas au tick suivant.
      const created = await this.generate(now);
      const pushed = await this.pushDue(coachId, now);
      return { created, pushed };
    });
  }

  private async generate(now: Date): Promise<number> {
    const candidates = [
      ...(await this.planEndingRows(now)),
      ...(await this.invoiceOverdueRows(now)),
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
   */
  private async pushDue(coachId: string, now: Date): Promise<number> {
    const due = await this.db.reminder.findMany({
      where: { status: ReminderStatus.PENDING, dueAt: { lte: now }, pushedAt: null },
      select: { id: true, note: true, reason: true },
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
      return label == null ? [] : [{ id: reminder.id, label }];
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
      where: { id: { in: pushable.map((reminder) => reminder.id) } },
      data: { pushedAt: now },
    });
    return pushable.length;
  }

  /**
   * « Le cycle se termine » — sur les cycles DIFFUSÉS dont la dernière semaine approche.
   *
   * L'échéance du rappel est la fin du cycle **moins une semaine**, donc une valeur dérivée du
   * cycle : le rappel se range dans le centre au moment où il commence à compter, et deux ticks
   * successifs calculent la même. Ne sont retenus que ceux dont cette échéance est déjà atteinte —
   * générer plus tôt remplirait la liste de rappels qui ne veulent encore rien dire.
   *
   * Les cycles DRAFT sont ignorés : un cycle jamais diffusé n'a pas de renouvellement à proposer.
   */
  private async planEndingRows(now: Date): Promise<ReminderSeed[]> {
    /**
     * DEUX requêtes scopées plutôt qu'un `_count` imbriqué : l'extension n'intercepte que le
     * premier niveau, un compteur de relation se lirait donc SANS filtre tenant (piège n°2 du scope
     * automatique). Le `groupBy` sur `PlanWeek`, lui, passe par l'extension comme le reste — même
     * précaution que `ReminderService.resolveTargetLabels`.
     */
    const [plans, weekCounts] = await Promise.all([
      this.db.plan.findMany({
        where: { status: PlanStatus.PUBLISHED },
        select: { id: true, startDate: true },
      }),
      this.db.planWeek.groupBy({ by: ["planId"], _count: { _all: true } }),
    ]);

    const weeksByPlan = new Map(weekCounts.map((row) => [row.planId, row._count._all]));

    return plans.flatMap((plan) => {
      const endDate = planEndDate(toIsoDate(plan.startDate), weeksByPlan.get(plan.id) ?? 0);
      // `null` = cycle sans semaine, ou date illisible. On ne devine pas une fin de cycle.
      if (endDate == null) return [];

      const dueAt = shiftDbDate(toDbDate(endDate), -PLAN_ENDING_LEAD_DAYS);
      if (dueAt > now) return [];

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
  private async invoiceOverdueRows(now: Date): Promise<ReminderSeed[]> {
    const invoices = await this.db.invoice.findMany({
      where: { status: InvoiceStatus.PENDING },
      select: { id: true, dueDate: true },
    });

    return invoices.flatMap((invoice) => {
      const dueAt = shiftDbDate(invoice.dueDate, 1);
      // La facture n'est pas encore en retard : `resolveInvoiceState` dirait `PENDING`, pas
      // `OVERDUE`. Les deux moitiés doivent s'accorder, sinon la liste des rappels annoncerait un
      // retard que l'écran des factures ne montre pas. `now` vient de l'appelant, jamais de
      // `new Date()` ici : le service reste testable sans horloge, comme `ReminderService.summary`.
      if (dueAt > now) return [];

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

// Une ligne à insérer, SANS son tenant : `coachId` est ajouté par l'extension Prisma. Le type le dit
// plutôt que de laisser un `as` isolé s'en charger — c'est la même précaution que dans
// `ReminderService.create`.
type ReminderSeed = Omit<Prisma.ReminderCreateManyInput, "coachId">;
