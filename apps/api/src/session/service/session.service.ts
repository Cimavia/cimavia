import {
  type CreateSessionInput,
  lockedShapeIssues,
  type SessionDto,
  type SessionExerciseInput,
  type UpdateSessionInput,
} from "@cmv/shared";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { TenantPrisma, TenantTx } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { parseBlocks, toAdjustmentsInput, toBlocksInput } from "../../util/exercise-json.util";
import { type ExerciseWithTags, type SessionWithExercises, toSessionDto } from "../session.mapper";

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

  async update(id: string, input: UpdateSessionInput): Promise<SessionDto> {
    await this.getOwnedOrThrow(id);
    await this.assertExercisesOwned(input.exercises);
    await this.db.$transaction(async (tx) => {
      await tx.session.update({
        where: { id },
        data: { title: input.title, notes: input.notes ?? null },
      });
      // Replace-all : la composition est intégralement remplacée par la liste fournie.
      // Lues AVANT la destruction : elles portent les références que la nouvelle composition
      // doit récupérer.
      const previous = await tx.sessionExercise.findMany({
        where: { sessionId: id },
        select: { id: true, baseline: true },
      });
      await tx.sessionExercise.deleteMany({ where: { sessionId: id } });
      await this.replaceExercises(tx, id, input.exercises, previous);
    });
    return this.getDto(id);
  }

  async delete(id: string): Promise<void> {
    await this.getOwnedOrThrow(id);
    // Les SessionExercise sont supprimés en cascade (onDelete: Cascade côté schéma).
    await this.db.session.delete({ where: { id } });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async getOwnedOrThrow(id: string): Promise<SessionWithExercises> {
    const session = await this.db.session.findFirst({
      where: { id },
      include: { exercises: { orderBy: { position: "asc" } } },
    });
    if (session == null) {
      throw new NotFoundException("Séance introuvable");
    }
    return session;
  }

  private async getDto(id: string): Promise<SessionDto> {
    const session = await this.getOwnedOrThrow(id);
    const byId = await this.loadExerciseMap(session.exercises.map((e) => e.exerciseId));
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
   */
  async reloadExerciseFromLibrary(
    sessionId: string,
    sessionExerciseId: string,
  ): Promise<SessionDto> {
    const composed = await this.db.sessionExercise.findFirst({
      where: { id: sessionExerciseId, sessionId },
    });
    if (composed == null) {
      throw new NotFoundException("Exercice de séance introuvable");
    }

    const exercise = await this.db.exercise.findFirst({ where: { id: composed.exerciseId } });
    if (exercise == null) {
      throw new NotFoundException("Exercice introuvable");
    }

    const blocks = parseBlocks(exercise.blocks);
    await this.db.sessionExercise.update({
      where: { id: sessionExerciseId },
      data: {
        blocks: toBlocksInput(blocks),
        baseline: toBlocksInput(blocks),
        adjustments: toAdjustmentsInput([]),
      },
    });

    return this.get(sessionId);
  }

  // Charge (scopé) les exercices par id → map pour l'enrichissement titre/tags.
  private async loadExerciseMap(exerciseIds: string[]): Promise<Map<string, ExerciseWithTags>> {
    const ids = [...new Set(exerciseIds)];
    if (ids.length === 0) return new Map();
    const exercises = await this.db.exercise.findMany({
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

    const rows = exercises.map((input, position) => {
      const kept = input.id == null ? null : previousById.get(input.id);
      const exercise = library.get(input.exerciseId);
      if (exercise == null) {
        throw new BadRequestException("Un ou plusieurs exercices sont inconnus");
      }

      // La référence : celle de la ligne conservée, ou une copie du dosage de l'exercice.
      const baseline = kept == null ? parseBlocks(exercise.blocks) : parseBlocks(kept.baseline);
      const blocks = input.blocks ?? baseline;

      const issues = lockedShapeIssues(baseline, blocks);
      if (issues.length > 0) {
        // Le verrou est vérifié ICI et pas seulement grisé dans l'UI : un formulaire n'est pas
        // une frontière. Le message nomme ce qui a bougé, sinon le 400 est indébogable.
        throw new BadRequestException(
          `Structure verrouillée au niveau séance : ${issues.join(", ")}`,
        );
      }

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
