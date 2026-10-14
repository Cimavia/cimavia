import { describe, expect, it } from "vitest";
import type { CoachOrganizationDto } from "../dto/access.schema";
import { defaultPlanGrant, eligibleOrganizations } from "./plan-access.util";

const C = { coachId: "c", name: "C" };
const M = { coachId: "m", name: "M" };
const N = { coachId: "n", name: "N" };

const F: CoachOrganizationDto = { id: "org-f", name: "F", coaches: [C, M, N] };
const G: CoachOrganizationDto = { id: "org-g", name: "G", coaches: [C, N] };

describe("eligibleOrganizations", () => {
  it("sans athlète, toutes les entreprises du propriétaire, Coachs compris", () => {
    expect(eligibleOrganizations([F, G], null, "c")).toEqual([F, G]);
  });

  it("garde les seuls Coachs qui suivent l'athlète, le propriétaire compris", () => {
    expect(eligibleOrganizations([F], new Set(["c", "m"]), "c")).toEqual([
      { ...F, coaches: [C, M] },
    ]);
  });

  it("écarte une entreprise dont aucun autre Coach ne suit l'athlète", () => {
    expect(eligibleOrganizations([F, G], new Set(["c", "m"]), "c")).toEqual([
      { ...F, coaches: [C, M] },
    ]);
  });

  it("un athlète suivi par le seul propriétaire : personne à qui l'ouvrir (frame 10)", () => {
    expect(eligibleOrganizations([F, G], new Set(["c"]), "c")).toEqual([]);
  });

  it("un athlète sans aucun Coach dans ces entreprises : rien non plus", () => {
    expect(eligibleOrganizations([F], new Set(), "c")).toEqual([]);
  });

  it("ne réécrit pas la liste reçue", () => {
    const organizations = [F];
    eligibleOrganizations(organizations, new Set(["c", "m"]), "c");
    expect(organizations).toEqual([F]);
    expect(F.coaches).toEqual([C, M, N]);
  });
});

describe("defaultPlanGrant", () => {
  const eligible = [{ ...F, coaches: [C, M] }];

  it("le lien passe par F, éligible et pas encore réglée : F", () => {
    expect(defaultPlanGrant("org-f", eligible, new Set())).toBe("org-f");
  });

  it("un lien direct n'ouvre rien", () => {
    expect(defaultPlanGrant(null, eligible, new Set())).toBeNull();
  });

  it("une entreprise non éligible n'ouvre rien : personne d'autre n'y suit l'athlète", () => {
    expect(defaultPlanGrant("org-g", eligible, new Set())).toBeNull();
  });

  it("une ligne déjà réglée, « Aucun » compris, n'est pas rouverte", () => {
    expect(defaultPlanGrant("org-f", eligible, new Set(["org-f"]))).toBeNull();
  });

  it("la ligne d'une autre entreprise ne compte pas", () => {
    expect(defaultPlanGrant("org-f", eligible, new Set(["org-g"]))).toBe("org-f");
  });
});
