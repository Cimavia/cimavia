import { BadRequestException } from "@nestjs/common";

/**
 * Le curseur des flux lus du plus récent vers le passé (#77) : les messages d'un fil, puis les
 * notifications (#78), qui le reprennent tel quel — il n'y a pas deux curseurs dans le projet.
 *
 * Une POSITION `(createdAt, id)`, et non l'id d'une ligne à relire :
 * - `createdAt` seul ne suffit pas, deux lignes peuvent le partager (#867 le rend rare dans un
 *   fil, pas impossible) ; l'id les départage, d'où le tri `createdAt desc, id desc` ;
 * - le curseur de Prisma (`cursor: { id }`) relit la ligne désignée pour en tirer sa position. Un
 *   id pris dans le fil d'un autre, ou une ligne supprimée entre deux pages, en ferait une question
 *   de tenancy ou une erreur. Une position, elle, ne désigne rien : appliquée sous le scope de
 *   l'acteur, elle ne rend que SES lignes, plus anciennes qu'un instant.
 *
 * Encodée en base64url pour rester opaque aux clients : ils n'ont pas à la lire, et ne s'y
 * fieraient pas le jour où elle change.
 */
export type CursorPosition = { createdAt: Date; id: string };

/** Du plus récent au plus ancien, l'id départageant une égalité de date. */
export const NEWEST_FIRST = [{ createdAt: "desc" }, { id: "desc" }] as const;

export function encodeCursor({ createdAt, id }: CursorPosition): string {
  return Buffer.from(JSON.stringify([createdAt.toISOString(), id])).toString("base64url");
}

/**
 * La position qu'un curseur reçu désigne. Le schéma de requête n'en a vérifié que la forme ; le
 * contenu se vérifie ici, et un curseur qui ne vient pas de `encodeCursor` est un 400 — pas une
 * première page servie en silence, que le client prendrait pour la suite.
 */
export function decodeCursor(cursor: string): CursorPosition {
  const position = readPosition(cursor);
  if (position == null) throw new BadRequestException("Curseur de page illisible");
  return position;
}

function readPosition(cursor: string): CursorPosition | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) return null;
  const [iso, id] = parsed;
  if (typeof iso !== "string" || typeof id !== "string" || id === "") return null;
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== iso) return null;
  return { createdAt, id };
}

/**
 * Le filtre « strictement avant cette position », à poser à côté des conditions de la requête —
 * l'extension de tenancy ajoute la sienne sous `AND`, ce `OR` reste à l'intérieur. Rien sans
 * position : c'est la première page. L'appelant ne pose donc pas de condition à lui sur
 * `createdAt`, qu'il écraserait.
 *
 * Deux branches plutôt qu'une comparaison de tuples `(createdAt, id) < (…)`, que Prisma n'exprime
 * qu'en SQL brut (règle dure n°1). La borne `createdAt <= …` qui les précède ne change rien au
 * résultat : elle donne à Postgres la plage à lire dans l'index `(…, createdAt)`, qu'un `OR` seul
 * ne lui donne pas — sans elle, chaque page profonde relirait tout ce qui est plus ancien.
 */
export function olderThan(position: CursorPosition | null) {
  if (position == null) return {};
  return {
    createdAt: { lte: position.createdAt },
    OR: [
      { createdAt: { lt: position.createdAt } },
      { createdAt: position.createdAt, id: { lt: position.id } },
    ],
  };
}

/**
 * Une page à partir des lignes lues par `NEWEST_FIRST` avec `take: limit + 1` : la ligne de trop
 * dit qu'il en reste plus ancien, sans second comptage. Les lignes reviennent dans l'ordre où un
 * flux se lit — de la plus ancienne à la plus récente —, et le curseur de la page d'avant est la
 * position de la plus ancienne gardée.
 */
export function cursorPageOf<T extends CursorPosition>(
  newestFirst: readonly T[],
  limit: number,
): { rows: T[]; nextCursor: string | null } {
  const kept = newestFirst.slice(0, limit);
  const oldest = kept.at(-1);
  const nextCursor = newestFirst.length > limit && oldest != null ? encodeCursor(oldest) : null;
  return { rows: kept.reverse(), nextCursor };
}
