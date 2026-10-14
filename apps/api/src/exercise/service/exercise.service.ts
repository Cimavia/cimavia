import {
  type ChangeAccessInput,
  type CreateExerciseInput,
  type CustomMetric,
  comparableText,
  type DuplicateExerciseInput,
  type ElementAccessDto,
  type ExerciseDto,
  imageMediaIds,
  type LibraryScope,
  required,
  type UpdateExerciseInput,
  type VersionQuery,
} from "@cmv/shared";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ACCESS_INCLUDE,
  type AccessContext,
  type AccessRow,
  citationsLosingRead,
  libraryScopeWhere,
  toGrantDtos,
} from "../../access/access.mapper";
import { type AccessGesture, AccessService } from "../../access/service/access.service";
import { AccessGrantService } from "../../access/service/access-grant.service";
import type { CatalogOf } from "../../custom-metric/custom-metric.mapper";
import {
  assertCitesCatalog,
  CustomMetricService,
} from "../../custom-metric/service/custom-metric.service";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { explainForeignKeyViolation } from "../../infra/prisma/prisma-error";
import { StorageService } from "../../infra/storage/storage.service";
import type { TenantPrisma, TenantTx } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import {
  parseBlocks,
  parseInstructions,
  toBlocksInput,
  toInstructionsInput,
} from "../../util/exercise-json.util";
import {
  assertInstructionImagesOwned,
  instructionImageIds,
  withCopiedImages,
} from "../../util/instruction-images.util";
import { assertReadAtVersion, deleteAtVersion, writeAtVersion } from "../../util/stale-write.util";
import {
  EXERCISE_DETAIL_INCLUDE,
  type ExerciseWithDocuments,
  LIBRARY_EXERCISE_INCLUDE,
  type LibraryExercise,
  toExerciseDto,
} from "../exercise.mapper";
import { exerciseListWhere, type ListExercisesFilters } from "../exercise.where";
import { DocumentCleanupService } from "./document-cleanup.service";

const EXERCISE_NOT_FOUND = "Exercice introuvable";
const UNKNOWN_EXERCISES = "Un ou plusieurs exercices sont inconnus";

@Injectable()
export class ExerciseService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly storage: StorageService,
    private readonly cleanup: DocumentCleanupService,
    private readonly metrics: CustomMetricService,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly grants: AccessGrantService,
  ) {}

  private async toDto(
    exercise: ExerciseWithDocuments,
    context?: AccessContext,
    catalogOf?: CatalogOf,
  ): Promise<ExerciseDto> {
    const [dto] = await this.toDtos([exercise], context, catalogOf);
    return required(dto, "[exercise] un exercice, un DTO");
  }

  // Un seul aller-retour pour les catalogues de tous les propriétaires de la page, et un pour les
  // entreprises de l'acteur ; aucun pour ce que l'appelant a déjà lu.
  private async toDtos(
    exercises: ExerciseWithDocuments[],
    context?: AccessContext,
    loadedCatalogOf?: CatalogOf,
  ): Promise<ExerciseDto[]> {
    const [catalogOf, actor] = await Promise.all([
      loadedCatalogOf ?? this.metrics.catalogOf(exercises.map((exercise) => exercise.coachId)),
      context ?? this.access.context(),
    ]);
    return Promise.all(
      exercises.map((exercise) =>
        toExerciseDto(exercise, this.storage, catalogOf(exercise.coachId), actor),
      ),
    );
  }

  /**
   * Charge un exercice que l'acteur peut LIRE — le sien, ou ouvert à l'une de ses entreprises —, ou
   * lève 404 (filtre de l'extension tenant) : un exercice illisible ne dit rien de son existence.
   */
  async getReadableOrThrow(
    id: string,
    db: TenantPrisma | TenantTx = this.db,
  ): Promise<ExerciseWithDocuments> {
    const exercise = await db.exercise.findFirst({
      where: { id },
      include: EXERCISE_DETAIL_INCLUDE,
    });
    if (exercise == null) {
      throw new NotFoundException(EXERCISE_NOT_FOUND);
    }
    return exercise;
  }

  /**
   * L'exercice, à condition que le droit de l'acteur couvre le geste : 404 s'il ne le lit pas, 403
   * s'il le lit sans pouvoir le faire (#605). Public : `ExerciseDocumentService` s'appuie dessus —
   * un seul contrôle, un seul message, pas deux implémentations à garder en phase.
   */
  async getForOrThrow(
    id: string,
    gesture: AccessGesture,
  ): Promise<{ exercise: ExerciseWithDocuments; context: AccessContext }> {
    const { row, context } = await this.access.loadFor(this.getReadableOrThrow(id), gesture);
    return { exercise: row, context };
  }

  /**
   * Les exercices qu'une séance ou une planification s'apprête à citer, prouvés accessibles — ou
   * 400 si l'un d'eux ne l'est pas (#353, piège n°3) : la clé étrangère n'impose pas le tenant.
   *
   * Accessible, c'est lisible par l'acteur (le sien, ou ouvert à l'une de ses entreprises), plus
   * seulement possédé : une séance de M peut citer l'exercice de C (#605). Ou, quand `citedBy` est
   * donné, déjà cité par cette séance — que l'acteur peut lire — ET appartenant au propriétaire de
   * la séance. Le droit vient alors de la séance, et la requête part d'elle : un exercice privé de
   * C, cité par la séance qu'il ouvre à F, reste utilisable dans cette séance sans entrer dans la
   * bibliothèque de M. Jamais d'un id reçu seul.
   *
   * L'exercice d'un TIERS ne passe pas par la séance (tranché en #605) : D l'a ouvert à G, et C,
   * qui le lit par G, ne l'ouvre pas à F en le citant. Les droits de D bornent sa diffusion.
   *
   * Documents et tags arrivent par `include` : imbriqués sous un exercice déjà prouvé, ils le
   * suivent (les enfants suivent leur racine).
   */
  async loadAccessibleOrThrow(
    ids: readonly string[],
    citedBy: string | null = null,
    db: TenantPrisma | TenantTx = this.db,
  ): Promise<Map<string, LibraryExercise>> {
    const wanted = [...new Set(ids)];
    if (wanted.length === 0) return new Map();

    const readable = await db.exercise.findMany({
      where: { id: { in: wanted } },
      include: LIBRARY_EXERCISE_INCLUDE,
    });
    const byId = new Map(readable.map((exercise) => [exercise.id, exercise]));
    const missing = wanted.filter((id) => !byId.has(id));
    if (missing.length > 0 && citedBy != null) {
      const cited = await db.sessionExercise.findMany({
        where: { sessionId: citedBy, exerciseId: { in: missing } },
        include: { exercise: { include: LIBRARY_EXERCISE_INCLUDE } },
      });
      // `row.coachId` : le propriétaire de la séance, recopié sur la ligne (piège n°7).
      for (const row of cited) {
        if (row.exercise.coachId === row.coachId) byId.set(row.exerciseId, row.exercise);
      }
    }
    if (byId.size !== wanted.length) {
      throw new BadRequestException(UNKNOWN_EXERCISES);
    }
    return byId;
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
    // Un exercice qui naît n'a aucun document : sa consigne ne peut encore citer aucune image. Le
    // client les rattache APRÈS, puis réécrit la consigne (`useSaveExercise`).
    assertInstructionImagesOwned(input.instructions, []);
    assertCitesCatalog(input.blocks ?? [], [], await this.metrics.ownCatalog());
    const created = await this.db.exercise.create({
      data: {
        title: input.title,
        titleSearch: comparableText(input.title),
        description: input.description ?? null,
        // `?? null` / `?? []` : à la création, « champ absent » et « champ vide » se confondent.
        // C'est à la mise à jour qu'ils divergent — là, `undefined` veut dire « ne touche pas ».
        instructions: toInstructionsInput(input.instructions ?? null),
        blocks: toBlocksInput(input.blocks ?? []),
      } satisfies Omit<
        Prisma.ExerciseUncheckedCreateInput,
        "coachId"
      > as Prisma.ExerciseUncheckedCreateInput,
      include: EXERCISE_DETAIL_INCLUDE,
    });
    if (!input.tags?.length) return this.toDto(created);
    await this.replaceTags(this.db, created.id, input.tags);
    return this.get(created.id);
  }

  /**
   * « Dupliquer en variante » : une copie indépendante de l'exercice, consigne comprise (#315).
   *
   * La consigne cite ses images par l'identifiant d'un document de la SOURCE. Recopiée telle
   * quelle, elle désignait des documents que la variante n'a pas : ni l'éditeur ni l'athlète ne
   * les affichaient, sans un message. Chaque image citée est donc rattachée à la variante, sous la
   * MÊME clé objet — aucun binaire dupliqué, comme une séance planifiée (`DocumentCleanupService`
   * compte ces copies avant de purger).
   *
   * Seules les images de consigne suivent. Pièces jointes et liens restent à la source : la
   * variante sert à changer structure, colonnes ou consigne, pas les ressources de l'exercice.
   */
  async duplicate(sourceId: string, input: DuplicateExerciseInput): Promise<ExerciseDto> {
    const { exercise: source } = await this.getForOrThrow(sourceId, "duplicate");
    const instructions = parseInstructions(source.instructions);
    const cited = new Set(imageMediaIds(instructions ?? []));
    const owned = instructionImageIds(source.documents);
    const images = source.documents.filter((doc) => cited.has(doc.id) && owned.has(doc.id));
    const sourceBlocks = parseBlocks(source.blocks);
    if (input.blocks != null) {
      assertCitesCatalog(input.blocks, sourceBlocks, await this.metrics.ownCatalog());
    }

    const id = await this.db.$transaction(async (tx) => {
      const created = await tx.exercise.create({
        data: {
          title: input.title,
          titleSearch: comparableText(input.title),
          description: source.description,
          blocks: toBlocksInput(input.blocks ?? sourceBlocks),
        } satisfies Omit<
          Prisma.ExerciseUncheckedCreateInput,
          "coachId"
        > as Prisma.ExerciseUncheckedCreateInput,
      });

      // Un par un : il faut l'identifiant de chaque copie pour réécrire la consigne.
      const idByOldId = new Map<string, string>();
      for (const image of images) {
        const copy = await tx.exerciseDocument.create({
          data: {
            exerciseId: created.id,
            type: image.type,
            usage: image.usage,
            storagePath: image.storagePath,
            fileName: image.fileName,
            mimeType: image.mimeType,
          } satisfies Omit<
            Prisma.ExerciseDocumentUncheckedCreateInput,
            "coachId"
          > as Prisma.ExerciseDocumentUncheckedCreateInput,
        });
        idByOldId.set(image.id, copy.id);
      }

      await tx.exercise.update({
        where: { id: created.id },
        data: {
          instructions: toInstructionsInput(
            instructions == null ? null : withCopiedImages(instructions, idByOldId),
          ),
        },
      });
      if (source.tags.length > 0) {
        await tx.exerciseTag.createMany({
          data: source.tags.map((tag) => ({
            exerciseId: created.id,
            name: tag.name,
          })) satisfies Omit<
            Prisma.ExerciseTagUncheckedCreateInput,
            "coachId"
          >[] as Prisma.ExerciseTagUncheckedCreateInput[],
        });
      }
      return created.id;
    });

    return this.get(id);
  }

  /**
   * Remplace l'ensemble des tags d'un exercice. Un `deleteMany` puis un `createMany` plutôt qu'un
   * diff : la liste est courte (10 au plus), et calculer l'écart coûterait plus que de la réécrire.
   *
   * `coachId` n'est pas passé — l'extension tenant l'injecte, comme sur toute écriture directe.
   */
  private async replaceTags(
    db: TenantPrisma | TenantTx,
    exerciseId: string,
    tags: readonly string[],
  ): Promise<void> {
    await db.exerciseTag.deleteMany({ where: { exerciseId } });
    if (tags.length > 0) {
      await db.exerciseTag.createMany({
        data: tags.map((name) => ({ exerciseId, name })) satisfies Omit<
          Prisma.ExerciseTagUncheckedCreateInput,
          "coachId"
        >[] as Prisma.ExerciseTagUncheckedCreateInput[],
      });
    }
  }

  async list(filters: ListExercisesFilters, scope: LibraryScope): Promise<ExerciseDto[]> {
    const context = await this.access.context();
    const exercises = await this.db.exercise.findMany({
      where: { ...exerciseListWhere(filters), ...libraryScopeWhere(scope, context.actorId) },
      include: EXERCISE_DETAIL_INCLUDE,
      orderBy: { title: "asc" },
    });
    return this.toDtos(exercises, context);
  }

  async get(id: string): Promise<ExerciseDto> {
    return this.toDto(await this.getReadableOrThrow(id));
  }

  /**
   * Le catalogue de métriques maison que les blocs de cet exercice peuvent citer : celui de son
   * PROPRIÉTAIRE (#605). Dans l'exercice de C, le sélecteur de M ne propose que celles de C.
   */
  async customMetricsOf(id: string): Promise<CustomMetric[]> {
    // Le propriétaire seul : documents, tags et décompte ne serviraient à rien ici.
    const exercise = await this.db.exercise.findFirst({ where: { id }, select: { coachId: true } });
    if (exercise == null) {
      throw new NotFoundException(EXERCISE_NOT_FOUND);
    }
    return this.metrics.catalogDtosOf(exercise.coachId);
  }

  /**
   * Remplace ce que la saisie envoie, à condition que l'exercice n'ait pas changé depuis qu'elle a
   * commencé (#604) — sinon 409 `STALE_WRITE`, et la base garde l'autre écriture.
   *
   * La version avance à CHAQUE écriture, tags seuls compris : ils font partie de l'exercice, et un
   * second onglet qui les réécrirait sans le savoir effacerait ceux du premier. D'où `updatedAt`
   * posé à la main — l'écriture conditionnelle peut n'avoir aucun autre champ à écrire. Les tags
   * suivent dans la même transaction : une écriture refusée n'en laisse rien.
   */
  async update(id: string, input: UpdateExerciseInput): Promise<ExerciseDto> {
    const { exercise: current, context } = await this.getForOrThrow(id, "write");
    const expected = new Date(input.expectedUpdatedAt);
    // Avant de valider les images de consigne contre un état que la saisie n'a pas vu.
    assertReadAtVersion(current.updatedAt, expected);
    assertInstructionImagesOwned(input.instructions, current.documents);
    // Lu une fois : la réponse résout les mêmes citations dans le même catalogue.
    let catalogOf: CatalogOf | undefined;
    if (input.blocks !== undefined) {
      catalogOf = await this.metrics.catalogOf([current.coachId]);
      assertCitesCatalog(input.blocks, parseBlocks(current.blocks), catalogOf(current.coachId));
    }
    const data: Prisma.ExerciseUpdateManyMutationInput = {};
    // Les deux ensemble, sous la MÊME garde : un titre modifié sans sa forme comparable laisserait
    // la ligne introuvable par l'ancien mot autant que par le nouveau, sans rien afficher d'anormal.
    if (input.title !== undefined) {
      data.title = input.title;
      data.titleSearch = comparableText(input.title);
    }
    if (input.description !== undefined) data.description = input.description;
    if (input.instructions !== undefined)
      data.instructions = toInstructionsInput(input.instructions);
    if (input.blocks !== undefined) data.blocks = toBlocksInput(input.blocks);

    const saved = await this.db.$transaction(async (tx) => {
      await writeAtVersion(tx.exercise, id, expected, data, EXERCISE_NOT_FOUND);
      if (input.tags !== undefined) await this.replaceTags(tx, id, input.tags);
      // Relu DANS la transaction : la ligne reste verrouillée par notre écriture, la réponse porte
      // donc NOTRE version. Relue après, elle pourrait déjà porter celle d'un autre Coach — et le
      // builder, qui garde une saisie faite pendant l'envoi, la citerait par-dessus lui.
      return this.getReadableOrThrow(id, tx);
    });
    return this.toDto(saved, context, catalogOf);
  }

  /**
   * Sous la version lue (#605, MC-8) : un rédacteur a pu changer l'exercice depuis, et le
   * propriétaire supprimerait ce qu'il n'a pas vu.
   */
  async delete(id: string, query: VersionQuery): Promise<void> {
    const { exercise } = await this.getForOrThrow(id, "delete");
    const expected = new Date(query.expectedUpdatedAt);
    // Avant le décompte des séances : un 409 « utilisé » sur un état périmé dirait le faux.
    assertReadAtVersion(exercise.updatedAt, expected);
    await this.assertUnused(exercise);

    // Un Coach qui lit l'exercice a pu le citer depuis le décompte : la clé étrangère refuse, et
    // le même 409 le dit plutôt qu'un 500.
    await explainForeignKeyViolation(
      () => deleteAtVersion(this.db.exercise, id, expected, EXERCISE_NOT_FOUND),
      () => this.assertUnused(exercise),
    );

    // Les lignes ExerciseDocument sont parties en cascade, mais PAS les objets en storage : on les
    // supprime explicitement, sinon ils resteraient orphelins (et facturés). Sauf ceux qu'une
    // séance planifiée affiche encore — ses copies partagent la clé objet (P3). APRÈS la
    // suppression : refusée, elle ne doit rien avoir purgé.
    for (const document of exercise.documents) {
      await this.cleanup.deleteObjectIfUnreferenced(document);
    }
  }

  /**
   * Changer les droits d'exercices (#605). Propriétaire seul ; refusé en 409 si un Coach dont une
   * séance cite l'exercice en perdait la lecture — sa séance citerait un exercice qu'il ne lit plus.
   */
  async changeAccess(input: ChangeAccessInput): Promise<ElementAccessDto[]> {
    const exercises = await this.db.exercise.findMany({
      where: { id: { in: input.ids } },
      include: ACCESS_INCLUDE,
    });
    await this.grants.assertCanShare(input, exercises);
    await this.assertNoCitationLosesRead(exercises, input.changes);
    return this.grants.apply("exerciseId", input);
  }

  /**
   * Les séances et les appartenances d'AUTRES Coachs, hors du scope de C : par le client de base,
   * sur les ids d'exercices que C vient de prouver siens. Seul un décompte en sort.
   */
  private async assertNoCitationLosesRead(
    exercises: readonly (AccessRow & { coachId: string })[],
    changes: ChangeAccessInput["changes"],
  ): Promise<void> {
    const citations = await this.prisma.sessionExercise.findMany({
      where: {
        exerciseId: { in: exercises.map((exercise) => exercise.id) },
        session: { coachId: { not: this.access.actorId() } },
      },
      select: { exerciseId: true, session: { select: { id: true, coachId: true } } },
    });
    if (citations.length === 0) return;

    const memberships = await this.prisma.organizationCoach.findMany({
      where: { coachId: { in: [...new Set(citations.map((c) => c.session.coachId))] } },
      select: { coachId: true, organizationId: true },
    });
    // Groupées une fois : chaque citation de chaque exercice y cherche son Coach.
    const byCoach = new Map<string, Set<string>>();
    for (const { coachId, organizationId } of memberships) {
      byCoach.set(coachId, (byCoach.get(coachId) ?? new Set()).add(organizationId));
    }
    const organizationsOf = (coachId: string) => byCoach.get(coachId) ?? new Set<string>();
    const losing = new Set(
      exercises.flatMap((exercise) =>
        citationsLosingRead(
          toGrantDtos(exercise.accessGrants),
          changes,
          citations
            .filter((citation) => citation.exerciseId === exercise.id)
            .map(({ session }) => ({ sessionId: session.id, coachId: session.coachId })),
          organizationsOf,
        ),
      ),
    );
    if (losing.size > 0) {
      throw new ConflictException(
        `Impossible de réduire cet accès : l'exercice est utilisé dans ${losing.size} séance(s) d'un autre coach`,
      );
    }
  }

  /**
   * SessionExercise.exercise est en onDelete: Restrict — la bibliothèque ne doit pas se vider sous
   * les séances qui s'en servent. On renvoie un 409 explicite plutôt que de laisser remonter une
   * violation de clé étrangère (500), et le client peut afficher le pourquoi.
   *
   * Les séances se comptent chez TOUS les Coachs (piège n°8, #605) : celle de M qui cite l'exercice
   * ouvert par C bloque la clé étrangère comme celle de C, mais le scope de C ne la voit pas. Par
   * le client de base, donc, sur l'id d'un exercice déjà prouvé lisible ; seul un décompte en sort.
   * C ne peut pas retirer l'exercice des séances de M : le message les compte à part. La copie
   * figée de #609 lèvera ce refus.
   */
  private async assertUnused(exercise: { id: string; coachId: string }): Promise<void> {
    const sessions = await this.prisma.session.findMany({
      where: { exercises: { some: { exerciseId: exercise.id } } },
      select: { coachId: true },
    });
    if (sessions.length === 0) return;
    const foreign = sessions.filter((session) => session.coachId !== exercise.coachId).length;
    throw new ConflictException(
      foreign === 0
        ? `Exercice utilisé dans ${sessions.length} séance(s) : retire-le d'abord de ces séances`
        : `Exercice utilisé dans ${sessions.length} séance(s), dont ${foreign} d'un autre coach`,
    );
  }
}
