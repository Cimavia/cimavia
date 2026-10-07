import { describe, expect, it } from "vitest";
import {
  createInvitationSchema,
  createOrganizationInvitationSchema,
  InvitationRole,
  InvitationStatus,
  invitationDtoSchema,
  organizationInvitationQuerySchema,
  pendingInvitationDtoSchema,
} from "./invitation.schema";

const INVITATION = {
  id: "inv_1",
  email: "lea@example.com",
  status: InvitationStatus.PENDING,
  role: InvitationRole.ATHLETE,
  expiresAt: "2026-09-12T09:00:00.000Z",
  createdAt: "2026-09-05T09:00:00.000Z",
};

describe("InvitationStatus", () => {
  /**
   * `DECLINED` et `REVOKED` sont deux valeurs distinctes, et ce test fige la décision de #146 :
   * « le coach a annulé » et « l'athlète a dit non » ne se remplacent pas. Les fondre ferait
   * perdre au coach la seule information qui l'intéresse — et rien, ni au typecheck ni au schéma,
   * ne signalerait la perte.
   */
  it("distingue le refus de l'athlète de la révocation du coach", () => {
    expect(InvitationStatus.DECLINED).not.toBe(InvitationStatus.REVOKED);
    const values = Object.values(InvitationStatus);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("createInvitationSchema", () => {
  /**
   * L'adresse est requise (#390) : une invitation sans adresse n'apparaîtrait à personne, et le
   * code qu'on transmettait de la main à la main n'existe plus.
   */
  it("exige une adresse", () => {
    expect(createInvitationSchema.safeParse({ email: "lea@example.com" }).success).toBe(true);
    expect(createInvitationSchema.safeParse({}).success).toBe(false);
  });

  it("refuse une adresse vide ou malformée", () => {
    expect(createInvitationSchema.safeParse({ email: "" }).success).toBe(false);
    expect(createInvitationSchema.safeParse({ email: "lea@" }).success).toBe(false);
  });

  it("refuse un champ que l'API ne lira pas", () => {
    expect(
      createInvitationSchema.safeParse({ email: "lea@example.com", coachId: "u_1" }).success,
    ).toBe(false);
  });
});

describe("createOrganizationInvitationSchema", () => {
  // Le rôle est requis (#602) : l'invitation dit ce qu'elle propose, sinon elle s'accepterait
  // depuis le mauvais écran.
  it("exige une adresse et un rôle connu", () => {
    const valid = { email: "lea@example.com", role: InvitationRole.ATHLETE };
    expect(createOrganizationInvitationSchema.safeParse(valid).success).toBe(true);
    expect(createOrganizationInvitationSchema.safeParse({ email: valid.email }).success).toBe(
      false,
    );
    expect(createOrganizationInvitationSchema.safeParse({ role: valid.role }).success).toBe(false);
    expect(createOrganizationInvitationSchema.safeParse({ ...valid, role: "OWNER" }).success).toBe(
      false,
    );
    expect(
      createOrganizationInvitationSchema.safeParse({ ...valid, organizationId: "f" }).success,
    ).toBe(false);
  });
});

describe("organizationInvitationQuerySchema", () => {
  it("exige un rôle, et lui seul", () => {
    expect(organizationInvitationQuerySchema.safeParse({ role: "COACH" }).success).toBe(true);
    expect(organizationInvitationQuerySchema.safeParse({}).success).toBe(false);
    expect(
      organizationInvitationQuerySchema.safeParse({ role: "COACH", status: "PENDING" }).success,
    ).toBe(false);
  });
});

describe("invitationDtoSchema", () => {
  // Plus d'invitation générique (#390) : une invitation sans adresse est une donnée incohérente.
  it("refuse une invitation sans adresse", () => {
    expect(invitationDtoSchema.safeParse({ ...INVITATION, email: null }).success).toBe(false);
  });

  // Le code ne verrouille plus rien depuis #390 : il sort du contrat, pas seulement de l'écran.
  it("ne décrit plus de code", () => {
    expect(Object.keys(invitationDtoSchema.shape)).not.toContain("code");
  });

  it("accepte une invitation refusée", () => {
    const result = invitationDtoSchema.safeParse({
      ...INVITATION,
      status: InvitationStatus.DECLINED,
    });
    expect(result.success).toBe(true);
  });

  // Le rôle proposé est lu par l'entreprise pour ranger ses invitations (#601) : il ne se devine pas.
  it("exige un rôle connu", () => {
    expect(
      invitationDtoSchema.safeParse({ ...INVITATION, role: InvitationRole.COACH }).success,
    ).toBe(true);
    const { role: _omitted, ...withoutRole } = INVITATION;
    expect(invitationDtoSchema.safeParse(withoutRole).success).toBe(false);
    expect(invitationDtoSchema.safeParse({ ...INVITATION, role: "ADMIN" }).success).toBe(false);
  });

  it("refuse un statut inconnu et une échéance qui n'est pas une date ISO", () => {
    expect(invitationDtoSchema.safeParse({ ...INVITATION, status: "EXPIRED" }).success).toBe(false);
    expect(invitationDtoSchema.safeParse({ ...INVITATION, expiresAt: "demain" }).success).toBe(
      false,
    );
  });
});

describe("pendingInvitationDtoSchema", () => {
  const PENDING = {
    id: "inv_1",
    issuer: { kind: "coach", name: "Marc Keller" },
    expiresAt: "2026-09-12T09:00:00.000Z",
    createdAt: "2026-09-05T09:00:00.000Z",
  };
  const FROM_ORGANIZATION = {
    ...PENDING,
    issuer: { kind: "organization", name: "Fontainebleau Escalade", coachNames: ["Camille"] },
  };

  it("accepte l'invitation telle que l'athlète la reçoit, d'un Coach ou d'une entreprise", () => {
    expect(pendingInvitationDtoSchema.safeParse(PENDING).success).toBe(true);
    expect(pendingInvitationDtoSchema.safeParse(FROM_ORGANIZATION).success).toBe(true);
  });

  /**
   * Le CONTRAT, figé par son jeu de clés. Deux champs sont volontairement absents et le resteront :
   * `email` (c'est la sienne, la liste ne contient que ce qui lui est adressé) et l'id de
   * l'émetteur, qui ferait de cette route un annuaire de ceux qui invitent. Les ajouter doit être
   * un geste délibéré, pas la conséquence d'un copier-coller depuis `InvitationDto`.
   */
  it("ne décrit que ce que l'athlète a besoin de savoir", () => {
    expect(Object.keys(pendingInvitationDtoSchema.shape).sort()).toEqual([
      "createdAt",
      "expiresAt",
      "id",
      "issuer",
    ]);
  });

  /**
   * Le nom est requis, comme sur `CoachAthleteDto` : proposer « quelqu'un t'invite » sans savoir
   * qui serait un fallback silencieux au sens de la règle dure n°5. Un nom introuvable signale une
   * donnée incohérente — le mapper lève, il ne rend pas un blanc.
   */
  it("refuse une invitation dont l'émetteur n'est pas nommable", () => {
    const unnamed = { ...PENDING, issuer: { kind: "coach", name: null } };
    expect(pendingInvitationDtoSchema.safeParse(unnamed).success).toBe(false);
    const { issuer: _omitted, ...withoutIssuer } = PENDING;
    expect(pendingInvitationDtoSchema.safeParse(withoutIssuer).success).toBe(false);
  });

  // Une liste VIDE dit « pas encore de Coach » ; son absence ne dirait rien, elle est refusée.
  it("exige la liste des Coachs d'une entreprise, vide comprise", () => {
    const empty = { ...FROM_ORGANIZATION, issuer: { ...FROM_ORGANIZATION.issuer, coachNames: [] } };
    expect(pendingInvitationDtoSchema.safeParse(empty).success).toBe(true);
    const { coachNames: _omitted, ...withoutCoaches } = FROM_ORGANIZATION.issuer;
    expect(
      pendingInvitationDtoSchema.safeParse({ ...FROM_ORGANIZATION, issuer: withoutCoaches })
        .success,
    ).toBe(false);
  });
});
