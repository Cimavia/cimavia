import { z } from "zod";

/**
 * Pagination par CURSEUR, pour les flux lus du plus récent vers le passé (#77) : les messages
 * d'un fil d'abord, les notifications ensuite (#78), qui reprennent ces schémas tels quels.
 *
 * Un curseur et non un offset : des messages arrivent pendant qu'on remonte le fil, et un offset
 * décalerait d'autant la page suivante, qui sauterait ou répéterait des lignes. Les listes triées
 * et filtrées où l'on saute d'une page à l'autre (exercices, séances) suivent l'autre schéma,
 * `?page` / `?limit` (#79) : le curseur ne sait pas aller à la page 4.
 *
 * Le curseur est OPAQUE pour les clients : ils le reçoivent dans `nextCursor` et le rendent tel
 * quel dans `?before=`. Seule l'API sait ce qu'il contient, et c'est elle qui le refuse s'il est
 * illisible.
 */

/** Au-delà, une page n'en est plus une : c'est le fil entier, ce que la pagination retire. */
export const CURSOR_PAGE_MAX_LIMIT = 100;

/**
 * La forme d'un curseur, sans son contenu : de la base64url, d'une longueur qu'aucun curseur émis
 * n'approche. Le contenu, lui, se vérifie au décodage, côté API.
 */
export const pageCursorSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[\w-]+$/);

/**
 * `?before=<curseur>&limit=<n>` : la page de ce qui précède le curseur, la plus récente sans lui.
 *
 * `.strict()` : un paramètre mal nommé (`?cursor=`, `?Before=`) serait sinon écarté, et l'API
 * servirait la page la plus récente avec le même `nextCursor` — une remontée qui boucle sur les
 * mêmes lignes. `as` y est donc déclaré : ces routes servent les deux capacités, et `?as=` arrive
 * dans la même requête. C'est l'intercepteur de tenancy qui le lit et le refuse au besoin ; ici, il
 * n'est que toléré.
 */
export function cursorPageQuerySchema(defaultLimit: number) {
  return z
    .object({
      before: pageCursorSchema.optional(),
      limit: z.coerce.number().int().min(1).max(CURSOR_PAGE_MAX_LIMIT).default(defaultLimit),
      as: z.string().optional(),
    })
    .strict();
}

/**
 * Une page : ses lignes, du plus ANCIEN au plus récent — l'ordre où un fil se lit —, et le curseur
 * de la page d'avant. `nextCursor` à `null` veut dire « rien de plus ancien », pas « inconnu » :
 * l'API le sait toujours, elle a demandé une ligne de plus que la page pour le savoir.
 */
export function cursorPageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: pageCursorSchema.nullable(),
  });
}

/** Une page, côté type, quel que soit le flux. */
export type CursorPage<T> = { items: T[]; nextCursor: string | null };
