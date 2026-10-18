import { describe, expect, it } from "vitest";
import type { TenantContext } from "../tenancy/tenant-context.type";
import {
  actorMemberOf,
  byName,
  conversationKindOf,
  directMembers,
  participantCapabilityOf,
  participantKeyOf,
  trainingCapabilityOf,
} from "./participant-key";

const coach = (userId: string) => ({ userId, capability: "COACH" as const });
const athlete = (userId: string) => ({ userId, capability: "ATHLETE" as const });

describe("participantKeyOf", () => {
  // La forme que la migration a écrite pour chaque fil existant : la clé doit y retomber.
  it("écrit un fil coach ↔ athlète comme la migration, athlète d'abord", () => {
    expect(participantKeyOf([coach("c1"), athlete("a1")])).toBe("ATHLETE:a1|COACH:c1");
  });

  it("ne dépend pas de l'ordre dans lequel on nomme les participants", () => {
    expect(participantKeyOf([coach("m"), athlete("ti"), coach("c")])).toBe(
      participantKeyOf([coach("c"), coach("m"), athlete("ti")]),
    );
  });

  // Un compte à double capacité : coach de TI, ou athlète de TI — deux fils distincts.
  it("distingue la même personne réunie à deux titres différents", () => {
    expect(participantKeyOf([coach("u"), athlete("ti")])).not.toBe(
      participantKeyOf([athlete("u"), coach("ti")]),
    );
  });

  // Le tri d'une locale placerait la minuscule avant la majuscule : la base, elle, ne trie pas.
  it("trie par unités de code, sans locale", () => {
    expect(participantKeyOf([coach("b"), coach("B"), coach("a")])).toBe("COACH:B|COACH:a|COACH:b");
  });
});

describe("conversationKindOf", () => {
  it("rend DIRECT à deux, GROUP à trois ou plus", () => {
    expect(conversationKindOf([coach("c"), athlete("a")])).toBe("DIRECT");
    expect(conversationKindOf([coach("c"), athlete("a"), coach("m")])).toBe("GROUP");
  });
});

describe("participantCapabilityOf / trainingCapabilityOf", () => {
  it("traduit la capacité exercée en titre de participant, et retour", () => {
    expect(participantCapabilityOf("coach")).toBe("COACH");
    expect(participantCapabilityOf("athlete")).toBe("ATHLETE");
    expect(trainingCapabilityOf("COACH")).toBe("coach");
    expect(trainingCapabilityOf("ATHLETE")).toBe("athlete");
  });
});

describe("actorMemberOf", () => {
  const actor = (exercised: TenantContext["exercised"]): TenantContext => ({
    userId: "u1",
    capabilities: { isCoach: true, isAthlete: true, isCompany: true },
    exercised,
  });

  it("rend l'acteur au titre qu'il exerce", () => {
    expect(actorMemberOf(actor("coach"))).toEqual(coach("u1"));
    expect(actorMemberOf(actor("athlete"))).toEqual(athlete("u1"));
  });

  it("refuse un compte Entreprise, qui ne participe à aucune conversation", () => {
    expect(() => actorMemberOf(actor("company"))).toThrow(/Entreprise/);
  });

  it("refuse une route sans titre déclaré", () => {
    expect(() => actorMemberOf(actor(null))).toThrow(/RequireCapability/);
  });
});

describe("directMembers", () => {
  it("nomme le Coach et l'athlète, chacun à son titre", () => {
    expect(participantKeyOf(directMembers("c1", "a1"))).toBe("ATHLETE:a1|COACH:c1");
  });
});

describe("byName", () => {
  it("range par nom, puis par id entre deux homonymes", () => {
    const people = [
      { name: "Marc", userId: "m2" },
      { name: "Chloé", userId: "c1" },
      { name: "Marc", userId: "m1" },
    ];
    expect(people.sort(byName).map((person) => person.userId)).toEqual(["c1", "m1", "m2"]);
  });
});
