import type { Prisma } from "@prisma/client";
import { chunked } from "./object-citations";

type ReferenceDb = Pick<
  Prisma.TransactionClient,
  | "exerciseDocument"
  | "scheduledSessionExerciseDocument"
  | "feedbackMedia"
  | "message"
  | "invoice"
  | "pendingObjectDeletion"
>;

/** Parmi `keys`, celles que cette colonne cite. */
type ColumnReader = (db: ReferenceDb, keys: string[]) => Promise<(string | null)[]>;

const storagePaths = (rows: { storagePath: string | null }[]) => rows.map((row) => row.storagePath);

/**
 * TOUTES les colonnes qui portent une clé d'objet du bucket (#72) — la liste dont dépend le balayage
 * des orphelins : une colonne oubliée ici, et il supprime des objets encore affichés.
 *
 * Elle est donc VÉRIFIÉE plutôt que tenue de mémoire : `object-references.test.ts` lit le schéma
 * Prisma et échoue sur toute colonne `*Path` qui n'y figure pas. Une nouvelle colonne de clé se
 * nomme `…Path`, ou ce test ne la voit pas.
 *
 * `PendingObjectDeletion.key` n'est pas une référence mais une prise en charge (#256) : la file la
 * retirera au prochain tick, le balayage n'a pas à la doubler.
 *
 * Une clé se partage — une copie de document de cycle, une variante, une copie figée reprennent la
 * clé de leur document d'origine (P3, #315, #609) : c'est pourquoi on raisonne sur l'ensemble des
 * colonnes, jamais modèle par modèle.
 */
export const OBJECT_KEY_COLUMNS: Readonly<Record<string, ColumnReader>> = {
  "ExerciseDocument.storagePath": async (db, keys) =>
    storagePaths(
      await db.exerciseDocument.findMany({
        where: { storagePath: { in: keys } },
        select: { storagePath: true },
      }),
    ),
  "ScheduledSessionExerciseDocument.storagePath": async (db, keys) =>
    storagePaths(
      await db.scheduledSessionExerciseDocument.findMany({
        where: { storagePath: { in: keys } },
        select: { storagePath: true },
      }),
    ),
  "FeedbackMedia.storagePath": async (db, keys) =>
    storagePaths(
      await db.feedbackMedia.findMany({
        where: { storagePath: { in: keys } },
        select: { storagePath: true },
      }),
    ),
  "Message.storagePath": async (db, keys) =>
    storagePaths(
      await db.message.findMany({
        where: { storagePath: { in: keys } },
        select: { storagePath: true },
      }),
    ),
  "Invoice.documentPath": async (db, keys) =>
    (
      await db.invoice.findMany({
        where: { documentPath: { in: keys } },
        select: { documentPath: true },
      })
    ).map((row) => row.documentPath),
  "PendingObjectDeletion.key": async (db, keys) =>
    (
      await db.pendingObjectDeletion.findMany({
        where: { key: { in: keys } },
        select: { key: true },
      })
    ).map((row) => row.key),
};

/**
 * Parmi ces clés, celles qu'une ligne cite encore, dans n'importe quelle colonne de
 * `OBJECT_KEY_COLUMNS`.
 *
 * Chez TOUS les tenants, donc par le client de BASE, jamais par `TENANT_PRISMA` : le balayage
 * n'agit pour aucun acteur, et une clé citée par un seul tenant, quel qu'il soit, retient l'objet.
 * Sûr parce qu'il n'en sort que des clés que l'appelant connaissait déjà — aucune donnée de ligne.
 */
export async function referencedObjectKeys(
  db: ReferenceDb,
  keys: readonly string[],
): Promise<Set<string>> {
  const referenced = new Set<string>();
  for (const batch of chunked(keys)) {
    for (const readColumn of Object.values(OBJECT_KEY_COLUMNS)) {
      for (const key of await readColumn(db, batch)) if (key != null) referenced.add(key);
    }
  }
  return referenced;
}
