import {
  ABOUT_BLANK,
  AdjustmentLevel,
  type ChangeAccessInput,
  type CreateSessionInput,
  customMetricIdsIn,
  type ElementAccessDto,
  type ExerciseBlocks,
  gridValueIssues,
  type LibraryScope,
  MetricSource,
  type ReloadSessionExerciseInput,
  required,
  type SessionBlock,
  type SessionDto,
  type SessionExerciseInput,
  toJsonPointer,
  type UpdateSessionInput,
  type VersionQuery,
} from "@cmv/shared";
import { HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { ACCESS_INCLUDE, type AccessContext, libraryScopeWhere } from "../../access/access.mapper";
import { type AccessGesture, AccessService } from "../../access/service/access.service";
import { AccessGrantService } from "../../access/service/access-grant.service";
import { gridCatalogOf, toCustomMetricDto } from "../../custom-metric/custom-metric.mapper";
import { CustomMetricService } from "../../custom-metric/service/custom-metric.service";
import type { LibraryExercise } from "../../exercise/exercise.mapper";
import { ExerciseService } from "../../exercise/service/exercise.service";
import { ProblemException } from "../../problem/problem.exception";
import type { TenantPrisma, TenantTx } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { parseGrid } from "../../util/block-json.util";
import { assertShapeLocked } from "../../util/dosage-lock.util";
import { parseBlocks, toAdjustmentsInput, toBlocksInput } from "../../util/exercise-json.util";
import { assertReadAtVersion, deleteAtVersion, writeAtVersion } from "../../util/stale-write.util";
import {
  exerciseOwnersOf,
  SESSION_DETAIL_INCLUDE,
  type SessionWithExercises,
  toSessionDto,
} from "../session.mapper";
import { insertSessionBlocks } from "../session-block.writer";

const SESSION_NOT_FOUND = "Séance introuvable";

@Injectable()
export class SessionService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly library: ExerciseService,
    private readonly metrics: CustomMetricService,
    private readonly access: AccessService,
    private readonly grants: AccessGrantService,
  ) {}

  async create(input: CreateSessionInput): Promise<SessionDto> {
    const composition =
      input.blocks === undefined
        ? await this.listedComposition(input.exercises, null)
        : {
            blocks: await this.writableBlocksOrThrow(
              input.blocks,
              null,
              (await this.access.context()).actorId,
            ),
          };
    const session = await this.db.$transaction(async (tx) => {
      const created = await tx.session.create({
        // coachId injecté par le tenancy layer (extension Prisma) — d'où le cast.
        data: { title: input.title, notes: input.notes ?? null } satisfies Omit<
          Prisma.SessionUncheckedCreateInput,
          "coachId"
        > as Prisma.SessionUncheckedCreateInput,
      });
      if ("blocks" in composition) {
        await insertSessionBlocks(tx, created.id, composition.blocks);
      } else {
        const { exercises, library } = composition;
        await this.replaceExercises(tx, created.id, exercises, [], library);
      }
      return created;
    });
    return this.getDto(session.id);
  }

  async list(scope: LibraryScope): Promise<SessionDto[]> {
    const context = await this.access.context();
    const sessions = await this.db.session.findMany({
      where: libraryScopeWhere(scope, context.actorId),
      include: SESSION_DETAIL_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    return this.toDtos(sessions, context);
  }

  async get(id: string): Promise<SessionDto> {
    return this.getDto(id);
  }

  /**
   * Remplace la séance, à condition qu'elle n'ait pas changé depuis que la saisie a commencé
   * (#604) — sinon 409 `STALE_WRITE`, et la base garde l'autre écriture, composition comprise.
   */
  async update(id: string, input: UpdateSessionInput): Promise<SessionDto> {
    const { session: current, context } = await this.getForOrThrow(id, "write");
    const expected = new Date(input.expectedUpdatedAt);
    // Avant de valider les exercices cités contre un état que la saisie n'a pas vu.
    assertReadAtVersion(current.updatedAt, expected);
    // Un exercice que la séance cite déjà reste citable, même privé : le droit vient d'elle.
    const composition =
      input.blocks === undefined
        ? await this.listedComposition(
            required(input.exercises, "[session] l'une des compositions"),
            current,
          )
        : { blocks: await this.writableBlocksOrThrow(input.blocks, current, current.coachId) };
    const saved = await this.db.$transaction(async (tx) => {
      await writeAtVersion(
        tx.session,
        id,
        expected,
        { title: input.title, notes: input.notes ?? null },
        SESSION_NOT_FOUND,
      );
      // Replace-all : la composition est intégralement remplacée par la liste fournie.
      // Lues AVANT la destruction : elles portent les références que la nouvelle composition
      // doit récupérer.
      const previous = await tx.sessionExercise.findMany({
        where: { sessionId: id },
        select: { id: true, baseline: true },
      });
      // Les deux modèles s'effacent ensemble (#716) : une séance n'en porte qu'un à la fois.
      await tx.sessionExercise.deleteMany({ where: { sessionId: id } });
      await tx.sessionBlock.deleteMany({ where: { sessionId: id } });
      if ("blocks" in composition) {
        await insertSessionBlocks(tx, id, composition.blocks);
      } else {
        const { exercises, library } = composition;
        await this.replaceExercises(tx, id, exercises, previous, library);
      }
      // Relue DANS la transaction : la ligne reste verrouillée par notre écriture, la réponse porte
      // donc NOTRE version et NOS lignes. Relue après, elle pourrait déjà porter celles d'un autre
      // Coach — que le builder, qui garde sa saisie, reprendrait comme les siennes.
      return this.getReadableOrThrow(id, tx);
    });
    // Le DTO hors de la transaction : les catalogues ne sont pas versionnés avec la séance, et
    // les lire par une autre connexion pendant qu'elle tient la sienne épuiserait le pool.
    return this.toDto(saved, context);
  }

  /**
   * Sous la version lue (#605, MC-8) : un rédacteur a pu changer la séance depuis. Les
   * SessionExercise partent en cascade (onDelete: Cascade côté schéma).
   */
  async delete(id: string, query: VersionQuery): Promise<void> {
    await this.getForOrThrow(id, "delete");
    await deleteAtVersion(
      this.db.session,
      id,
      new Date(query.expectedUpdatedAt),
      SESSION_NOT_FOUND,
    );
  }

  /**
   * Changer les droits de séances (#605), propriétaire seul. Aucun refus de réduction : une séance
   * planifiée RECOPIE la séance-type, et rien ne la cite après coup.
   */
  async changeAccess(input: ChangeAccessInput): Promise<ElementAccessDto[]> {
    const sessions = await this.db.session.findMany({
      where: { id: { in: input.ids } },
      include: ACCESS_INCLUDE,
    });
    await this.grants.assertCanShare(input, sessions);
    return this.grants.apply("sessionId", input);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Une séance que l'acteur peut LIRE, ou 404 : illisible, elle ne dit rien de son existence.
  private async getReadableOrThrow(
    id: string,
    db: TenantPrisma | TenantTx = this.db,
  ): Promise<SessionWithExercises> {
    const session = await db.session.findFirst({
      where: { id },
      include: SESSION_DETAIL_INCLUDE,
    });
    if (session == null) {
      throw new NotFoundException(SESSION_NOT_FOUND);
    }
    return session;
  }

  // La séance, si le droit de l'acteur couvre le geste : 404 illisible, 403 lisible sans plus (#605).
  private async getForOrThrow(
    id: string,
    gesture: AccessGesture,
  ): Promise<{ session: SessionWithExercises; context: AccessContext }> {
    const { row, context } = await this.access.loadFor(this.getReadableOrThrow(id), gesture);
    return { session: row, context };
  }

  private async getDto(id: string): Promise<SessionDto> {
    return this.toDto(await this.getReadableOrThrow(id));
  }

  private async toDto(session: SessionWithExercises, context?: AccessContext): Promise<SessionDto> {
    const [dto] = await this.toDtos([session], context);
    return required(dto, "[session] une séance, un DTO");
  }

  // Un seul aller-retour pour les catalogues de tous les propriétaires des exercices composés, et
  // un pour les entreprises de l'acteur.
  private async toDtos(
    sessions: SessionWithExercises[],
    context?: AccessContext,
  ): Promise<SessionDto[]> {
    const [catalogOf, actor] = await Promise.all([
      this.metrics.catalogOf(exerciseOwnersOf(sessions)),
      context ?? this.access.context(),
    ]);
    return sessions.map((session) => toSessionDto(session, catalogOf, actor));
  }

  /**
   * La composition par blocs à écrire (#716), ce qu'elle cite prouvé utilisable — ou 400 :
   *
   * - chaque exercice, accessible comme dans l'ancien modèle (#353). Celui qu'une ligne de la séance
   *   cite déjà sous la même clé n'est pas revérifié (tranché en #605) ;
   * - chaque cellule, dans le type de sa colonne : le schéma partagé ne connaît pas les métriques
   *   du Coach, qui vivent en base.
   *
   * Les origines, elles, ne se refusent pas : `withReadableOrigins`.
   */
  private async writableBlocksOrThrow(
    blocks: readonly SessionBlock[],
    session: SessionWithExercises | null,
    sessionOwnerId: string,
  ): Promise<SessionBlock[]> {
    const exercises = blocks.flatMap((block) => block.exercises);
    const citedByKey = new Map(session?.exercises.map((row) => [row.key, row.exercise]));
    const library = await this.library.loadAccessibleOrThrow(
      exercises
        .filter((exercise) => citedByKey.get(exercise.key)?.id !== exercise.exerciseId)
        .map((exercise) => exercise.exerciseId),
      session?.id ?? null,
    );

    const ownerOf = (exerciseId: string): string =>
      required(
        library.get(exerciseId) ??
          session?.exercises.find((row) => row.exerciseId === exerciseId)?.exercise,
        `[session] exercice ${exerciseId} ni chargé ni cité`,
      ).coachId;
    const catalogOf = await this.metrics.catalogOf([
      sessionOwnerId,
      ...exercises.map((exercise) => ownerOf(exercise.exerciseId)),
    ]);
    // Une colonne déjà enregistrée garde sa métrique même supprimée depuis (dette EX-2) : la
    // refuser bloquerait tout enregistrement de la séance qui la porte.
    const alreadyCited = new Set(
      customMetricIdsIn(
        session?.exercises.flatMap((row) => (row.grid === null ? [] : [parseGrid(row.grid)])) ?? [],
      ),
    );
    blocks.forEach((block, blockIndex) => {
      block.exercises.forEach((exercise, exerciseIndex) => {
        const catalog = gridCatalogOf(catalogOf, ownerOf(exercise.exerciseId), sessionOwnerId).map(
          toCustomMetricDto,
        );
        const known = new Set(catalog.map((metric) => metric.id));
        const metrics = exercise.grid.metrics.filter(
          (metric) =>
            metric.source !== MetricSource.CUSTOM ||
            known.has(metric.customMetricId) ||
            !alreadyCited.has(metric.customMetricId),
        );
        const [issue] = gridValueIssues({ ...exercise.grid, metrics }, catalog);
        if (issue !== undefined) throw gridRefusal(blockIndex, exerciseIndex, issue.message);
      });
    });
    return this.withReadableOrigins(blocks, session);
  }

  /**
   * Les blocs, sans l'origine d'une structure que l'acteur ne lit pas.
   *
   * L'origine n'est qu'une trace : la séance garde sa copie des réglages, et la base la retire déjà
   * d'elle-même quand la structure est supprimée (`SetNull`). Cette suppression n'avance pas la
   * version de la séance : un builder ouvert avant renvoie l'origine disparue, et un 400 ne lui
   * laisserait aucune issue — recharger ne lui dirait pas pourquoi. L'écrire nulle rend l'état que
   * la base aurait de toute façon, sans rien dire d'une structure qu'on ne lit pas.
   *
   * Une structure que les blocs de la séance citent déjà reste citée sans être relue : le rédacteur
   * d'une séance ouverte (#605) ne lit pas les structures de son propriétaire.
   */
  private async withReadableOrigins(
    blocks: readonly SessionBlock[],
    session: SessionWithExercises | null,
  ): Promise<SessionBlock[]> {
    const cited = new Set(session?.blocks.map((block) => block.sourceStructureId));
    const wanted = blocks.flatMap((block) =>
      block.sourceStructureId == null || cited.has(block.sourceStructureId)
        ? []
        : [block.sourceStructureId],
    );
    const readable =
      wanted.length === 0
        ? []
        : await this.db.structure.findMany({ where: { id: { in: wanted } }, select: { id: true } });
    const kept = new Set([...cited, ...readable.map((structure) => structure.id)]);
    return blocks.map((block) =>
      block.sourceStructureId == null || kept.has(block.sourceStructureId)
        ? block
        : { ...block, sourceStructureId: null },
    );
  }

  /** Une composition par exercices, avec ce qu'elle cite de la bibliothèque. */
  private async listedComposition(
    exercises: SessionExerciseInput[],
    session: SessionWithExercises | null,
  ) {
    return { exercises, library: await this.loadCited(exercises, session) };
  }

  /**
   * Les exercices que la composition cite, prouvés accessibles (#353) — ou 400.
   *
   * Une ligne REPRISE qui cite toujours le même exercice n'est pas revérifiée : elle garde sa
   * référence (`baseline`) et ne relit rien de la bibliothèque. La séance ne se casse donc pas
   * sous son auteur quand le droit qui lui avait ouvert l'exercice disparaît (tranché en #605).
   */
  private loadCited(
    exercises: SessionExerciseInput[],
    session: { id: string; exercises: readonly { id: string; exerciseId: string }[] } | null,
  ): Promise<Map<string, LibraryExercise>> {
    const citedBy = new Map(session?.exercises.map((row) => [row.id, row.exerciseId]));
    return this.library.loadAccessibleOrThrow(
      exercises
        .filter(
          (exercise) => exercise.id == null || citedBy.get(exercise.id) !== exercise.exerciseId,
        )
        .map((exercise) => exercise.exerciseId),
      session?.id ?? null,
    );
  }

  /**
   * « Recharger depuis la bibliothèque » : la composition reprend le dosage de l'exercice TEL
   * QU'IL EST AUJOURD'HUI, et repart sans aucun ajustement.
   *
   * C'est le SEUL geste qui déplace la référence, et c'est pourquoi il vit côté serveur : partout
   * ailleurs le client n'envoie que des valeurs, jamais la référence contre laquelle le verrou
   * est vérifié — il ne pourrait que la forger.
   *
   * À ne pas confondre avec « Tout réinitialiser », qui revient aux valeurs copiées à l'ajout et
   * ne touche pas la référence. Celui-ci ÉCRASE, d'où la confirmation côté client.
   *
   * La version de la SÉANCE est vérifiée, et avancée, AVANT de chercher la ligne (#604) : chaque
   * enregistrement recrée la composition sous de nouveaux identifiants, si bien qu'un onglet resté
   * sur l'ancienne cite une ligne qui n'existe plus. C'est un conflit, pas une ligne inconnue.
   */
  async reloadExerciseFromLibrary(
    sessionId: string,
    sessionExerciseId: string,
    input: ReloadSessionExerciseInput,
  ): Promise<SessionDto> {
    const { context } = await this.getForOrThrow(sessionId, "write");
    const saved = await this.db.$transaction(async (tx) => {
      // Rien d'autre à écrire sur la séance : seule sa version avance.
      await writeAtVersion(
        tx.session,
        sessionId,
        new Date(input.expectedUpdatedAt),
        {},
        SESSION_NOT_FOUND,
      );
      const composed = await tx.sessionExercise.findFirst({
        where: { id: sessionExerciseId, sessionId },
        select: { exerciseId: true },
      });
      if (composed == null) {
        throw new NotFoundException("Exercice de séance introuvable");
      }
      // Lisible, ou privé au propriétaire de la séance qui le cite (#605) — pas l'exercice d'un
      // tiers que l'acteur ne lit pas : recharger en recopierait le dosage.
      const library = await this.library.loadAccessibleOrThrow(
        [composed.exerciseId],
        sessionId,
        tx,
      );
      const blocks = parseBlocks(
        required(library.get(composed.exerciseId), "[session] exercice rechargé non chargé").blocks,
      );
      await tx.sessionExercise.update({
        where: { id: sessionExerciseId },
        data: {
          blocks: toBlocksInput(blocks),
          baseline: toBlocksInput(blocks),
          adjustments: toAdjustmentsInput([]),
        },
      });
      // Dans la transaction, comme après un enregistrement : la réponse porte NOTRE version.
      return this.getReadableOrThrow(sessionId, tx);
    });
    return this.toDto(saved, context);
  }

  /**
   * Insère la composition ordonnée : la position = l'ordre du tableau (coachId injecté).
   *
   * La composition est un REMPLACE-ALL — les lignes sont détruites puis recréées. La référence de
   * dosage doit pourtant survivre à l'opération, sinon « Tout réinitialiser » reviendrait aux
   * valeurs de la dernière sauvegarde et le verrou n'aurait plus rien contre quoi vérifier. D'où
   * `previousById` : une ligne qui porte un `id` déjà connu récupère SA référence, une ligne sans
   * id part d'une copie de l'exercice.
   *
   * Le client ne fournit jamais la référence — il ne pourrait que la forger.
   */
  private async replaceExercises(
    tx: TenantTx,
    sessionId: string,
    exercises: SessionExerciseInput[],
    previous: readonly { id: string; baseline: Prisma.JsonValue }[],
    library: ReadonlyMap<string, LibraryExercise>,
  ): Promise<void> {
    if (exercises.length === 0) return;

    const previousById = new Map(previous.map((row) => [row.id, row]));
    // Une fois par exercice DISTINCT, pas par ligne (#297) : la même référence citée à chaque
    // ligne faisait reparser ses blocs autant de fois.
    const libraryBlocks = new Map<string, ExerciseBlocks>();
    const blocksOf = (exerciseId: string): ExerciseBlocks => {
      const cached = libraryBlocks.get(exerciseId);
      if (cached != null) return cached;
      // `loadAccessibleOrThrow` a déjà refusé en 400 tout exercice inconnu.
      const exercise = required(
        library.get(exerciseId),
        `[session] exercice ${exerciseId} absent de la bibliothèque chargée`,
      );
      const blocks = parseBlocks(exercise.blocks);
      libraryBlocks.set(exerciseId, blocks);
      return blocks;
    };

    const rows = exercises.map((input, position) => {
      const kept = input.id == null ? null : previousById.get(input.id);

      // La référence : celle de la ligne conservée, ou une copie du dosage de l'exercice.
      const baseline = kept == null ? blocksOf(input.exerciseId) : parseBlocks(kept.baseline);
      const blocks = input.blocks ?? baseline;

      assertShapeLocked(AdjustmentLevel.SESSION, baseline, blocks);

      return {
        sessionId,
        exerciseId: input.exerciseId,
        position,
        note: input.note ?? null,
        blocks: toBlocksInput(blocks),
        baseline: toBlocksInput(baseline),
        adjustments: toAdjustmentsInput(input.adjustments ?? []),
      };
    });

    await tx.sessionExercise.createMany({
      data: rows satisfies Omit<
        Prisma.SessionExerciseUncheckedCreateInput,
        "coachId"
      >[] as Prisma.SessionExerciseUncheckedCreateInput[],
    });
  }
}

/**
 * Le refus d'une grille, pointé sur SON exercice (RFC 9457, `errors`) : le constructeur retrouve la
 * carte fautive par son rang, que le Coach lit — la clé de l'exercice ne lui dirait rien.
 */
function gridRefusal(blockIndex: number, exerciseIndex: number, detail: string): ProblemException {
  return new ProblemException(HttpStatus.BAD_REQUEST, ABOUT_BLANK, "Bad Request", undefined, [
    { detail, pointer: toJsonPointer(["blocks", blockIndex, "exercises", exerciseIndex, "grid"]) },
  ]);
}
