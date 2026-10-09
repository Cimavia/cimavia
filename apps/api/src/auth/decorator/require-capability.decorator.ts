import { type Capabilities, type CapabilityName, hasCapability } from "@cmv/shared";
import {
  BadRequestException,
  type ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from "@nestjs/common";
import type { Reflector } from "@nestjs/core";

// Stryker disable next-line StringLiteral: clé opaque, écrite et lue par la même constante
export const REQUIRED_CAPABILITY_KEY = "cmv:required-capability";

/**
 * Ce qu'une route peut exiger. `"either"` couvre les ressources que les DEUX capacités consultent
 * — factures, conversations : le coach voit ce qu'il a émis, l'athlète ce qu'il a reçu. L'exigence
 * y est faible (avoir au moins une capacité), mais le **scope** doit trancher, et c'est là qu'un
 * compte à double capacité pose une question que le rôle exclusif ne posait pas. Voir
 * `resolveExercisedCapability`.
 */
export type RouteCapability = CapabilityName | "either";

/**
 * La capacité qu'une route **exerce** — et non le rôle de qui l'appelle.
 *
 * Ce décorateur porte DEUX besoins d'un coup, et c'est tout l'intérêt (#10) :
 *
 * 1. `CapabilitiesGuard` en fait une exigence — sans la capacité, 403.
 * 2. `TenancyInterceptor` en fait le **champ de scope** — une route coach filtre sur `coachId`,
 *    une route athlète sur `athleteId`.
 *
 * Avant #10, le scope se dérivait du rôle de l'acteur, ce qui n'a plus de réponse dès qu'un compte
 * porte les deux capacités : `GET /invoices` ne savait pas s'il fallait montrer les factures
 * émises ou reçues. La route le sait, elle. Une déclaration, deux lecteurs — c'est aussi ce qui
 * garantit qu'exigence et scope ne peuvent pas diverger.
 *
 * Une route qui n'exerce aucune capacité le dit aussi, par `@ExercisesNoCapability()` : l'absence
 * de déclaration ne veut rien dire, et un test e2e la refuse sur toute route montée (#622).
 */
// Stryker disable next-line ArrowFunction: un décorateur vide casse le chargement des contrôleurs ; le runner n'y voit aucun test
export const RequireCapability = (capability: RouteCapability) =>
  SetMetadata(REQUIRED_CAPABILITY_KEY, capability);

// Stryker disable next-line StringLiteral: valeur opaque, écrite et comparée par la même constante
export const NO_CAPABILITY = "none";

/** Ce qu'une route authentifiée déclare : la capacité qu'elle exerce, ou aucune. */
export type RouteDeclaration = RouteCapability | typeof NO_CAPABILITY;

/**
 * La route est authentifiée mais n'exerce aucune capacité : elle n'exige rien, et le scope n'a
 * pas de titre (`exercised: null`). Trois cas l'appellent, tous voulus (#622) :
 *
 * - une ressource adressée au compte, au scope identique pour les deux capacités (`Notification`,
 *   `PushToken`, les préférences d'envoi) ;
 * - une lecture des deux espaces à la fois (`me/counterparts`), ou une action sur le compte
 *   lui-même (`me/capabilities`, par laquelle on obtient justement une capacité) ;
 * - une route qui ne touche aucune donnée tenant (`/version`).
 *
 * Même clé que `@RequireCapability`, et c'est voulu : posé sur une méthode, il remplace la
 * capacité déclarée par le contrôleur, et la garde comme l'interceptor continuent de lire une
 * seule déclaration.
 */
// Stryker disable next-line ArrowFunction: même artefact que RequireCapability, aucun test ne se charge
export const ExercisesNoCapability = () => SetMetadata(REQUIRED_CAPABILITY_KEY, NO_CAPABILITY);

/**
 * Ce que la route déclare, `null` si elle ne déclare rien. Méthode d'abord, classe ensuite : un
 * contrôleur peut poser la règle commune et une route la remplacer.
 *
 * Seul lecteur de la métadonnée : la garde et l'interceptor passent par `requiredCapabilityOf`,
 * le test d'énumération des routes par celui-ci. Recopier ce `getAllAndOverride` laisserait un
 * jour l'un d'eux oublier la classe, et le scope s'écarterait de l'exigence sans qu'aucun test ne
 * le voie.
 */
export function routeDeclarationOf(
  reflector: Reflector,
  context: Pick<ExecutionContext, "getHandler" | "getClass">,
): RouteDeclaration | null {
  return (
    reflector.getAllAndOverride<RouteDeclaration>(REQUIRED_CAPABILITY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? null
  );
}

/**
 * La capacité exigée par la route courante, `null` si elle n'en exige aucune — route publique ou
 * `@ExercisesNoCapability()`. Partagée entre la garde et l'interceptor : les deux doivent lire
 * **exactement** la même chose.
 */
export function requiredCapabilityOf(
  reflector: Reflector,
  context: ExecutionContext,
): RouteCapability | null {
  const declared = routeDeclarationOf(reflector, context);
  return declared === NO_CAPABILITY ? null : declared;
}

/** Nom du paramètre par lequel une route `"either"` apprend à quel titre on l'appelle. */
export const AS_CAPABILITY_QUERY = "as";

/**
 * À quel titre la route est exercée — la capacité qui décidera de la colonne de scope. Une route
 * sans titre (`required` à `null`) n'en exerce aucune, et une route à capacité unique impose la
 * sienne. Seule une route `"either"` se résout, en trois cas — le troisième est le seul
 * intéressant :
 *
 * - `?as=coach` fourni : on l'honore, à condition que le compte porte la capacité (sinon 403 — sans
 *   ce contrôle, un athlète demanderait `?as=coach` et lirait les factures qu'il a émises, c'est-à-
 *   dire aucune… jusqu'au jour où il en émettrait).
 * - Une seule capacité sur le compte : elle s'impose. Ce n'est pas un défaut silencieux, c'est la
 *   seule réponse possible — et c'est ce qui fait qu'aucun client existant n'a à changer.
 * - Deux capacités et rien de précisé : **400**. Répondre « les factures émises » par convention
 *   serait exactement le fallback que la règle dure n°5 interdit : l'appelant croirait voir tout.
 */
export function resolveExercisedCapability(
  required: RouteCapability | null,
  capabilities: Capabilities,
  asParam: unknown,
): CapabilityName | null {
  if (required !== "either") return required;

  if (asParam === "coach" || asParam === "athlete") {
    if (!hasCapability(capabilities, asParam)) {
      throw new ForbiddenException();
    }
    return asParam;
  }
  if (asParam != null) {
    throw new BadRequestException(`${AS_CAPABILITY_QUERY} : « coach » ou « athlete » attendu`);
  }

  if (capabilities.isCoach && !capabilities.isAthlete) return "coach";
  if (capabilities.isAthlete && !capabilities.isCoach) return "athlete";

  throw new BadRequestException(
    `${AS_CAPABILITY_QUERY} requis : ce compte porte les deux capacités, préciser « coach » ou « athlete »`,
  );
}
