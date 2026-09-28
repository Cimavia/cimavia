import { BadRequestException } from "@nestjs/common";

/** Ce qu'il faut d'une ligne déjà en base pour la rattacher : son identité et son rang. */
export type ExistingExerciseRow = { id: string; position: number };

/**
 * Le partage d'une composition reçue entre ce qui existe déjà et ce qui naît.
 *
 * `position` est le rang FINAL, c'est-à-dire l'ordre du tableau reçu : l'ordre définit toujours les
 * positions, comme pour la séance modèle.
 */
export type ExerciseRows<T> = {
  /** Les lignes que la composition ne cite plus : elles partent, avec leurs documents. */
  removedIds: string[];
  /** Les lignes reprises : mises à jour EN PLACE, leur identité ne change pas. */
  kept: { id: string; position: number; item: T }[];
  /** Les lignes nouvelles : créées, avec des documents pris dans la bibliothèque. */
  added: { position: number; item: T }[];
  /**
   * Le premier rang où garer les lignes reprises avant de leur donner leur rang final (cf.
   * `rewriteScheduledSessionExercises`).
   */
  parking: number;
};

/**
 * Rattache chaque exercice reçu à la ligne qu'il désigne (#296, #311).
 *
 * L'identité d'une ligne n'est pas un détail d'écriture : l'athlète coche son suivi EN LOCAL, indexé
 * par cet identifiant, et la consigne cite ses images par l'identifiant des documents rattachés à
 * la ligne. Recréer les lignes à chaque enregistrement du coach renouvelait les deux, et chacun
 * cassait en silence — des coches perdues au débrief, des images introuvables chez l'athlète.
 *
 * Un `id` inconnu de la séance désigne une ligne NOUVELLE, comme un `id` absent : l'identifiant
 * vient du client, et le reprendre tel quel rattacherait la ligne d'une autre séance. Le même `id`
 * cité deux fois est en revanche une demande mal formée — deux lignes ne peuvent pas en être une.
 *
 * Le rang de garage dépasse À LA FOIS ce que la séance occupe et ce qu'elle occupera : les lignes
 * nouvelles s'écrivent directement à leur rang final, qui ne doit jamais tomber sur une ligne
 * garée.
 */
export function planExerciseRows<T extends { id?: string | undefined }>(
  existing: readonly ExistingExerciseRow[],
  items: readonly T[],
): ExerciseRows<T> {
  const existingIds = new Set(existing.map((row) => row.id));
  const cited = new Set<string>();
  const kept: ExerciseRows<T>["kept"] = [];
  const added: ExerciseRows<T>["added"] = [];

  for (const [position, item] of items.entries()) {
    const id = item.id;
    if (id == null || !existingIds.has(id)) {
      added.push({ position, item });
      continue;
    }
    if (cited.has(id)) {
      throw new BadRequestException(`L'exercice ${id} est cité deux fois dans la séance`);
    }
    cited.add(id);
    kept.push({ id, position, item });
  }

  const highest = Math.max(-1, ...existing.map((row) => row.position));
  return {
    removedIds: existing.filter((row) => !cited.has(row.id)).map((row) => row.id),
    kept,
    added,
    parking: Math.max(highest + 1, items.length),
  };
}
