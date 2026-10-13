import {
  AdjustmentLevel,
  type CreateSessionInput,
  type ExerciseBlocks,
  type ReloadSessionExerciseInput,
  required,
  type SessionDto,
  type SessionExerciseInput,
  type UpdateSessionInput,
} from "@cmv/shared";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { TenantPrisma, TenantTx } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { assertShapeLocked } from "../../util/dosage-lock.util";
import { parseBlocks, toAdjustmentsInput, toBlocksInput } from "../../util/exercise-json.util";
import { assertReadAtVersion, writeAtVersion } from "../../util/stale-write.util";
import { type ExerciseWithTags, type SessionWithExercises, toSessionDto } from "../session.mapper";

const SESSION_NOT_FOUND = "Séance introuvable";

@Injectable()
export class SessionService {
  constructor(@Inject(TENANT_PRISMA) private readonly db: TenantPrisma) {}

  async create(input: CreateSessionInput): Promise<SessionDto> {
    await this.assertExercisesOwned(input.exercises);
    const session = await this.db.$transaction(async (tx) => {
      const created = await tx.session.create({
        // coachId injecté par le tenancy layer (extension Prisma) — d'où le cast.
        data: { title: input.title, notes: input.notes ?? null } satisfies Omit<
          Prisma.SessionUncheckedCreateInput,
          "coachId"
        > as Prisma.SessionUncheckedCreateInput,
      });
      await this.replaceExercises(tx, created.id, input.exercises, []);
      return created;
    });
    return this.getDto(session.id);
  }

  async list(): Promise<SessionDto[]> {
    const sessions = await this.db.session.findMany({
      include: { exercises: { orderBy: { position: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    // Un seul findMany scopé pour résoudre titres/catégories de tous les exercices référencés.
    const exerciseIds = sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId));
    const byId = await this.loadExerciseMap(exerciseIds);
    return sessions.map((s) => toSessionDto(s, byId));
  }

  async get(id: string): Promise<SessionDto> {
    return this.getDto(id);
  }

  /**
   * Remplace la séance, à condition qu'elle n'ait pas changé depuis que la saisie a commencé
   * (#604) — sinon 409 `STALE_WRITE`, et la base garde l'autre écriture, composition comprise.
   */
  async update(id: string, input: UpdateSessionInput): Promise<SessionDto> {
    const current = await this.getOwnedOrThrow(id);
    const expected = new Date(input.expectedUpdatedAt);
    // Avant de valider les exercices cités contre un état que la saisie n'a pas vu.
    assertReadAtVersion(current.updatedAt, expected);
    await this.assertExercisesOwned(input.exercises);
    return this.db.$transaction(async (tx) => {
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
      await tx.sessionExercise.deleteMany({ where: { sessionId: id } });
      await this.replaceExercises(tx, id, input.exercises, previous);
      // Relue DANS la transaction : la ligne reste verrouillée par notre écriture, la réponse porte
      // donc NOTRE version et NOS lignes. Relue après, elle pourrait déjà porter celles d'un autre
      // Coach — que le builder, qui garde sa saisie, reprendrait comme les siennes.
      return this.getDto(id, tx);
    });
  }

  async delete(id: string): Promise<void> {
    await this.getOwnedOrThrow(id);
    // Les SessionExercise sont supprimés en cascade (onDelete: Cascade côté schéma).
    await this.db.session.delete({ where: { id } });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async getOwnedOrThrow(
    id: string,
    db: TenantPrisma | TenantTx = this.db,
  ): Promise<SessionWithExercises> {
    const session = await db.session.findFirst({
      where: { id },
      include: { exercises: { orderBy: { position: "asc" } } },
    });
    if (session == null) {
      throw new NotFoundException(SESSION_NOT_FOUND);
    }
    return session;
  }

  private async getDto(id: string, db: TenantPrisma | TenantTx = this.db): Promise<SessionDto> {
    const session = await this.getOwnedOrThrow(id, db);
    const byId = await this.loadExerciseMap(
      session.exercises.map((e) => e.exerciseId),
      db,
    );
    return toSessionDto(session, byId);
  }

  // Vérifie que TOUS les exercices référencés appartiennent au coach courant (scope coachId).
  // Indispensable : la FK n'impose pas le tenant, et les include imbriqués ne sont pas scopés.
  private async assertExercisesOwned(exercises: SessionExerciseInput[]): Promise<void> {
    const ids = [...new Set(exercises.map((e) => e.exerciseId))];
    if (ids.length === 0) return;
    const owned = await this.db.exercise.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (owned.length !== ids.length) {
      throw new BadRequestException("Un ou plusieurs exercices sont inconnus");
    }
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
    return this.db.$transaction(async (tx) => {
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
      });
      if (composed == null) {
        throw new NotFoundException("Exercice de séance introuvable");
      }

      // FK `Restrict`, même coach : l'exercice composé existe tant que la ligne qui le cite.
      const exercise = required(
        await tx.exercise.findFirst({ where: { id: composed.exerciseId } }),
        `[session] exercice ${composed.exerciseId} hors scope pour la séance ${sessionId}`,
      );

      const blocks = parseBlocks(exercise.blocks);
      await tx.sessionExercise.update({
        where: { id: sessionExerciseId },
        data: {
          blocks: toBlocksInput(blocks),
          baseline: toBlocksInput(blocks),
          adjustments: toAdjustmentsInput([]),
        },
      });
      // Dans la transaction, comme après un enregistrement : la réponse porte NOTRE version.
      return this.getDto(sessionId, tx);
    });
  }

  // Charge (scopé) les exercices par id → map pour l'enrichissement titre/tags.
  private async loadExerciseMap(
    exerciseIds: string[],
    db: TenantPrisma | TenantTx = this.db,
  ): Promise<Map<string, ExerciseWithTags>> {
    const ids = [...new Set(exerciseIds)];
    if (ids.length === 0) return new Map();
    const exercises = await db.exercise.findMany({
      where: { id: { in: ids } },
      include: { tags: true },
    });
    return new Map(exercises.map((e) => [e.id, e]));
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
  ): Promise<void> {
    if (exercises.length === 0) return;

    const library = await this.loadExerciseMap(exercises.map((e) => e.exerciseId));
    const previousById = new Map(previous.map((row) => [row.id, row]));
    // Une fois par exercice DISTINCT, pas par ligne (#297) : la même référence citée à chaque
    // ligne faisait reparser ses blocs autant de fois.
    const libraryBlocks = new Map<string, ExerciseBlocks>();
    const blocksOf = (exerciseId: string): ExerciseBlocks => {
      const cached = libraryBlocks.get(exerciseId);
      if (cached != null) return cached;
      // `assertExercisesOwned` a déjà refusé en 400 tout exercice inconnu.
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
