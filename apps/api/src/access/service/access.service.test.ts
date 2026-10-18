import { ForbiddenException } from "@nestjs/common";
import type { ClsService } from "nestjs-cls";
import { describe, expect, it, vi } from "vitest";
import type { UserDirectoryService } from "../../account/service/user-directory.service";
import type { PrismaService } from "../../infra/prisma/prisma.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import type { AccessRow, AccessView } from "../access.mapper";
import { type AccessGesture, AccessService } from "./access.service";

const view = (level: AccessView["myAccess"]["level"]): AccessView => ({
  owner: { id: "c", name: "C" },
  myAccess: { level, via: null },
  grants: null,
  coachGrants: null,
});

function serviceWith(
  memberships: string[],
  members: { organizationId: string; coachId: string }[],
) {
  const db = {
    organizationCoach: {
      findMany: vi
        .fn()
        .mockResolvedValue(memberships.map((organizationId) => ({ organizationId }))),
    },
  } as unknown as TenantPrisma;
  const findMembers = vi.fn().mockResolvedValue(members);
  const prisma = { organizationCoach: { findMany: findMembers } } as unknown as PrismaService;
  const names = new Map([
    ["org-g", "Grimpe"],
    ["org-b", "Bloc"],
    ["c", "Camille"],
    ["m", "Max"],
  ]);
  const users = {
    namesByIds: vi.fn().mockResolvedValue(names),
  } as unknown as UserDirectoryService;
  // Max, Coach de ce qu'on lui passe : l'acteur courant tel que la requête le pose.
  const cls = { get: () => ({ userId: "m" }) } as unknown as ClsService;
  return { service: new AccessService(db, prisma, cls, users), findMembers };
}

describe("AccessService.assertCan", () => {
  const { service } = serviceWith([], []);

  it.each([
    ["write", "WRITE"],
    ["write", "OWNER"],
    ["delete", "OWNER"],
    ["share", "OWNER"],
    ["duplicate", "OWNER"],
  ] as const)("%s est permis à %s", (gesture, level) => {
    expect(() => service.assertCan(view(level), gesture)).not.toThrow();
  });

  it.each([
    ["write", "READ"],
    ["delete", "WRITE"],
    ["share", "WRITE"],
    ["duplicate", "WRITE"],
    ["delete", "READ"],
  ] as [
    AccessGesture,
    AccessView["myAccess"]["level"],
  ][])("%s est refusé à %s (403)", (gesture, level) => {
    expect(() => service.assertCan(view(level), gesture)).toThrow(ForbiddenException);
  });
});

describe("AccessService.myOrganizations", () => {
  it("sans entreprise, ne lit personne d'autre", async () => {
    const { service, findMembers } = serviceWith([], []);
    await expect(service.myOrganizations()).resolves.toEqual([]);
    expect(findMembers).not.toHaveBeenCalled();
  });

  it("rend chaque entreprise avec ses Coachs, triées par nom", async () => {
    const { service, findMembers } = serviceWith(
      ["org-g", "org-b"],
      [
        { organizationId: "org-g", coachId: "c" },
        { organizationId: "org-b", coachId: "m" },
        { organizationId: "org-g", coachId: "m" },
      ],
    );

    await expect(service.myOrganizations()).resolves.toEqual([
      { id: "org-b", name: "Bloc", coaches: [{ coachId: "m", name: "Max" }] },
      {
        id: "org-g",
        name: "Grimpe",
        coaches: [
          { coachId: "c", name: "Camille" },
          { coachId: "m", name: "Max" },
        ],
      },
    ]);
    // Les collègues, sur les seules entreprises dont l'acteur est membre.
    expect(findMembers).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: { in: ["org-g", "org-b"] } } }),
    );
  });
});

describe("AccessService.loadFor", () => {
  const voie: AccessRow = {
    id: "voie",
    coach: { id: "c", name: "Camille" },
    accessGrants: [
      { level: "READ", organization: { id: "org-f", user: { name: "F" } }, coach: null },
    ],
  };

  it("rend l'élément et le contexte quand le droit couvre le geste", async () => {
    const { service } = serviceWith(["org-f"], []);
    const writable: AccessRow = {
      ...voie,
      accessGrants: [
        { level: "WRITE", organization: { id: "org-f", user: { name: "F" } }, coach: null },
      ],
    };
    const { row, context } = await service.loadFor(Promise.resolve(writable), "write");
    expect(row).toBe(writable);
    expect(context).toEqual({ actorId: "m", organizationIds: new Set(["org-f"]) });
  });

  it("403 quand le droit lu ne couvre pas le geste", async () => {
    const { service } = serviceWith(["org-f"], []);
    await expect(service.loadFor(Promise.resolve(voie), "write")).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("laisse passer le 404 que la lecture a levé", async () => {
    const { service } = serviceWith([], []);
    const missing = Promise.reject(new Error("introuvable"));
    await expect(service.loadFor(missing, "write")).rejects.toThrow("introuvable");
  });
});
