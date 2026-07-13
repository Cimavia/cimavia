import type {
  CreateSessionInput,
  SessionDto,
  SessionExerciseInput,
  UpdateSessionInput,
} from "@cmv/shared";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Exercise, Prisma } from "@prisma/client";
import type { TenantPrisma, TenantTx } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";

// La séance avec ses exercices composés (positions), ordonnés.
type SessionWithExercises = Prisma.SessionGetPayload<{ include: { exercises: true } }>;

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
      await this.replaceExercises(tx, created.id, input.exercises);
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
      await tx.sessionExercise.deleteMany({ where: { sessionId: id } });
      await this.replaceExercises(tx, id, input.exercises);
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

  // Charge (scopé) les exercices par id → map pour l'enrichissement titre/catégorie.
  private async loadExerciseMap(exerciseIds: string[]): Promise<Map<string, Exercise>> {
    const ids = [...new Set(exerciseIds)];
    if (ids.length === 0) return new Map();
    const exercises = await this.db.exercise.findMany({ where: { id: { in: ids } } });
    return new Map(exercises.map((e) => [e.id, e]));
  }

  // Insère la composition ordonnée : la position = l'ordre du tableau (coachId injecté).
  private async replaceExercises(
    tx: TenantTx,
    sessionId: string,
    exercises: SessionExerciseInput[],
  ): Promise<void> {
    if (exercises.length === 0) return;
    await tx.sessionExercise.createMany({
      data: exercises.map((e, position) => ({
        sessionId,
        exerciseId: e.exerciseId,
        position,
        prescription: e.prescription ?? null,
      })) satisfies Omit<
        Prisma.SessionExerciseUncheckedCreateInput,
        "coachId"
      >[] as Prisma.SessionExerciseUncheckedCreateInput[],
    });
  }
}

// Assemble le DTO à partir de la séance et de la map d'exercices (résolus de façon scopée).
function toSessionDto(
  session: SessionWithExercises,
  exerciseById: Map<string, Exercise>,
): SessionDto {
  return {
    id: session.id,
    coachId: session.coachId,
    title: session.title,
    notes: session.notes,
    exercises: session.exercises.map((se) => {
      const exercise = exerciseById.get(se.exerciseId);
      if (exercise == null) {
        throw new Error(
          `[session] exercice ${se.exerciseId} hors scope pour la séance ${session.id}`,
        );
      }
      return {
        id: se.id,
        exerciseId: se.exerciseId,
        position: se.position,
        prescription: se.prescription,
        title: exercise.title,
        category: exercise.category,
      };
    }),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}
