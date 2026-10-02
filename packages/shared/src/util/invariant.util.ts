/**
 * La valeur, ou une erreur si elle manque — pour un invariant que le TYPE ne sait pas porter : un
 * `Map.get` sur un id qu'une clé étrangère garantit, un indice borné juste au-dessus, la première
 * issue d'un échec Zod.
 *
 * Ni repli ni valeur par défaut (règle dure n°5) : un invariant violé est une donnée incohérente,
 * et un `?? ""` l'aurait fait passer en silence pour une valeur. Il lève, et le message dit lequel.
 *
 * Une seule fonction, testée une fois, plutôt qu'un `if (x == null) throw` recopié à chaque
 * appel : une garde locale qu'aucune entrée n'atteint reste une branche que rien ne couvre (#512).
 */
export function required<T>(value: T | null | undefined, invariant: string): T {
  if (value == null) throw new Error(invariant);
  return value;
}
