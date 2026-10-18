import { CoachAthleteStatus } from "@cmv/shared";
import type { ClsService } from "nestjs-cls";
import { describe, expect, it, vi } from "vitest";
import type { AccessService } from "../../access/service/access.service";
import type { UserDirectoryService } from "../../account/service/user-directory.service";
import type { PrismaService } from "../../infra/prisma/prisma.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import type { TenantContext } from "../../tenancy/tenant-context.type";
import { ConversationCandidateService } from "./conversation-candidate.service";

const actorOf = (userId: string, exercised: "coach" | "athlete"): TenantContext => ({
  userId,
  capabilities: { isCoach: true, isAthlete: true, isCompany: false },
  exercised,
});

const NAMES = new Map([
  ["c1", "Chloé"],
  ["m1", "Marc"],
  ["z1", "Zoé"],
  ["te", "Théo"],
  ["ti", "Inès"],
  ["org-f", "Forme & Co"],
]);

type Setup = {
  actor: TenantContext;
  // Les liens actifs que le scope de l'acteur rend.
  links?: { coachId?: string; athleteId?: string; organizationId?: string | null }[];
  organizations?: { id: string; name: string; coaches: { coachId: string; name: string }[] }[];
  // Les liens des collègues, lus par le client de base.
  colleagueLinks?: { coachId: string; athleteId: string }[];
};

function build(setup: Setup) {
  const scopedLinks = vi.fn().mockResolvedValue(setup.links ?? []);
  // Ne rend que les noms DEMANDÉS : un id mal passé se voit, il ne trouve pas son nom.
  const namesByIds = vi.fn(
    async (ids: string[]) =>
      new Map(ids.flatMap((id) => (NAMES.has(id) ? [[id, NAMES.get(id) as string]] : []))),
  );
  const myOrganizations = vi.fn().mockResolvedValue(setup.organizations ?? []);
  const baseLinks = vi.fn().mockResolvedValue(setup.colleagueLinks ?? []);
  const service = new ConversationCandidateService(
    { coachAthlete: { findMany: scopedLinks } } as unknown as TenantPrisma,
    { coachAthlete: { findMany: baseLinks } } as unknown as PrismaService,
    { myOrganizations } as unknown as AccessService,
    { namesByIds } as unknown as UserDirectoryService,
    { get: () => setup.actor } as unknown as ClsService,
  );
  return { service, scopedLinks, baseLinks, namesByIds, myOrganizations };
}

// L'entreprise F réunit C, M et Z (#593).
const F = {
  id: "org-f",
  name: "Forme & Co",
  coaches: [
    { coachId: "c1", name: "Chloé" },
    { coachId: "m1", name: "Marc" },
    { coachId: "z1", name: "Zoé" },
  ],
};

describe("ConversationCandidateService — côté athlète", () => {
  it("rend ses Coachs actifs, chacun avec l'entreprise dont le lien est né", async () => {
    const { service, scopedLinks } = build({
      actor: actorOf("ti", "athlete"),
      links: [
        { coachId: "m1", organizationId: "org-f" },
        { coachId: "c1", organizationId: null },
      ],
    });

    await expect(service.list()).resolves.toEqual({
      athletes: [],
      coaches: [
        { userId: "c1", name: "Chloé", organizationNames: [], followedAthleteIds: null },
        { userId: "m1", name: "Marc", organizationNames: ["Forme & Co"], followedAthleteIds: null },
      ],
    });
    expect(scopedLinks).toHaveBeenCalledWith({
      where: { status: CoachAthleteStatus.ACTIVE },
      select: { coachId: true, organizationId: true },
    });
  });

  it("atteint ses Coachs, et eux seuls", async () => {
    const { service } = build({ actor: actorOf("ti", "athlete"), links: [{ coachId: "m1" }] });

    await expect(service.reachesAll([{ userId: "m1", capability: "COACH" }])).resolves.toBe(true);
    await expect(service.reachesAll([{ userId: "c1", capability: "COACH" }])).resolves.toBe(false);
  });

  // Un athlète ne réunit pas d'athlètes : il n'en lit aucun.
  it("n'atteint aucun athlète", async () => {
    const { service } = build({ actor: actorOf("ti", "athlete"), links: [{ coachId: "c1" }] });

    await expect(service.reachesAll([{ userId: "te", capability: "ATHLETE" }])).resolves.toBe(
      false,
    );
  });
});

describe("ConversationCandidateService — côté Coach", () => {
  it("rend ses athlètes et ses collègues, avec ceux de SES athlètes qu'ils suivent", async () => {
    const { service, baseLinks } = build({
      actor: actorOf("c1", "coach"),
      links: [{ athleteId: "te" }, { athleteId: "ti" }],
      organizations: [F],
      colleagueLinks: [
        { coachId: "m1", athleteId: "ti" },
        { coachId: "m1", athleteId: "te" },
      ],
    });

    await expect(service.list()).resolves.toEqual({
      athletes: [
        { userId: "ti", name: "Inès" },
        { userId: "te", name: "Théo" },
      ],
      coaches: [
        {
          userId: "m1",
          name: "Marc",
          organizationNames: ["Forme & Co"],
          followedAthleteIds: ["ti", "te"],
        },
        { userId: "z1", name: "Zoé", organizationNames: ["Forme & Co"], followedAthleteIds: [] },
      ],
    });
    // Bornée aux collègues prouvés et aux athlètes que le scope rend — jamais au-delà.
    expect(baseLinks).toHaveBeenCalledExactlyOnceWith({
      where: {
        coachId: { in: ["m1", "z1"] },
        athleteId: { in: ["te", "ti"] },
        status: CoachAthleteStatus.ACTIVE,
      },
      select: { coachId: true, athleteId: true },
    });
  });

  it("nomme toutes les entreprises qu'un collègue partage avec lui", async () => {
    const { service } = build({
      actor: actorOf("c1", "coach"),
      organizations: [
        F,
        { id: "org-g", name: "Grimpe", coaches: [{ coachId: "m1", name: "Marc" }] },
      ],
    });

    const { coaches } = await service.list();

    expect(coaches.find((coach) => coach.userId === "m1")?.organizationNames).toEqual([
      "Forme & Co",
      "Grimpe",
    ]);
  });

  it("ne lit aucun lien de collègue sans athlète ni collègue", async () => {
    const { service, baseLinks } = build({ actor: actorOf("c1", "coach"), organizations: [F] });

    const { coaches } = await service.list();

    expect(coaches.map((coach) => coach.followedAthleteIds)).toEqual([[], []]);
    expect(baseLinks).not.toHaveBeenCalled();
  });

  it("se retire de ses collègues", async () => {
    const { service } = build({ actor: actorOf("c1", "coach"), organizations: [F] });

    const { coaches } = await service.list();

    expect(coaches.map((coach) => coach.userId)).not.toContain("c1");
  });

  // La garde ne paie ni les noms ni les suivis : elle passe à chaque ouverture de fil.
  it("vérifie sans rien lire de ce que seul l'affichage demande", async () => {
    const { service, baseLinks, namesByIds, myOrganizations } = build({
      actor: actorOf("c1", "coach"),
      links: [{ athleteId: "te" }],
      organizations: [F],
    });

    await service.reachesAll([{ userId: "te", capability: "ATHLETE" }]);

    expect(myOrganizations).not.toHaveBeenCalled();
    expect(namesByIds).not.toHaveBeenCalled();
    expect(baseLinks).not.toHaveBeenCalled();
  });

  it("atteint ses athlètes et ses collègues, chacun à son titre seulement", async () => {
    const { service } = build({
      actor: actorOf("c1", "coach"),
      links: [{ athleteId: "te" }],
      organizations: [F],
    });

    await expect(
      service.reachesAll([
        { userId: "te", capability: "ATHLETE" },
        { userId: "m1", capability: "COACH" },
      ]),
    ).resolves.toBe(true);
    // M est un collègue, pas un athlète suivi : le titre compte.
    await expect(service.reachesAll([{ userId: "m1", capability: "ATHLETE" }])).resolves.toBe(
      false,
    );
    await expect(service.reachesAll([{ userId: "inconnu", capability: "COACH" }])).resolves.toBe(
      false,
    );
    // Lui-même, membre de F, n'est pas son propre collègue.
    await expect(service.reachesAll([{ userId: "c1", capability: "COACH" }])).resolves.toBe(false);
  });
});
