export const Role = {
  COACH: "COACH",
  ATHLETE: "ATHLETE",
} as const;

export type Role = (typeof Role)[keyof typeof Role];
