import { Prisma } from "@prisma/client";

/**
 * L'écriture a heurté une contrainte d'unicité (P2002). Un seul endroit pour la reconnaître : chaque
 * appelant décide ensuite de ce qu'elle veut dire chez lui — un doublon de libellé, une course entre
 * deux créations, une version périmée.
 */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
