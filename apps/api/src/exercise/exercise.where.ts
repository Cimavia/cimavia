import { comparableText } from "@cmv/shared";
import type { Prisma } from "@prisma/client";

export type ListExercisesFilters = {
  /** Déjà normalisés (`exerciseTagFilterSchema`). Vide : pas de filtre. */
  tags?: readonly string[];
  search?: string;
};

/**
 * Le `where` d'une liste d'exercices, à partir des filtres reçus en query.
 *
 * Fonction à part, et pure, parce que ce qui peut se casser ici est SILENCIEUX : la recherche ne
 * fonctionne que si le terme cherché et le titre stocké traversent la MÊME normalisation. Une
 * aiguille laissée telle quelle ne trouverait plus rien d'accentué, et rien — ni type, ni erreur,
 * ni log — ne le signalerait. C'est cette symétrie que le test tient.
 */
export function exerciseListWhere(filters: ListExercisesFilters): Prisma.ExerciseWhereInput {
  const where: Prisma.ExerciseWhereInput = {};
  // `some … in` : un exercice qui porte AU MOINS UN des tags choisis est retenu — la règle de
  // `matchesTagFilter`, que les séances appliquent côté client (tranché en #654).
  if (filters.tags?.length) where.tags = { some: { name: { in: [...filters.tags] } } };
  // Sur `titleSearch`, jamais sur `title` — et donc sans `mode: "insensitive"` : les deux côtés
  // sont DÉJÀ sans casse ni accent. Le garder laisserait croire à une règle de casse distincte de
  // celle des accents, alors qu'une seule fonction porte les deux.
  if (filters.search) where.titleSearch = { contains: comparableText(filters.search) };
  return where;
}
