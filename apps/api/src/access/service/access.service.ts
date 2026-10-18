import { type CoachOrganizationDto, canWrite, MyAccessLevel, required } from "@cmv/shared";
import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { UserDirectoryService } from "../../account/service/user-directory.service";
import { PrismaService } from "../../infra/prisma/prisma.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { currentActor } from "../../tenancy/tenant-context.type";
import {
  type AccessContext,
  type AccessRow,
  type AccessView,
  toAccessView,
} from "../access.mapper";

/**
 * Un geste au-delà de la lecture. `write` modifie le contenu (Écriture suffit) ; les autres sont
 * réservés au propriétaire : supprimer, gérer les accès, dupliquer en variante — la variante
 * d'un autre citerait des métriques absentes du catalogue de qui la crée (écart de #605, #609) —,
 * et réaffecter une planification à un autre athlète (#607), qui en change l'audience.
 */
export type AccessGesture = "write" | "delete" | "share" | "duplicate" | "reassign";

const DENIED: Record<AccessGesture, string> = {
  write: "Accès en lecture seule : tu ne peux pas modifier cet élément",
  delete: "Seul le propriétaire peut supprimer cet élément",
  share: "Seul le propriétaire peut gérer les accès de cet élément",
  duplicate: "Seul le propriétaire peut dupliquer cet exercice en variante",
  reassign: "Seul le propriétaire peut confier cette planification à un autre athlète",
};

/**
 * Les droits d'accès de la bibliothèque, vus de l'acteur (#605). La couche d'isolation dit ce qu'il
 * peut LIRE ; ce service dit ce qu'il peut en FAIRE, pour le DTO et pour les codes : 404 sur un
 * élément illisible (la lecture scopée l'a déjà dit), 403 sur un geste que son droit ne couvre pas.
 */
@Injectable()
export class AccessService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly users: UserDirectoryService,
  ) {}

  actorId(): string {
    return currentActor(this.cls).userId;
  }

  /** L'acteur et ses entreprises, lus une fois pour toute une page d'éléments. */
  async context(): Promise<AccessContext> {
    return {
      actorId: this.actorId(),
      organizationIds: new Set(await this.organizationIds()),
    };
  }

  /**
   * 403 si le droit de l'acteur ne couvre pas le geste. L'élément est déjà prouvé lisible : un
   * élément illisible a pris son 404 à la lecture, et ne dit rien de son existence.
   */
  assertCan(view: AccessView, gesture: AccessGesture): void {
    const allowed =
      gesture === "write" ? canWrite(view.myAccess) : view.myAccess.level === MyAccessLevel.OWNER;
    if (!allowed) throw new ForbiddenException(DENIED[gesture]);
  }

  /**
   * L'élément que `load` lit par le scope (404 s'il est illisible, à `load` de le lever), et le
   * contexte de l'acteur, lus ensemble ; puis 403 si son droit ne couvre pas le geste.
   */
  async loadFor<T extends AccessRow>(
    load: Promise<T>,
    gesture: AccessGesture,
  ): Promise<{ row: T; context: AccessContext }> {
    const [row, context] = await Promise.all([load, this.context()]);
    this.assertCan(toAccessView(row, context), gesture);
    return { row, context };
  }

  /**
   * Les entreprises du Coach courant et leurs Coachs, lui compris : les lignes du panneau des
   * accès (#597). Liste vide = aucune entreprise, et le web n'affiche rien du partage.
   *
   * Ses collègues sont hors de son scope — un Coach ne lit que sa propre ligne d'appartenance. Ils
   * se lisent donc par le client de BASE, sur les seules entreprises dont il vient d'être prouvé
   * membre par une lecture scopée : jamais un id reçu du client.
   */
  async myOrganizations(): Promise<CoachOrganizationDto[]> {
    const organizations = await this.organizationsOf(await this.organizationIds());
    if (organizations.length === 0) return [];

    const names = await this.users.namesByIds(
      organizations.flatMap(({ id, coaches }) => [id, ...coaches.map((coach) => coach.coachId)]),
    );
    const nameOf = (id: string) => required(names.get(id), `[access] compte ${id} sans nom`);

    return organizations
      .map(({ id, coaches }) => ({
        id,
        name: nameOf(id),
        coaches: coaches.map(({ coachId }) => ({ coachId, name: nameOf(coachId) })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  /**
   * Des entreprises et leurs Coachs, sans les noms : de quoi juger d'une éligibilité (#607). Les
   * `organizationIds` sont celles de l'acteur, lues par son scope (`context`) — leurs membres, eux,
   * ne sont pas à lui, d'où le client de base.
   */
  async organizationsOf(
    organizationIds: Iterable<string>,
  ): Promise<{ id: string; coaches: { coachId: string }[] }[]> {
    const ids = [...organizationIds];
    if (ids.length === 0) return [];
    const members = await this.prisma.organizationCoach.findMany({
      where: { organizationId: { in: ids } },
      select: { organizationId: true, coachId: true },
      orderBy: { createdAt: "asc" },
    });
    return ids.map((id) => ({
      id,
      coaches: members
        .filter((member) => member.organizationId === id)
        .map((member) => ({ coachId: member.coachId })),
    }));
  }

  // Scopé au Coach courant (`coachOwner`) : ses seules appartenances.
  private async organizationIds(): Promise<string[]> {
    const memberships = await this.db.organizationCoach.findMany({
      select: { organizationId: true },
    });
    return memberships.map((membership) => membership.organizationId);
  }
}
