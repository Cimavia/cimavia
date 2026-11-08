import type { Prisma } from "@prisma/client";

/** Largement sous la limite de paramètres de PostgreSQL (32 767), même avec le reste du filtre. */
const QUERY_BATCH_SIZE = 5_000;

/** Découpe une liste sans borne en listes qu'une seule requête peut porter. */
export function chunked<T>(items: readonly T[], size = QUERY_BATCH_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

type CitationReader = Pick<
  Prisma.TransactionClient,
  "exerciseDocument" | "scheduledSessionExerciseDocument"
>;

/**
 * Parmi ces clés, celles qu'une ligne cite encore : LA règle qui décide si un objet peut partir.
 * Une séance planifiée, une variante ou une copie figée partagent la clé de leur document d'origine
 * (P3, #315, #609).
 *
 * Chez TOUS les Coachs (piège n°8, #605), donc par le client de base : la planification de M peut
 * recopier un document de C sous la clé de C. Sûr parce que les clés viennent de lignes que
 * l'appelant a lues lui-même, et qu'il n'en sort que des clés qu'il connaissait déjà.
 *
 * `exceptDocumentId` : le document qui part, quand il n'est pas encore supprimé.
 */
export async function citedStorageKeys(
  db: CitationReader,
  keys: readonly string[],
  exceptDocumentId?: string,
): Promise<Set<string>> {
  const cited = new Set<string>();
  const select = { storagePath: true } as const;
  for (const storagePath of chunked(keys)) {
    const where = { storagePath: { in: storagePath } };
    const rows = [
      ...(await db.scheduledSessionExerciseDocument.findMany({ where, select })),
      ...(await db.exerciseDocument.findMany({
        where: exceptDocumentId == null ? where : { ...where, id: { not: exceptDocumentId } },
        select,
      })),
    ];
    for (const row of rows) if (row.storagePath != null) cited.add(row.storagePath);
  }
  return cited;
}
