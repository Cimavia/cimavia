import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";

/**
 * Le niveau d'un droit d'accès (#605). `NONE` vit sur la ligne d'un Coach, pour l'emporter sur celle
 * de son entreprise (#608), et sur la ligne d'une entreprise d'une PLANIFICATION (#607) : il y dit
 * « fermée exprès », que le droit par défaut ne rouvre pas à la réaffectation. Sur la ligne d'une
 * entreprise d'un exercice ou d'une séance, « Aucun » reste l'ABSENCE de ligne.
 */
export const AccessLevel = {
  NONE: "NONE",
  READ: "READ",
  WRITE: "WRITE",
} as const;
export type AccessLevel = TypesValuesOf<typeof AccessLevel>;

/** Les niveaux qu'une entreprise peut recevoir : lire, ou écrire. */
export const organizationAccessLevelSchema = z.enum([AccessLevel.READ, AccessLevel.WRITE]);
export type OrganizationAccessLevel = z.infer<typeof organizationAccessLevelSchema>;

/**
 * Ce que l'acteur peut faire d'un élément de la bibliothèque. `OWNER` seul supprime l'élément et
 * gère ses accès ; `WRITE` en modifie le contenu ; `READ` le consulte et l'utilise.
 */
export const MyAccessLevel = {
  OWNER: "OWNER",
  WRITE: "WRITE",
  READ: "READ",
} as const;
export type MyAccessLevel = TypesValuesOf<typeof MyAccessLevel>;

const organizationRefSchema = z.object({ id: z.string(), name: z.string() });

/**
 * Le droit de l'acteur, et d'où il vient : `via` est l'entreprise qui le lui ouvre (« Écriture via
 * F »), `null` pour le propriétaire, qui ne le tient de personne.
 */
export const myAccessSchema = z.object({
  level: z.enum(MyAccessLevel),
  via: organizationRefSchema.nullable(),
});
export type MyAccess = z.infer<typeof myAccessSchema>;

/** Le propriétaire d'un élément : celui qui l'a créé, seul à le supprimer et à en gérer les accès. */
export const accessOwnerSchema = z.object({ id: z.string(), name: z.string() });
export type AccessOwner = z.infer<typeof accessOwnerSchema>;

/** Un droit accordé à une entreprise, tel que le propriétaire le voit dans son panneau. */
export const accessGrantDtoSchema = z.object({
  organization: organizationRefSchema,
  level: organizationAccessLevelSchema,
});
export type AccessGrantDto = z.infer<typeof accessGrantDtoSchema>;

/**
 * Ce qu'une liste de la bibliothèque montre : tout ce qui est lisible, ses propres éléments, ou ce
 * que d'autres Coachs lui ouvrent (« Partagés avec moi »).
 */
export const LibraryScope = {
  ALL: "all",
  MINE: "mine",
  SHARED: "shared",
} as const;
export type LibraryScope = TypesValuesOf<typeof LibraryScope>;

/** `?scope=` absent vaut `all` : une liste sans filtre montre tout ce que l'acteur peut lire. */
export const libraryScopeSchema = z.enum(LibraryScope).default(LibraryScope.ALL);

/** La requête d'une liste qui n'a pas d'autre filtre : les séances. */
export const libraryScopeQuerySchema = z.object({ scope: libraryScopeSchema }).strict();
export type LibraryScopeQuery = z.infer<typeof libraryScopeQuerySchema>;

/** Au-delà, la sélection est un oubli d'interface, pas un geste : la requête deviendrait énorme. */
export const ACCESS_MAX_TARGETS = 200;

/**
 * Les entreprises changées d'un coup. Chacune coûte des écritures, et un retrait (« Aucun ») ne
 * vérifie pas l'appartenance : sans plafond, une requête pourrait en citer autant qu'elle veut.
 */
export const ACCESS_MAX_CHANGES = 50;

/**
 * Changer les droits de plusieurs éléments à la fois (#597) : seuls les bénéficiaires CHANGÉS sont
 * envoyés. Une ligne restée « Mixte » n'est pas dans `changes`, et chaque élément garde sa valeur.
 * Remplacer tous les droits de chaque élément l'aurait écrasée.
 *
 * `level: null` dit « Aucun » : la ligne de l'entreprise disparaît. Les deux listes sont sans
 * doublon, une entreprise citée deux fois laisserait l'ordre décider.
 */
export const changeAccessSchema = z
  .object({
    ids: z
      .array(z.string().min(1))
      .min(1)
      .max(ACCESS_MAX_TARGETS)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Un élément ne peut pas être cité deux fois.",
      }),
    changes: z
      .array(
        z
          .object({
            organizationId: z.string().min(1),
            level: organizationAccessLevelSchema.nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(ACCESS_MAX_CHANGES)
      .refine((changes) => new Set(changes.map((c) => c.organizationId)).size === changes.length, {
        message: "Une entreprise ne peut pas être citée deux fois.",
      }),
  })
  .strict();
export type ChangeAccessInput = z.infer<typeof changeAccessSchema>;

/** Les droits d'un élément, après un changement : la réponse que le panneau relit. */
export const elementAccessDtoSchema = z.object({
  id: z.string(),
  grants: z.array(accessGrantDtoSchema),
});
export type ElementAccessDto = z.infer<typeof elementAccessDtoSchema>;

/**
 * Une entreprise du Coach courant et ses Coachs, lui compris : le panneau des accès en affiche une
 * ligne par entreprise (« F · M et toi »). Liste vide = le Coach n'appartient à aucune entreprise,
 * et la bibliothèque n'affiche alors rien du partage (tranché en #597).
 */
export const coachOrganizationDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  coaches: z.array(z.object({ coachId: z.string(), name: z.string() })),
});
export type CoachOrganizationDto = z.infer<typeof coachOrganizationDtoSchema>;
