import { describe, expect, it } from "vitest";
import {
  acceptInvitationSchema,
  createInvitationSchema,
  declineInvitationSchema,
  InvitationStatus,
  invitationDtoSchema,
  pendingInvitationDtoSchema,
} from "./invitation.schema";

const INVITATION = {
  id: "inv_1",
  code: "7QK4M2XZ9",
  email: "lea@example.com",
  status: InvitationStatus.PENDING,
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
  // Champ vide = lien générique, acceptable par n'importe quel athlète non lié. C'est un cas
  // NORMAL de l'émission, pas une saisie incomplète.
  it("accepte une invitation sans adresse — c'est le lien générique", () => {
    expect(createInvitationSchema.safeParse({}).success).toBe(true);
  });

  /**
   * La chaîne vide est refusée, et c'est ce qui compte : le formulaire du coach doit envoyer
   * `{}` quand le champ n'est pas rempli, jamais `{ email: "" }`. Sans ce refus, une invitation
   * porterait une adresse vide — ni nominative, ni générique.
   */
  it("refuse une adresse vide ou malformée, plutôt que de la prendre pour un lien générique", () => {
    expect(createInvitationSchema.safeParse({ email: "" }).success).toBe(false);
    expect(createInvitationSchema.safeParse({ email: "lea@" }).success).toBe(false);
  });

  it("refuse un champ que l'API ne lira pas", () => {
    expect(
      createInvitationSchema.safeParse({ email: "lea@example.com", coachId: "u_1" }).success,
    ).toBe(false);
  });
});

describe("acceptInvitationSchema · declineInvitationSchema", () => {
  /**
   * Deux transitions, deux schémas — même forme aujourd'hui. Le test les traite ensemble parce
   * que c'est exactement ce qu'on veut garantir : ce qu'un client peut accepter, il peut le
   * refuser, avec le même code et sans rien de plus à saisir.
   */
  it.each([
    ["accept", acceptInvitationSchema],
    ["decline", declineInvitationSchema],
  ])("%s exige un code non vide", (_name, schema) => {
    expect(schema.safeParse({ code: "7QK4M2XZ9" }).success).toBe(true);
    expect(schema.safeParse({ code: "" }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  // Le refus ne se distingue pas par une adresse envoyée avec : elle vient de la SESSION, jamais
  // du corps. Un `email` accepté ici ferait de la route un moyen de refuser au nom d'autrui.
  it("refuse une adresse passée dans le corps du refus", () => {
    const result = declineInvitationSchema.safeParse({
      code: "7QK4M2XZ9",
      email: "quelquun@example.com",
    });
    expect(result.success).toBe(false);
  });
});

describe("invitationDtoSchema", () => {
  // `email` nullable veut dire « lien générique », pas « adresse manquante » : le `null` porte du
  // sens et doit passer le schéma.
  it("accepte une invitation générique, dont l'absence d'adresse est le sujet", () => {
    const result = invitationDtoSchema.safeParse({ ...INVITATION, email: null });
    expect(result.success).toBe(true);
  });

  it("accepte une invitation refusée", () => {
    const result = invitationDtoSchema.safeParse({
      ...INVITATION,
      status: InvitationStatus.DECLINED,
    });
    expect(result.success).toBe(true);
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
    code: "7QK4M2XZ9",
    coachName: "Marc Keller",
    expiresAt: "2026-09-12T09:00:00.000Z",
    createdAt: "2026-09-05T09:00:00.000Z",
  };

  it("accepte l'invitation telle que l'athlète la reçoit", () => {
    expect(pendingInvitationDtoSchema.safeParse(PENDING).success).toBe(true);
  });

  /**
   * Le CONTRAT, figé par son jeu de clés. Deux champs sont volontairement absents et le resteront :
   * `email` (c'est la sienne, la liste ne contient que ce qui lui est adressé) et `coachId`, qui
   * ferait de cette route un annuaire des coachs qui invitent. Les ajouter doit être un geste
   * délibéré, pas la conséquence d'un copier-coller depuis `InvitationDto`.
   */
  it("ne décrit que ce que l'athlète a besoin de savoir", () => {
    expect(Object.keys(pendingInvitationDtoSchema.shape).sort()).toEqual([
      "coachName",
      "code",
      "createdAt",
      "expiresAt",
      "id",
    ]);
  });

  /**
   * `coachName` est requis, comme sur `CoachAthleteDto` : proposer « quelqu'un t'invite » sans
   * savoir qui serait un fallback silencieux au sens de la règle dure n°5. Un nom introuvable
   * signale une donnée incohérente — le mapper lève, il ne rend pas un blanc.
   */
  it("refuse une invitation dont l'émetteur n'est pas nommable", () => {
    expect(pendingInvitationDtoSchema.safeParse({ ...PENDING, coachName: null }).success).toBe(
      false,
    );
    const { coachName: _omitted, ...withoutName } = PENDING;
    expect(pendingInvitationDtoSchema.safeParse(withoutName).success).toBe(false);
  });
});
