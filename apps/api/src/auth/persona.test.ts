import { Role } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { personaOf } from "./persona";

const NONE = { isCoach: false, isAthlete: false, isCompany: false };

describe("personaOf", () => {
  it("fait atterrir une entreprise dans son espace", () => {
    expect(personaOf({ ...NONE, isCompany: true })).toBe(Role.COMPANY);
  });

  it("fait atterrir un coach, ou un compte qui cumule, côté coach", () => {
    expect(personaOf({ ...NONE, isCoach: true })).toBe(Role.COACH);
    expect(personaOf({ ...NONE, isCoach: true, isAthlete: true })).toBe(Role.COACH);
  });

  it("fait atterrir un athlète seul côté athlète", () => {
    expect(personaOf({ ...NONE, isAthlete: true })).toBe(Role.ATHLETE);
  });
});
