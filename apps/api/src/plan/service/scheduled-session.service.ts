import type {
  BlockGrid,
  CreateScheduledSessionInput,
  PlanDto,
  ReorderPlanDayInput,
  ScheduledSessionDto,
  UpdateScheduledSessionInput,
  VersionQuery,
} from "@cmv/shared";
import {
  CompositionOrigin,
  isDateInPlanWeek,
  PLAN_MAX_WEEKS,
  PlanStatus,
  planWeekNumber,
  required,
  ScheduledSessionStatus,
} from "@cmv/shared";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Plan, PlanWeek, Prisma } from "@prisma/client";
import { citedCustomMetrics, gridCatalogOf } from "../../custom-metric/custom-metric.mapper";
import { CustomMetricService } from "../../custom-metric/service/custom-metric.service";
import { ExerciseService } from "../../exercise/service/exercise.service";
import { StorageService } from "../../infra/storage/storage.service";
import { NotificationService } from "../../notification/notification.service";
import { receivedBlockOf, SESSION_BLOCKS_INCLUDE } from "../../session/session-block.mapper";
import type { TenantPrisma, TenantTx } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { parseGrid } from "../../util/block-json.util";
import { toDbDate, toIsoDate } from "../../util/date.util";
import { parseInstructions } from "../../util/exercise-json.util";
import {
  assertReadAtVersion,
  assertWrittenAtVersion,
  writeAtVersion,
} from "../../util/stale-write.util";
import { athleteRecipientOrThrow } from "../plan.recipient";
import { lockWeeksInOrder, touchWeeks } from "../plan-week.version";
import {
  type ScheduledSessionWithExercises,
  SESSION_DETAIL_INCLUDE,
  toScheduledSessionDto,
} from "../scheduled-session.mapper";
import { compactDay, type PositionedSession, writeDay } from "../scheduled-session.position";
import {
  type BlockPlacementDraft,
  insertScheduledSessionExercises,
  type ScheduledBlockDraft,
  type ScheduledSessionExerciseDraft,
} from "../scheduled-session.writer";
import { PlanService } from "./plan.service";

// La séance telle qu'elle sera écrite : un instantané, plus aucune référence à résoudre.
type SessionDraft = {
  title: string;
  notes: string | null;
  exercises: ScheduledSessionExerciseDraft[];
  /** Les blocs reçus de la séance-type (#716). */
  blocks: ScheduledBlockDraft[];
};

const SESSION_NOT_FOUND = "Séance planifiée introuvable";

/**
 * Séances planifiées = COPIES ÉDITABLES d'un modèle de séance (CDC §5.4). Modifier une instance
 * ne touche jamais la bibliothèque, et modifier la bibliothèque ne touche jamais une planif
 * diffusée : titre, description, catégorie, prescription et documents sont dupliqués ici.
 */
@Injectable()
export class ScheduledSessionService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly storage: StorageService,
    // Contrôles d'accès au plan et à la semaine : source unique (PlanService).
    private readonly plans: PlanService,
    private readonly notifications: NotificationService,
    private readonly library: ExerciseService,
    private readonly metrics: CustomMetricService,
  ) {}

  async create(
    planWeekId: string,
    input: CreateScheduledSessionInput,
  ): Promise<ScheduledSessionDto> {
    const week = await this.plans.getWeekOrThrow(planWeekId);
    const { plan } = await this.plans.getForOrThrow(week.planId, "write");
    this.assertDateInWeek(plan, week, input.scheduledDate);

    const draft = await this.buildDraft(input.sourceSessionId);

    // Sans version (#604) : la semaine avance, verrouillée d'abord — deux séances posées au même
    // instant le même jour prennent leur rang l'une après l'autre (`touchWeeks`).
    const session = await this.db.$transaction(async (tx) => {
      await touchWeeks(tx, { id: planWeekId });
      const created = await tx.scheduledSession.create({
        // coachId injecté par le tenancy layer ; athleteId dénormalisé explicitement.
        data: {
          athleteId: plan.athleteId,
          planId: plan.id,
          planWeekId,
          sourceSessionId: input.sourceSessionId,
          title: draft.title,
          notes: draft.notes,
          scheduledDate: toDbDate(input.scheduledDate),
          position: await this.nextPosition(tx, planWeekId, input.scheduledDate),
        } satisfies Omit<
          Prisma.ScheduledSessionUncheckedCreateInput,
          "coachId"
        > as Prisma.ScheduledSessionUncheckedCreateInput,
      });
      await insertScheduledSessionExercises(
        tx,
        created.id,
        plan.athleteId,
        draft.exercises,
        draft.blocks,
      );
      return created;
    });

    // Ajouter une séance à un cycle DÉJÀ diffusé, c'est l'ajuster (CDC §5.7) : sans notification,
    // l'athlète ne saurait pas qu'une séance de plus l'attend — et son cache hors-ligne, lui,
    // continuerait d'afficher la semaine d'avant. Sur un brouillon, rien à annoncer.
    if (plan.status === PlanStatus.PUBLISHED) {
      await this.notifications.notifyPlanSessionAdded({
        athleteId: athleteRecipientOrThrow(plan),
        planId: plan.id,
        sessionTitle: draft.title,
      });
    }

    return this.getDto(session.id);
  }

  async get(id: string): Promise<ScheduledSessionDto> {
    return this.getDto(id);
  }

  /**
   * Édition d'une instance — y compris en cours de cycle diffusé (CDC §5.7, sans historique) :
   * titre, notes et jour. Sa composition s'écrit geste par geste (`ScheduledCompositionService`).
   *
   * Sous la version de la séance ouverte (#604) : un autre Coach a pu l'ajuster depuis.
   */
  async update(id: string, input: UpdateScheduledSessionInput): Promise<ScheduledSessionDto> {
    const session = await this.getReadableOrThrow(id);
    // Le droit avant la version : un lecteur prend son 403, pas un 409 qui l'inviterait à
    // recharger pour réessayer ce qu'il ne pourra jamais faire (#607).
    const { plan } = await this.plans.getForOrThrow(session.planId, "write");
    const expected = new Date(input.expectedUpdatedAt);
    // Avant de juger la date contre un état que la saisie n'a pas vu.
    assertReadAtVersion(session.updatedAt, expected);
    // La date peut tomber dans une AUTRE semaine du cycle (#689) : la séance y part avec elle.
    const [week, arrival] = await Promise.all([
      this.plans.getWeekOrThrow(session.planWeekId),
      this.weekOfDateOrThrow(plan, input.scheduledDate),
    ]);

    const dateChanged = toIsoDate(session.scheduledDate) !== input.scheduledDate;

    const updated = await this.db.$transaction(async (tx) => {
      // Les semaines d'abord, puis la séance : l'ordre des verrous de `touchWeeks`. Départ et
      // arrivée avancent toutes deux, sans version : celle que le client cite est celle de la
      // séance, et ce qui dépend des semaines — rang d'arrivée, jour quitté — se relit ci-dessous.
      await lockWeeksInOrder(tx, [
        { id: week.id, weekNumber: week.weekNumber },
        { id: arrival.id, weekNumber: arrival.weekNumber },
      ]);
      await writeAtVersion(
        tx.scheduledSession,
        id,
        expected,
        {
          title: input.title,
          notes: input.notes ?? null,
          planWeekId: arrival.id,
          scheduledDate: toDbDate(input.scheduledDate),
          // Changer de jour = prendre la fin de file du nouveau jour ; sinon la position tient.
          position: dateChanged
            ? await this.nextPosition(tx, arrival.id, input.scheduledDate)
            : session.position,
        },
        SESSION_NOT_FOUND,
      );

      // Changer de jour, c'est aussi QUITTER un jour : sans ce recollage, l'ancien garde le trou.
      if (dateChanged) await compactDay(tx, session.planWeekId, session.scheduledDate);
      // Relue DANS la transaction : la réponse porte NOTRE version, pas celle d'un Coach passé
      // juste après.
      return this.getDto(id, tx);
    });

    // Ajuster un cycle DÉJÀ diffusé doit prévenir l'athlète (CDC §5.7) : il a peut-être la
    // version d'avant en cache hors-ligne, et s'entraînerait dessus. Sur un brouillon, il n'y a
    // rien à annoncer — le cycle n'existe pas encore pour lui.
    if (plan.status === PlanStatus.PUBLISHED) {
      await this.notifications.notifyPlanUpdated({
        athleteId: athleteRecipientOrThrow(plan),
        planId: plan.id,
        sessionTitle: input.title,
      });
    }

    return updated;
  }

  /**
   * Le CONTENU d'une journée et son ordre (#148, élargi en #93) — replace-all : le tableau reçu
   * définit ce que la journée porte, et dans quel ordre.
   *
   * Il peut donc citer une séance posée un autre jour du MÊME cycle, dans n'importe laquelle de ses
   * semaines (#689) : elle y est déplacée, au rang exact où le tableau la place, et change de
   * semaine avec sa date. C'est le pendant serveur du glisser d'une case à l'autre, et ça reste le
   * même geste que le sélecteur « Jour » du panneau de séance — d'où la même annonce
   * (`PLAN_UPDATED`), et non celle du réordonnancement.
   *
   * La version citée est celle de la semaine d'ARRIVÉE : c'est la journée que le client a lue
   * pour composer le tableau. Les semaines de départ avancent sans condition (`lockWeeksInOrder`).
   *
   * Réordonner reste autorisé sur un cycle DIFFUSÉ, contrairement au collage de semaine (#4) qui
   * s'y refuse : la différence n'est pas le statut, c'est le nombre d'écritures. Un collage émet
   * une notification par séance et rien ne les groupe (dette N-6) ; ici le geste est UN.
   */
  async reorderDay(
    planWeekId: string,
    isoDate: string,
    input: ReorderPlanDayInput,
  ): Promise<PlanDto> {
    const week = await this.plans.getWeekOrThrow(planWeekId);
    const { plan } = await this.plans.getForOrThrow(week.planId, "write");
    const expected = new Date(input.expectedUpdatedAt);
    // Avant de juger le tableau : fondé sur une grille périmée, il ne correspond plus à la journée,
    // et le refus serait un 400 « contenu invalide » au lieu de proposer de relire (#604).
    assertReadAtVersion(week.updatedAt, expected);
    this.assertDateInWeek(plan, week, isoDate);

    // Le jour visé, et les séances citées où qu'elles soient dans le CYCLE : une autre journée,
    // une autre semaine (#689). Pas un autre cycle : changer de cycle peut changer d'athlète, donc
    // de destinataire. Scopé au coach courant par l'extension tenant — une séance d'un autre coach
    // n'y figure pas, et les contrôles ci-dessous la refusent comme étrangère au cycle.
    const date = toDbDate(isoDate);
    const cycleSessions = await this.db.scheduledSession.findMany({
      where: { planId: plan.id, OR: [{ scheduledDate: date }, { id: { in: input.sessionIds } }] },
      select: {
        id: true,
        position: true,
        scheduledDate: true,
        title: true,
        planWeek: { select: { id: true, weekNumber: true, updatedAt: true } },
      },
      orderBy: { position: "asc" },
    });

    const ordered = assertDayContent(cycleSessions, input.sessionIds, date);

    const moved = ordered.filter((session) => session.scheduledDate.getTime() !== date.getTime());
    // Comparer l'état RÉSULTANT, jamais le fait qu'une requête soit passée : le `PUT` est
    // idempotent, et renvoyer l'ordre déjà en place ne dérange pas l'athlète (même règle que le
    // `readAt` de #105).
    const reordered = ordered.some((session, index) => session.position !== index);

    if (moved.length > 0 || reordered) {
      // Les jours d'origine, avant écriture : après, les séances n'y sont plus et on ne saurait
      // plus lesquels recoller. Une date n'appartient qu'à une semaine du cycle : la clé suffit.
      const sources = new Map(
        moved.map((session) => [
          session.scheduledDate.getTime(),
          { planWeekId: session.planWeek.id, date: session.scheduledDate },
        ]),
      );

      await this.db.$transaction(async (tx) => {
        // Chaque semaine sous la version LUE : celle que le client cite pour l'arrivée (déjà
        // comparée ci-dessus), celle de la lecture ci-dessus pour les départs — les jours à
        // recoller en ont été déduits, et ne valent que si personne ne les a changés depuis.
        await lockWeeksInOrder(tx, [
          { id: week.id, weekNumber: week.weekNumber, readAt: expected },
          ...moved.map(({ planWeek }) => ({
            id: planWeek.id,
            weekNumber: planWeek.weekNumber,
            readAt: planWeek.updatedAt,
          })),
        ]);
        await writeDay(tx, ordered, planWeekId, date);
        for (const source of sources.values()) {
          await compactDay(tx, source.planWeekId, source.date);
        }
      });

      if (plan.status === PlanStatus.PUBLISHED) {
        await this.announce(plan, isoDate, moved);
      }
    }

    return this.plans.get(plan.id);
  }

  /**
   * Ce que l'athlète apprend d'un geste sur sa journée.
   *
   * Une séance DÉPLACÉE prime sur l'ordre : lui dire que sa journée a été réordonnée quand sa
   * séance est passée au mardi l'enverrait chercher au mauvais endroit — le raisonnement même qui
   * a fait distinguer les quatre types d'ajustement plutôt que les fondre en un seul.
   *
   * Un seul déplacement par geste dans l'interface : la boucle sert le cas où l'API est appelée
   * autrement, et la dette N-6 (aucun groupement) ne mord pas sur un tableau qui en porte un.
   */
  private async announce(
    plan: Plan,
    isoDate: string,
    moved: readonly { title: string }[],
  ): Promise<void> {
    const athleteId = athleteRecipientOrThrow(plan);

    if (moved.length === 0) {
      await this.notifications.notifyPlanSessionsReordered({
        athleteId,
        planId: plan.id,
        isoDate,
      });
      return;
    }

    for (const session of moved) {
      await this.notifications.notifyPlanUpdated({
        athleteId,
        planId: plan.id,
        sessionTitle: session.title,
      });
    }
  }

  /** Sous la version de la séance ouverte (#604) : la retirer ne se fait pas sur ce qu'on n'a pas vu. */
  async delete(id: string, query: VersionQuery): Promise<void> {
    const session = await this.getReadableOrThrow(id);
    const expected = new Date(query.expectedUpdatedAt);
    const { plan } = await this.plans.getForOrThrow(session.planId, "write");

    await this.db.$transaction(async (tx) => {
      // La semaine d'abord : l'ordre des verrous de `touchWeeks`. Un refus plus bas l'annule.
      await touchWeeks(tx, { id: session.planWeekId });
      /**
       * Une séance débriefée ne se supprime pas (#313) : la cascade emporterait le débrief de
       * l'athlète, son suivi d'exécution et le lien des messages qui y répondent — et laisserait
       * ses médias orphelins dans le bucket. Le coach garde l'édition, qui préserve tout ça.
       *
       * La garde — le statut, et la version lue (#604) — est DANS la suppression, pas dans une
       * lecture préalable : un débrief créé au même instant passe la séance en DONE dans sa
       * transaction, et Postgres revérifie la condition sur la ligne mise à jour avant de la
       * supprimer. `DONE` n'est posé que par le débrief, qui ne
       * se supprime jamais : le statut dit exactement « un débrief existe ».
       *
       * Exercices et copies de documents partent en cascade. Aucun objet storage supprimé : les
       * copies ne font que partager les clés de la bibliothèque, qui en reste propriétaire.
       */
      const { count } = await tx.scheduledSession.deleteMany({
        where: { id, updatedAt: expected, status: { not: ScheduledSessionStatus.DONE } },
      });
      await assertDeleted(tx, id, count);
      // La journée se recolle DANS la même transaction : un trou laissé derrière ferait échouer
      // la prochaine séance ajoutée ce jour-là, sur une contrainte d'unicité que le coach n'a
      // aucun moyen de relier à la suppression qu'il vient de faire.
      await compactDay(tx, session.planWeekId, session.scheduledDate);
    });

    // Retirer une séance d'un cycle diffusé est l'ajustement le plus déroutant pour l'athlète :
    // sans notification, une séance disparaît de son planning sans explication — ou pire, reste
    // visible dans son cache hors-ligne et il se déplace pour rien.
    if (plan.status === PlanStatus.PUBLISHED) {
      await this.notifications.notifyPlanSessionRemoved({
        athleteId: athleteRecipientOrThrow(plan),
        planId: plan.id,
        sessionTitle: session.title,
      });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Une séance que l'acteur peut LIRE — d'un cycle à lui, ou qu'on lui ouvre (#607) —, ou 404.
  async getReadableOrThrow(
    id: string,
    db: TenantPrisma | TenantTx = this.db,
  ): Promise<ScheduledSessionWithExercises> {
    const session = await db.scheduledSession.findFirst({
      where: { id },
      include: SESSION_DETAIL_INCLUDE,
    });
    if (session == null) {
      throw new NotFoundException(SESSION_NOT_FOUND);
    }
    return session;
  }

  private async getDto(
    id: string,
    db: TenantPrisma | TenantTx = this.db,
  ): Promise<ScheduledSessionDto> {
    return toScheduledSessionDto(await this.getReadableOrThrow(id, db), this.storage);
  }

  /**
   * La semaine du cycle où tombe `date`, ou 400 (#689). Une séance retouchée peut changer de
   * semaine, jamais de cycle : hors de ses semaines, la date ne désigne rien où la poser.
   *
   * Le cycle ne stocke pas son nombre de semaines, il le porte en lignes `PlanWeek` : le compter
   * coûterait une requête de plus. `PLAN_MAX_WEEKS` borne donc le calcul du numéro, et c'est la base
   * qui dit si cette semaine existe.
   */
  private async weekOfDateOrThrow(plan: Plan, date: string): Promise<PlanWeek> {
    const weekNumber = planWeekNumber(
      { startDate: toIsoDate(plan.startDate), weekCount: PLAN_MAX_WEEKS },
      date,
    );
    const week =
      weekNumber == null
        ? null
        : await this.db.planWeek.findFirst({ where: { planId: plan.id, weekNumber } });
    if (week == null) {
      throw new BadRequestException(`La date ${date} ne tombe dans aucune semaine du cycle`);
    }
    return week;
  }

  // Une séance ne peut pas être posée hors de la plage de sa semaine (sinon la vue calendrier
  // afficherait une séance de la semaine 2 dans la semaine 1).
  private assertDateInWeek(plan: Plan, week: PlanWeek, date: string): void {
    if (!isDateInPlanWeek(toIsoDate(plan.startDate), week.weekNumber, date)) {
      throw new BadRequestException(
        `La date ${date} ne tombe pas dans la semaine ${week.weekNumber} du cycle`,
      );
    }
  }

  /**
   * Position = rang dans la JOURNÉE (plusieurs séances possibles le même jour).
   *
   * Compter suffit parce que les rangs d'une journée sont CONTIGUS : c'est l'invariant que
   * `compactDay` tient à chaque départ de séance. Le jour où il tomberait, ce compte rendrait un
   * rang déjà occupé.
   */
  private nextPosition(tx: TenantTx, planWeekId: string, date: string): Promise<number> {
    return tx.scheduledSession.count({
      where: { planWeekId, scheduledDate: toDbDate(date) },
    });
  }

  /**
   * Résout ce qui sera écrit : la copie de la séance-type, que le Coach ajuste ensuite dans la
   * séance planifiée — c'est déjà une instance, pas une référence.
   */
  private async buildDraft(sourceSessionId: string): Promise<SessionDraft> {
    const template = await this.db.session.findFirst({
      where: { id: sourceSessionId },
      include: { exercises: { orderBy: { position: "asc" } }, blocks: SESSION_BLOCKS_INCLUDE },
    });
    if (template == null) {
      throw new BadRequestException("Séance modèle inconnue");
    }

    // Prouvés accessibles, et lus à travers le modèle quand ils ne le sont que par lui : un
    // exercice privé de C, dans la séance qu'il ouvre à F, se recopie dans la planification de M.
    const library = await this.library.loadAccessibleOrThrow(
      template.exercises.map((e) => e.exerciseId),
      template.id,
    );
    // Chargés UNE fois pour toute la séance, chez le propriétaire de chaque exercice (piège n°9) :
    // le modèle peut composer l'exercice d'un autre Coach, qui cite son catalogue. Et celui du
    // propriétaire du modèle, que citent aussi les grilles de ses blocs (#716).
    const catalogOf = await this.metrics.catalogOf([
      template.coachId,
      ...[...library.values()].map((exercise) => exercise.coachId),
    ]);
    const blockIndex = new Map(template.blocks.map((block, index) => [block.id, index]));
    const exercises = template.exercises.map((composed): ScheduledSessionExerciseDraft => {
      const exercise = required(
        library.get(composed.exerciseId),
        `[plan] exercice ${composed.exerciseId} absent des exercices chargés`,
      );
      const grid = parseGrid(composed.grid);
      return {
        exercise: {
          sourceExerciseId: exercise.id,
          title: exercise.title,
          description: exercise.description,
          // La consigne vient de la BIBLIOTHÈQUE : elle n'est pas surchargeable au niveau séance,
          // donc la séance n'en garde aucune copie. Elle se fige ici, dans le snapshot de l'athlète.
          instructions: parseInstructions(exercise.instructions),
          // Les définitions des métriques maison partent AVEC la copie : sans elles l'athlète ne
          // verrait qu'un identifiant, et renommer la métrique dégraderait une planif diffusée.
          customMetrics: citedCustomMetrics(
            [grid],
            gridCatalogOf(catalogOf, exercise.coachId, template.coachId),
          ),
          tags: exercise.tags.map((tag) => tag.name).sort(),
          note: composed.note,
        },
        documents: exercise.documents,
        // Le dosage vient de la SÉANCE, pas de l'exercice : sa grille, recopiée telle quelle.
        placement: receivedPlacementOf(composed, grid, blockIndex),
      };
    });

    return {
      title: template.title,
      notes: template.notes,
      exercises,
      blocks: template.blocks.map(receivedBlockOf),
    };
  }
}

/** La place qu'un exercice de bloc de la séance-type prend dans la séance planifiée : la même, et REÇU (#716). */
function receivedPlacementOf(
  composed: { id: string; blockId: string; blockPosition: number; key: string },
  grid: BlockGrid,
  blockIndex: ReadonlyMap<string, number>,
): BlockPlacementDraft {
  return {
    block: required(
      blockIndex.get(composed.blockId),
      `[plan] l'exercice de bloc ${composed.id} sans bloc lu`,
    ),
    blockPosition: composed.blockPosition,
    key: composed.key,
    grid,
    origin: CompositionOrigin.RECEIVED,
    replacesKey: null,
  };
}

/**
 * Dit pourquoi la suppression n'a rien supprimé, relu dans sa transaction. Débriefée : le refus de
 * #313 prime, recharger n'y changerait rien. Sinon, comme toute écriture sous version (#604) :
 * disparue → 404, changée depuis la lecture → 409 `STALE_WRITE`.
 */
async function assertDeleted(tx: TenantTx, id: string, count: number): Promise<void> {
  if (count > 0) return;
  const current = await tx.scheduledSession.findFirst({ where: { id }, select: { status: true } });
  if (current?.status === ScheduledSessionStatus.DONE) {
    throw new ConflictException(
      "Cette séance a été débriefée par l'athlète : elle ne peut plus être supprimée, mais reste modifiable",
    );
  }
  await assertWrittenAtVersion(count, () => Promise.resolve(current != null), SESSION_NOT_FOUND);
}

/**
 * Vérifie que `sessionIds` décrit une journée VALIDE, et rend ses séances dans l'ordre demandé.
 *
 * Deux règles, et une seule liberté :
 *  - tout identifiant cité appartient au CYCLE (#689). Un identifiant étranger désigne soit un
 *    autre cycle, soit un autre coach — que le scope tenant a déjà rendu invisible. 400 dans les
 *    deux cas : la demande est mal formée ;
 *  - aucune séance déjà posée ce jour-là n'est OMISE. L'omettre ne dirait pas où elle va : elle
 *    garderait son rang d'avant, donc des doublons et des trous sur
 *    `@@unique([planWeekId, scheduledDate, position])`. Vider une journée se fait en déplaçant ou
 *    en supprimant ses séances, pas en les taisant ;
 *  - en revanche une séance d'un AUTRE jour du cycle peut être citée : elle est déplacée ici, au
 *    rang où le tableau la place. C'est tout l'objet de l'élargissement (#93, puis #689).
 */
function assertDayContent<T extends PositionedSession>(
  cycleSessions: readonly T[],
  sessionIds: readonly string[],
  date: Date,
): T[] {
  const byId = new Map(cycleSessions.map((session) => [session.id, session]));
  const wanted = new Set(sessionIds);

  if (wanted.size !== sessionIds.length) {
    throw new BadRequestException("Une séance est citée deux fois dans l'ordre demandé");
  }

  const missing = cycleSessions.filter(
    (session) => session.scheduledDate.getTime() === date.getTime() && !wanted.has(session.id),
  );
  if (missing.length > 0) {
    throw new BadRequestException(
      "L'ordre doit citer TOUTES les séances déjà posées ce jour-là, sans en omettre",
    );
  }

  return sessionIds.map((id) => {
    const session = byId.get(id);
    if (session == null) {
      throw new BadRequestException(`La séance ${id} n'appartient pas à ce cycle`);
    }
    return session;
  });
}
