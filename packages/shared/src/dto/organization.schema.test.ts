import { describe, expect, it } from "vitest";
import {
  organizationCoachDtoSchema,
  pendingOrganizationInvitationDtoSchema,
} from "./organization.schema";

const MEMBER = {
  coachId: "u_coach",
  name: "Claire Dumas",
  email: "claire@example.com",
  joinedAt: "2026-03-12T09:00:00.000Z",
};

const PENDING = {
  id: "inv_1",
  organizationName: "Fontainebleau Escalade",
  expiresAt: "2026-10-16T09:00:00.000Z",
  createdAt: "2026-10-09T09:00:00.000Z",
};

describe("organizationCoachDtoSchema", () => {
  it("accepte un membre complet", () => {
    expect(organizationCoachDtoSchema.safeParse(MEMBER).success).toBe(true);
  });

  // Un membre sans nom signale une donnée incohérente, il ne s'affiche pas en blanc (règle n°5).
  it("refuse un membre sans nom", () => {
    expect(organizationCoachDtoSchema.safeParse({ ...MEMBER, name: null }).success).toBe(false);
  });
});

describe("pendingOrganizationInvitationDtoSchema", () => {
  it("accepte une invitation nommée", () => {
    expect(pendingOrganizationInvitationDtoSchema.safeParse(PENDING).success).toBe(true);
  });

  it("refuse une invitation dont l'entreprise ne se nomme pas", () => {
    expect(
      pendingOrganizationInvitationDtoSchema.safeParse({ ...PENDING, organizationName: null })
        .success,
    ).toBe(false);
  });
});
