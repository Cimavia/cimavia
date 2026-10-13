import { Prisma } from "@prisma/client";

/**
 * L'écriture a heurté une contrainte d'unicité (P2002). Un seul endroit pour la reconnaître : chaque
 * appelant décide ensuite de ce qu'elle veut dire chez lui — un doublon de libellé, une course entre
 * deux créations, une version périmée.
 */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * L'écriture a heurté une clé étrangère (P2003) : la ligne visée est encore citée, ou celle qu'elle
 * cite a disparu entre-temps.
 */
export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

/**
 * Une écriture qu'un contrôle préalable a jugée permise peut encore heurter une clé étrangère : un
 * autre Coach a cité la ligne entre le contrôle et l'écriture. `explain` refait le contrôle et lève
 * l'erreur lisible qu'il aurait levée ; s'il passe malgré tout, la violation remonte telle quelle.
 */
export async function explainForeignKeyViolation<T>(
  write: () => Promise<T>,
  explain: () => Promise<void>,
): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isForeignKeyViolation(error)) await explain();
    throw error;
  }
}
