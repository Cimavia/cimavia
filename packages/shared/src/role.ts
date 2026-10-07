import type { TypesValuesOf } from "./type/generics.type";

/**
 * Persona d'AFFICHAGE (#9) : où atterrit un compte. Ne fonde aucun droit. `COMPANY` est déduit
 * d'`isCompany` à l'inscription (#600), comme `COACH` et `ATHLETE` le sont de leurs capacités.
 */
export const Role = {
  COACH: "COACH",
  ATHLETE: "ATHLETE",
  COMPANY: "COMPANY",
  ADMIN: "ADMIN",
} as const;

export type Role = TypesValuesOf<typeof Role>;
