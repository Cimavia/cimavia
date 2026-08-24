import type { CreateExerciseInput, ExerciseDto, UpdateExerciseInput } from "@cmv/shared";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { StorageService } from "../../infra/storage/storage.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toBlocksInput, toInstructionsInput } from "../../util/exercise-json.util";
import { type ExerciseWithDocuments, toExerciseDto } from "../exercise.mapper";
import { DocumentCleanupService } from "./document-cleanup.service";

export type ListExercisesFilters = {
  tag?: string;
  search?: string;
};

@Injectable()
export class ExerciseService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly storage: StorageService,
    private readonly cleanup: DocumentCleanupService,
  ) {}

  private toDto(exercise: ExerciseWithDocuments): Promise<ExerciseDto> {
    return toExerciseDto(exercise, this.storage);
  }

  /**
   * Charge un exercice du coach courant, ou lève 404 (scope coachId appliqué par le tenancy layer).
   * Public : `ExerciseDocumentService` s'appuie dessus — un seul contrôle d'appartenance,
   * un seul message, pas deux implémentations à garder en phase.
   */
  async getOwnedOrThrow(id: string): Promise<ExerciseWithDocuments> {
    const exercise = await this.db.exercise.findFirst({
      where: { id },
      include: { documents: true, tags: true },
    });
    if (exercise == null) {
      throw new NotFoundException("Exercice introuvable");
    }
    return exercise;
  }

  /**
   * Les tags distincts du coach, triés. Sert l'autocomplétion du formulaire ET le filtre de la
   * liste — les deux ont besoin des tags EXISTANTS, pas de ceux du sous-ensemble affiché : dériver
   * la liste des exercices déjà filtrés la ferait rétrécir à chaque clic.
   *
   * `distinct` plutôt qu'un groupBy : on ne veut que les noms, pas leur décompte.
   */
  async listTags(): Promise<string[]> {
    const rows = await this.db.exerciseTag.findMany({
      distinct: ["name"],
      select: { name: true },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => row.name);
  }

  async create(input: CreateExerciseInput): Promise<ExerciseDto> {
    const created = await this.db.exercise.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        // `?? null` / `?? []` : à la création, « champ absent » et « champ vide » se confondent.
        // C'est à la mise à jour qu'ils divergent — là, `undefined` veut dire « ne touche pas ».
        instructions: toInstructionsInput(input.instructions ?? null),
        blocks: toBlocksInput(input.blocks ?? []),
      } satisfies Omit<
        Prisma.ExerciseUncheckedCreateInput,
        "coachId"
      > as Prisma.ExerciseUncheckedCreateInput,
      include: { documents: true, tags: true },
    });
    if (!input.tags?.length) return this.toDto(created);
    return this.toDto(await this.replaceTags(created.id, input.tags));
  }

  /**
   * Remplace l'ensemble des tags d'un exercice. Un `deleteMany` puis un `createMany` plutôt qu'un
   * diff : la liste est courte (10 au plus), et calculer l'écart coûterait plus que de la réécrire.
   *
   * `coachId` n'est pas passé — l'extension tenant l'injecte, comme sur toute écriture directe.
   */
  private async replaceTags(
    exerciseId: string,
    tags: readonly string[],
  ): Promise<ExerciseWithDocuments> {
    await this.db.exerciseTag.deleteMany({ where: { exerciseId } });
    if (tags.length > 0) {
      await this.db.exerciseTag.createMany({
        data: tags.map((name) => ({ exerciseId, name })) satisfies Omit<
          Prisma.ExerciseTagUncheckedCreateInput,
          "coachId"
        >[] as Prisma.ExerciseTagUncheckedCreateInput[],
      });
    }
    return this.getOwnedOrThrow(exerciseId);
  }

  async list(filters: ListExercisesFilters): Promise<ExerciseDto[]> {
    const where: Prisma.ExerciseWhereInput = {};
    // `some` et non `every` : un exercice porte plusieurs tags, filtrer sur l'un d'eux le retient.
    if (filters.tag) where.tags = { some: { name: filters.tag } };
    if (filters.search) where.title = { contains: filters.search, mode: "insensitive" };

    const exercises = await this.db.exercise.findMany({
      where,
      include: { documents: true, tags: true },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(exercises.map((exercise) => this.toDto(exercise)));
  }

  async get(id: string): Promise<ExerciseDto> {
    return this.toDto(await this.getOwnedOrThrow(id));
  }

  async update(id: string, input: UpdateExerciseInput): Promise<ExerciseDto> {
    await this.getOwnedOrThrow(id);
    const data: Prisma.ExerciseUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.instructions !== undefined)
      data.instructions = toInstructionsInput(input.instructions);
    if (input.blocks !== undefined) data.blocks = toBlocksInput(input.blocks);

    const exercise = await this.db.exercise.update({
      where: { id },
      data,
      include: { documents: true, tags: true },
    });
    if (input.tags === undefined) return this.toDto(exercise);
    return this.toDto(await this.replaceTags(id, input.tags));
  }

  async delete(id: string): Promise<void> {
    const exercise = await this.getOwnedOrThrow(id);

    // SessionExercise.exercise est en onDelete: Restrict — la bibliothèque ne doit pas se vider
    // sous les séances qui s'en servent. On renvoie un 409 explicite plutôt que de laisser
    // remonter une violation de clé étrangère (500), et le client peut afficher le pourquoi.
    const usedInSessions = await this.db.sessionExercise.count({ where: { exerciseId: id } });
    if (usedInSessions > 0) {
      throw new ConflictException(
        `Exercice utilisé dans ${usedInSessions} séance(s) : retirez-le d'abord de ces séances`,
      );
    }

    // Les lignes ExerciseDocument partent en cascade, mais PAS les objets en storage : on les
    // supprime explicitement, sinon ils resteraient orphelins (et facturés). Sauf ceux qu'une
    // séance planifiée affiche encore — ses copies partagent la clé objet (P3).
    for (const document of exercise.documents) {
      await this.cleanup.deleteObjectIfUnreferenced(document);
    }

    await this.db.exercise.delete({ where: { id } });
  }
}
