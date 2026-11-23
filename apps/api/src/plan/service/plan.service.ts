import type {
  CoachOrganizationDto,
  CreatePlanInput,
  PlanDto,
  PlanSummaryDto,
  UpdatePlanInput,
  VersionQuery,
} from "@cmv/shared";
import { CoachAthleteStatus, daysBetweenIsoDates, PlanStatus, required } from "@cmv/shared";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Plan, PlanWeek, Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import {
  ACCESS_INCLUDE,
  type AccessContext,
  type AccessRow,
  toAccessView,
} from "../../access/access.mapper";
import { type AccessGesture, AccessService } from "../../access/service/access.service";
import { InvoiceService } from "../../invoice/service/invoice.service";
import { ReminderService } from "../../reminder/service/reminder.service";
import type { TenantPrisma, TenantTx } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { currentActor } from "../../tenancy/tenant-context.type";
import { toDbDate, toIsoDate } from "../../util/date.util";
import { assertFollowOngoing } from "../../util/follow-ended.util";
import { assertReadAtVersion, deleteAtVersion, writeAtVersion } from "../../util/stale-write.util";
import {
  COACH_PLAN_COUNTS_INCLUDE,
  COACH_PLAN_DETAIL_INCLUDE,
  type PlanAccess,
  toPlanDto,
  toPlanSummaryDto,
} from "../plan.mapper";
import { propagateAthlete } from "../plan.recipient";
import { touchWeeks, WEEK_NOT_FOUND } from "../plan-week.version";
import { createWeeks, shiftSessions } from "../plan-week.writer";
import { PlanAccessService, settledOrganizations } from "./plan-access.service";

/** Un cycle lu avec de quoi dire qui le possède, et ce que l'acteur peut en faire (#607). */
export type PlanWithAccess = Prisma.PlanGetPayload<{ include: typeof ACCESS_INCLUDE }>;

export const PLAN_NOT_FOUND = "Planification introuvable";

@Injectable()
export class PlanService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly invoices: InvoiceService,
    private readonly reminders: ReminderService,
    private readonly cls: ClsService,
    private readonly access: AccessService,
    private readonly planAccess: PlanAccessService,
  ) {}

  async create(input: CreatePlanInput): Promise<PlanDto> {
    // Sans destinataire (#144), il n'y a rien à valider : c'est un cycle qu'on prépare avant de
    // savoir pour qui, et `publish` réclamera l'athlète le moment venu.
    const athleteId = input.athleteId ?? null;
    let opened: string | null = null;
    if (athleteId != null) {
      await this.assertAthleteOwned(athleteId);
      // Né pour un athlète suivi via F, le cycle s'ouvre en Écriture aux autres Coachs de F (#607).
      opened = await this.planAccess.defaultOrganization(athleteId, new Set());
    }

    const plan = await this.db.$transaction(async (tx) => {
      // coachId injecté par le tenancy layer (extension Prisma) — d'où le cast.
      const created = await tx.plan.create({
        data: {
          athleteId,
          title: input.title,
          description: input.description ?? null,
          startDate: toDbDate(input.startDate),
        } satisfies Omit<
          Prisma.PlanUncheckedCreateInput,
          "coachId"
        > as Prisma.PlanUncheckedCreateInput,
      });
      await createWeeks(tx, created.id, athleteId, input.weeks, 1);
      await this.planAccess.grantDefault(tx, created.id, opened);
      return created;
    });

    return this.getDto(plan.id);
  }

  /**
   * Ses cycles, et ceux qu'on lui ouvre (#607) : un athlète suivi à plusieurs montre aussi ce que
   * l'autre Coach lui a écrit, avec son auteur (`coachName`) et le droit qu'on en a.
   */
  async list(): Promise<PlanSummaryDto[]> {
    const [plans, context] = await Promise.all([
      this.db.plan.findMany({
        include: COACH_PLAN_COUNTS_INCLUDE,
        orderBy: { startDate: "desc" },
      }),
      this.access.context(),
    ]);
    return plans.map((plan) => toPlanSummaryDto(plan, planAccessOf(plan, context)));
  }

  async get(id: string): Promise<PlanDto> {
    return this.getDto(id);
  }

  /** Les entreprises à qui le propriétaire peut ouvrir son cycle : le panneau des accès (#607). */
  async organizations(id: string): Promise<CoachOrganizationDto[]> {
    const { plan } = await this.getForOrThrow(id, "share");
    return this.planAccess.eligibleFor(plan);
  }

  /**
   * Déplacer la date de début décale le cycle ENTIER : les séances suivent leur semaine, sinon
   * elles sortiraient de la plage de celle-ci (invariant « une séance tombe dans sa semaine »).
   *
   * Tant que le cycle est un BROUILLON. Une fois diffusé, plus rien de ce qui le définit ne se
   * réécrit : ni son en-tête (`assertHeaderWritable`), ni son destinataire (`assertReassignable`).
   *
   * Sous la version lue (#604) : deux Coachs d'une même entreprise peuvent retoucher le même cycle,
   * et le second enregistrement n'efface plus le premier en silence — 409 `STALE_WRITE`.
   *
   * Changer de destinataire reste au propriétaire (#607) : c'est changer l'audience du cycle, les
   * Coachs qui peuvent le lire. Renvoyer le MÊME athlète n'en change rien, et passe en Écriture.
   * Affecté à un athlète suivi via F, le cycle s'ouvre à F en Écriture, sauf si F y est déjà
   * réglée — « Aucun » compris. Remplacé ou retiré, l'athlète emporte les droits ouverts pour lui
   * (`resetOpened`) : ni le suivant ni toute l'entreprise n'en héritent. Un brouillon qui n'avait
   * pas d'athlète garde les siens — son audience ne fait que se restreindre aux Coachs du nouveau.
   */
  async update(id: string, input: UpdatePlanInput): Promise<PlanDto> {
    const { plan, context } = await this.getForOrThrow(id, "write");
    const reassigned = input.athleteId !== undefined;
    const athleteChanged = reassigned && (input.athleteId ?? null) !== plan.athleteId;
    if (athleteChanged) {
      this.access.assertCan(toAccessView(plan, context), "reassign");
    }
    const audienceChanged = athleteChanged && plan.athleteId != null;
    const expected = new Date(input.expectedUpdatedAt);
    // Le premier refus : une saisie périmée n'a pas vu l'état qu'on jugerait ensuite — un cycle
    // diffusé entre-temps, un destinataire déjà changé. « Recharger » le lui montrera.
    assertReadAtVersion(plan.updatedAt, expected);
    // Avant toute lecture supplémentaire : le refus est certain, inutile d'aller interroger la
    // base pour le destinataire.
    assertHeaderWritable(plan, input);

    // Forme UNCHECKED : `athleteId` s'écrit en scalaire, comme partout ailleurs sur cette chaîne
    // dénormalisée. La forme relationnelle demanderait un `connect`/`disconnect` là où le reste
    // du module raisonne en identifiants.
    const data: Prisma.PlanUncheckedUpdateManyInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;

    let shiftDays = 0;
    if (input.startDate !== undefined) {
      // Deux dates lisibles : celle de la base, et celle que le schéma vient de valider.
      shiftDays = required(
        daysBetweenIsoDates(toIsoDate(plan.startDate), input.startDate),
        `[plan] date de début illisible pour le plan ${id}`,
      );
      data.startDate = toDbDate(input.startDate);
    }

    // `undefined` = ne touche pas au destinataire ; `null` = le détacher. Les deux se
    // distinguent, et c'est toute la raison d'être du `nullable().optional()` du schéma.
    let opened: string | null = null;
    if (reassigned) {
      await this.assertReassignable(plan, input.athleteId ?? null);
      data.athleteId = input.athleteId ?? null;
      if (input.athleteId != null && input.athleteId !== plan.athleteId) {
        opened = await this.planAccess.defaultOrganization(
          input.athleteId,
          settledOrganizations(plan, audienceChanged),
        );
      }
    }

    // Rien à écrire : la version n'avance pas. L'avancer sans changement ferait prendre un 409 à
    // l'autre Coach pour une écriture qui n'a rien modifié.
    if (Object.keys(data).length === 0) return this.getDto(id, this.db, context);

    return this.db.$transaction(async (tx) => {
      await writeAtVersion(tx.plan, id, expected, data, PLAN_NOT_FOUND);
      if (shiftDays !== 0) {
        // Toutes les dates de la grille bougent : un geste fondé sur l'ancienne est périmé. Les
        // semaines d'abord, puis leurs séances — l'ordre des verrous de `touchWeeks`.
        await touchWeeks(tx, { planId: id });
        await shiftSessions(tx, { planId: id }, shiftDays);
      }
      if (reassigned) {
        await propagateAthlete(tx, this.invoices, id, input.athleteId ?? null);
        if (audienceChanged) await this.planAccess.resetOpened(tx, id);
        await this.planAccess.grantDefault(tx, id, opened);
      }
      // Relu DANS la transaction : la ligne reste verrouillée par notre écriture, la réponse porte
      // donc NOTRE version. Relue après, elle pourrait déjà porter celle d'un autre Coach — et le
      // formulaire, qui garde une saisie faite pendant l'envoi, la citerait par-dessus lui.
      return this.getDto(id, tx, context);
    });
  }

  /**
   * Ce qu'un changement de destinataire exige AVANT d'être écrit.
   *
   * Un cycle diffusé n'en change plus : son athlète a été notifié, s'entraîne dessus, et sa
   * facture est émise à son nom. Le refus est un 409 et non un 400 — ce n'est pas la demande qui
   * est mal formée, c'est l'état du cycle qui ne s'y prête plus.
   *
   * Même logique pour un brouillon dont la facture porte un justificatif (#472) : le PDF nomme
   * son destinataire. Renvoyer le MÊME athlète, en revanche, ne change rien et passe.
   */
  private async assertReassignable(plan: Plan, athleteId: string | null): Promise<void> {
    if (plan.status === PlanStatus.PUBLISHED) {
      throw new ConflictException(
        "Le destinataire d'un cycle diffusé ne change plus : il en a déjà été prévenu",
      );
    }
    if (athleteId != null) {
      await this.assertAthleteOwned(athleteId);
      if (athleteId !== plan.athleteId) {
        await this.invoices.assertDocumentDetached(plan.id);
      }
      return;
    }
    await this.invoices.assertPlanDetachable(plan.id);
  }

  /**
   * Un cycle DIFFUSÉ ne se supprime pas (#85) : la cascade emporterait sa facture émise, que
   * l'athlète a déjà vue, et les débriefs de ses séances — médias laissés orphelins dans le bucket.
   * Un brouillon, lui, n'a jamais été visible de l'athlète : aucune séance n'y est débriefée.
   *
   * Sous la version affichée (#604) : un cycle qu'un autre Coach a retouché, réaffecté ou DIFFUSÉ
   * depuis ne part pas sur la foi d'un écran périmé. La suppression conditionnelle tient aussi la
   * diffusion qui passerait entre le contrôle du statut et elle — sans quoi la cascade emporterait
   * un cycle tout juste diffusé, et sa facture émise. Cette version est celle de l'EN-TÊTE : les
   * semaines qu'un autre Coach vient d'y poser partent avec le cycle, que la suppression vise en
   * entier, après confirmation.
   */
  async delete(id: string, query: VersionQuery): Promise<void> {
    const { plan } = await this.getForOrThrow(id, "delete");
    const expected = new Date(query.expectedUpdatedAt);
    // La version avant le verrou, comme pour l'en-tête : un écran qui n'a pas vu la diffusion se
    // relit et la montre, au lieu d'opposer un refus à un état que le Coach ignore.
    assertReadAtVersion(plan.updatedAt, expected);
    if (plan.status === PlanStatus.PUBLISHED) {
      throw new ConflictException(
        "Un cycle diffusé ne se supprime plus : sa facture est émise et son athlète s'entraîne dessus",
      );
    }
    // Semaines, séances, exercices et copies de documents partent en cascade (schéma). Les objets
    // S3 ne sont PAS touchés : ils appartiennent à la bibliothèque, les copies les partagent.
    //
    // Les RAPPELS, eux, n'ont pas de clé étrangère vers leur cible (référence polymorphe) : rien en
    // base ne les emporte. On les purge donc explicitement, dans la MÊME transaction — sinon un
    // rappel « relancer ce cycle » survivrait au cycle et ne mènerait plus nulle part (#44).
    //
    // La purge AVANT la suppression : elle retrouve la facture du cycle, que la cascade emporte.
    // Refusée, la suppression l'annule avec elle.
    await this.db.$transaction(async (tx) => {
      await this.reminders.purgeForPlan(tx, id);
      await deleteAtVersion(tx.plan, id, expected, PLAN_NOT_FOUND);
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Un cycle que l'acteur peut LIRE — le sien, ou un cycle qu'on lui ouvre (#607) —, ou 404 :
   * illisible, il ne dit rien de son existence. Public : séances planifiées et copie de semaine
   * s'appuient dessus — un seul contrôle, un seul message.
   */
  async getReadableOrThrow(id: string): Promise<PlanWithAccess> {
    const plan = await this.db.plan.findFirst({ where: { id }, include: ACCESS_INCLUDE });
    if (plan == null) {
      throw new NotFoundException(PLAN_NOT_FOUND);
    }
    return plan;
  }

  /**
   * Le cycle, si le droit de l'acteur couvre le geste : 404 illisible, 403 lisible sans plus. À
   * appeler AVANT toute écriture dans le cycle ou ses enfants : l'extension refuserait sinon
   * l'écriture d'un lecteur par un 500 (enfant créé) ou par une écriture qui ne touche rien.
   *
   * Puis 409 `FOLLOW_ENDED` sur un cycle dont le suivi est terminé (#909), quel que soit le droit
   * de l'acteur : l'écriture y est fermée à tous. Le partage et la suppression d'un brouillon
   * restent au propriétaire — ils ne réécrivent rien de ce que le couple a produit.
   */
  async getForOrThrow(
    id: string,
    gesture: AccessGesture,
  ): Promise<{ plan: PlanWithAccess; context: AccessContext }> {
    const { row, context } = await this.access.loadFor(this.getReadableOrThrow(id), gesture);
    if (gesture === "write" || gesture === "reassign") assertFollowOngoing(row.followEndedAt);
    return { plan: row, context };
  }

  async getWeekOrThrow(weekId: string): Promise<PlanWeek> {
    const week = await this.db.planWeek.findFirst({ where: { id: weekId } });
    if (week == null) {
      throw new NotFoundException(WEEK_NOT_FOUND);
    }
    return week;
  }

  // Le plan complet (semaines + séances) — la forme rendue par l'API après chaque écriture.
  private async getDetailOrThrow(
    id: string,
    db: TenantPrisma | TenantTx,
  ): Promise<Prisma.PlanGetPayload<{ include: typeof COACH_PLAN_DETAIL_INCLUDE }>> {
    const plan = await db.plan.findFirst({ where: { id }, include: COACH_PLAN_DETAIL_INCLUDE });
    if (plan == null) {
      throw new NotFoundException(PLAN_NOT_FOUND);
    }
    return plan;
  }

  /**
   * La forme rendue après l'écriture d'un service voisin (semaines, diffusion). Le contexte y est
   * EXIGÉ : celui que le geste a déjà lu, que la transaction ne pourrait pas relire.
   */
  getDtoFor(id: string, db: TenantPrisma | TenantTx, context: AccessContext): Promise<PlanDto> {
    return this.getDto(id, db, context);
  }

  /**
   * `context` : celui que le geste a déjà lu. Dans une transaction, il est OBLIGATOIRE de fait —
   * le relire passerait par une autre connexion pendant que la transaction tient la sienne.
   */
  private async getDto(
    id: string,
    db: TenantPrisma | TenantTx = this.db,
    context?: AccessContext,
  ): Promise<PlanDto> {
    const [plan, actor] = await Promise.all([
      this.getDetailOrThrow(id, db),
      context ?? this.access.context(),
    ]);
    return toPlanDto(plan, planAccessOf(plan, actor));
  }

  /**
   * La relation coach→athlète est scopée par le tenancy layer : un athlète qui n'est pas le sien
   * (ou une relation inactive) ne remonte pas. La FK, elle, n'impose rien — d'où ce contrôle.
   *
   * **Soi-même est le seul athlète sans relation** (auto-coaching, #14) : un coach qui se coache
   * n'a pas de ligne `CoachAthlete`, et ne peut pas en avoir (CHECK `coach_athlete_not_self`, #11).
   * La capacité athlète est donc exigée explicitement — sans elle, un coach pur se créerait des
   * cycles qu'il ne pourrait jamais lire, la lecture passant par les routes athlète.
   */
  private async assertAthleteOwned(athleteId: string): Promise<void> {
    const actor = currentActor(this.cls);
    if (athleteId === actor.userId) {
      if (!actor.capabilities.isAthlete) {
        throw new BadRequestException("Athlète inconnu");
      }
      return;
    }

    const relation = await this.db.coachAthlete.findFirst({
      where: { athleteId, status: CoachAthleteStatus.ACTIVE },
    });
    if (relation == null) {
      throw new BadRequestException("Athlète inconnu");
    }
  }
}

/**
 * Ce qui DÉFINIT un cycle — son titre, sa description, son début — ne se réécrit plus une fois
 * diffusé, exactement comme son destinataire. Le refus est un 409 et non un 400 : la demande
 * n'est pas mal formée, c'est l'état du cycle qui ne s'y prête plus.
 *
 * Le message diffère de celui du destinataire parce qu'il dit autre chose : là où l'athlète « en
 * a déjà été prévenu », ici il s'entraîne dessus — et un cycle qui bouge sous ses pieds est pire
 * qu'un cycle qu'on ne peut plus corriger.
 *
 * La CAPACITÉ de décalage (`shiftSessions`) reste entière : elle sert au brouillon. Décaler un
 * cycle DIFFUSÉ (athlète blessé, report d'une semaine) est un besoin réel, mais demande un autre
 * dispositif — l'athlète doit en être prévenu (#172). C'est cette porte-ci qui se ferme, pas la
 * mécanique derrière.
 */
function assertHeaderWritable(plan: Plan, input: UpdatePlanInput): void {
  if (plan.status !== PlanStatus.PUBLISHED) return;
  const rewritesHeader =
    input.title !== undefined || input.description !== undefined || input.startDate !== undefined;
  if (!rewritesHeader) return;
  throw new ConflictException(
    "L'en-tête d'un cycle diffusé ne se réécrit plus : son athlète s'entraîne dessus",
  );
}

/** Le droit du Coach courant sur un cycle lu, et ses droits accordés pour le propriétaire seul. */
function planAccessOf(plan: AccessRow, context: AccessContext): PlanAccess {
  const { myAccess, grants, coachGrants } = toAccessView(plan, context);
  return { myAccess, grants, coachGrants };
}
