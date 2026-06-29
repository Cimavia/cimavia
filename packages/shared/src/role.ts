import type { TypesValuesOf } from "./type/generics.type";

export const Role = {
  COACH: "COACH",
  ATHLETE: "ATHLETE",
} as const;

export type Role = TypesValuesOf<typeof Role>;
