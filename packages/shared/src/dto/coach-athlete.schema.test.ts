import { describe, expect, it } from "vitest";
import {
  CoachAthleteStatus,
  coachAthleteDtoSchema,
  counterpartsDtoSchema,
  SELF_RELATION_ID,
  UNKNOWN_COUNTERPARTS,
} from "./coach-athlete.schema";

describe("CoachAthleteStatus", () => {
  // Miroir de l'enum Prisma `CoachAthleteStatus` : une valeur de plus ou de moins d'un seul côté
  // ferait refuser par le schéma une relation que la base, elle, accepte.
  it("porte exactement les statuts de l'enum en base", () => {
    expect(Object.values(CoachAthleteStatus)).toEqual(["PENDING", "ACTIVE"]);
  });
});

describe("coachAthleteDtoSchema", () => {
  const relation = {
    id: "rel_1",
    coachId: "coach_1",
    coachName: "Camille",
    athleteId: "ath_1",
    athleteName: "Noa",
    status: CoachAthleteStatus.ACTIVE,
    invitedAt: "2026-09-01T10:00:00.000Z",
    joinedAt: "2026-09-02T10:00:00.000Z",
    isSelf: false,
  };

  it("valide une relation active", () => {
    expect(coachAthleteDtoSchema.parse(relation)).toEqual(relation);
  });

  // `null` = pas encore rejointe (PENDING) : une absence réelle, pas une date inconnue.
  it("accepte une relation pas encore rejointe", () => {
    const pending = { ...relation, status: CoachAthleteStatus.PENDING, joinedAt: null };
    expect(coachAthleteDtoSchema.parse(pending)).toEqual(pending);
  });

  it("refuse un statut inconnu", () => {
    expect(coachAthleteDtoSchema.safeParse({ ...relation, status: "REVOKED" }).success).toBe(false);
  });

  it("refuse une relation sans drapeau d'auto-coaching", () => {
    const { isSelf: _isSelf, ...withoutFlag } = relation;
    expect(coachAthleteDtoSchema.safeParse(withoutFlag).success).toBe(false);
  });
});

describe("SELF_RELATION_ID", () => {
  /**
   * L'identifiant réservé de l'auto-coaching est lu par l'API qui le produit et par les écrans qui
   * le reconnaissent. Il ne doit pas pouvoir se confondre avec un `cuid` réel, ni être vide.
   */
  it("est un identifiant réservé, lisible et non vide", () => {
    expect(SELF_RELATION_ID).toBe("self");
  });
});

describe("counterpartsDtoSchema", () => {
  it("exige les deux drapeaux", () => {
    expect(counterpartsDtoSchema.safeParse({ asCoach: true, asAthlete: false }).success).toBe(true);
    expect(counterpartsDtoSchema.safeParse({ asCoach: true }).success).toBe(false);
  });
});

describe("UNKNOWN_COUNTERPARTS", () => {
  /**
   * « Pas encore su » ne vaut jamais « absent » : tant que la réponse n'est pas là, la navigation
   * montre les deux espaces. Un repli à `false` cacherait la messagerie le temps d'un aller-retour.
   */
  it("suppose une contrepartie des deux côtés", () => {
    expect(counterpartsDtoSchema.parse(UNKNOWN_COUNTERPARTS)).toEqual({
      asCoach: true,
      asAthlete: true,
    });
  });
});
