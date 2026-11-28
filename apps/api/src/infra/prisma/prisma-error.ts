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

/**
 * La transaction a heurté une écriture concurrente (P2034, SQLSTATE 40001) : sous une lecture
 * répétable, une ligne que son instantané voyait a été modifiée ou supprimée par une transaction
 * validée depuis. Rejouée, elle repart d'un instantané neuf.
 */
export function isSerializationFailure(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

/**
 * Rejoue `transaction` tant qu'elle échoue sur un conflit de sérialisation, `attempts` fois au
 * plus — le remède que Postgres prescrit à une lecture répétable. Toute autre erreur, et le
 * dernier conflit, remontent tels quels.
 */
export async function retryOnSerializationFailure<T>(
  transaction: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await transaction();
    } catch (error) {
      if (attempt >= attempts || !isSerializationFailure(error)) throw error;
    }
  }
}
