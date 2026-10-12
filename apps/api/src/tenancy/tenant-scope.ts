import type { CapabilityName } from "@cmv/shared";
import type { Prisma } from "@prisma/client";

/**
 * Ce qu'une opération exige de l'acteur sur la ligne qu'elle touche (#603) :
 * - `read` : la lire ;
 * - `write` : la créer, la modifier, ou supprimer un ENFANT — écrire dans un élément, c'est aussi
 *   retirer une semaine ou un document ;
 * - `admin` : supprimer une RACINE (exercice, séance, planification), qui reste au propriétaire.
 *
 * Gérer les accès d'un élément (#605) et réaffecter une planification (#607) sont aussi de
 * l'administration, mais l'opération Prisma ne les dit pas : la première vise un autre modèle, la
 * seconde est un `update` comme un autre. Elles se décideront là où elles arrivent.
 */
export type OperationClass = "read" | "write" | "admin";

export type TenantFilter = Record<string, unknown>;

/**
 * Le parent d'un enfant partageable (#603) : son modèle, et la clé étrangère qui le désigne dans
 * les données de création. `optional` : une clé à `null` dit « sans parent » — la facture hors
 * planification, qui reste privée et prend l'acteur pour propriétaire.
 */
export type ParentLink = { model: Prisma.ModelName; key: string; optional?: true };

/**
 * Le scope d'UNE capacité sur un modèle : le `where` qu'elle pose, selon la classe d'opération, et
 * la colonne que la création remplit — avec l'acteur, ou avec celle de son `parent` s'il en a un.
 *
 * Filtre et colonne se séparent dès que le filtre n'est plus une colonne : « propriétaire, ou droit
 * accordé » (#605) se lit, il ne s'écrit pas dans la ligne créée. `owner` à `null` dit qu'on ne
 * crée pas ce modèle sous ce scope.
 */
export type CapabilityScope = {
  where: (actorId: string, operation: OperationClass) => TenantFilter;
  owner: string | null;
  parent: ParentLink | null;
};

/** Une colonne comparée à l'acteur, la même pour les trois classes : la forme de tout modèle non partagé. */
export function column(name: string): CapabilityScope {
  return { where: (actorId) => ({ [name]: actorId }), owner: name, parent: null };
}

/**
 * Un enfant d'élément partageable : filtré comme `scope`, mais créé avec le propriétaire de son
 * PARENT, jamais avec l'acteur (piège n°7). Quand M écrira dans l'exercice de C (#605), le document
 * qu'il ajoute restera dans le scope de C.
 */
export function childOf(scope: CapabilityScope, parent: ParentLink): CapabilityScope {
  return { ...scope, parent };
}

/**
 * Un enfant filtré à TRAVERS sa racine (`{ exercise: { … } }`), pour la même classe d'opération :
 * ce que la racine permet, l'enfant le permet. C'est un filtre de relation dans le `where`, pas un
 * `include` — il reste dans la requête scopée, et le piège n°2 ne s'y applique pas.
 *
 * Branché par #605, avec la branche « droit accordé » : d'ici là, chaque enfant se lit par sa
 * colonne dénormalisée, qui donne le même résultat.
 */
export function throughRoot(relation: string, root: CapabilityScope): CapabilityScope {
  return {
    where: (actorId, operation) => ({ [relation]: root.where(actorId, operation) }),
    owner: null,
    parent: null,
  };
}

/**
 * Registre du scope tenant par modèle métier : ce que chaque capacité y voit. Un modèle ABSENT
 * d'ici est **refusé** via le client tenant (fail closed) — ce qui force à rattacher explicitement
 * toute nouvelle entité au tenant (règle dure).
 *
 * Trois familles, et le type les sépare (#600, #601) :
 * - un modèle d'ENTRAÎNEMENT appartient à un coach : son scope coach est obligatoire, le scope
 *   athlète optionnel — son absence est un refus (cf. `Reminder`) ;
 * - un modèle d'ENTREPRISE n'a qu'un scope `company`. Il n'a ni clé coach ni clé athlète, et un
 *   modèle d'entraînement n'a pas de clé `company` : un compte Entreprise ne peut donc atteindre
 *   AUCUN contenu d'entraînement, et c'est la structure du registre qui le dit, pas une règle de
 *   service ;
 * - un modèle ÉMIS par un Coach OU par une entreprise — `Invitation` seule (#601) : un scope
 *   coach et un scope `company`, chacun sur SA colonne d'émetteur, et jamais de scope athlète.
 *   Chaque capacité n'y voit que ce qu'elle a émis : l'émetteur absent d'une ligne y est `NULL`,
 *   que rien ne peut égaler. Le destinataire, lui, la lit par le client de base, sur l'adresse de
 *   sa session.
 *
 * Les `never` ferment les mélanges : un modèle d'entraînement qui recevrait `company`, ou un modèle
 * émis qui recevrait `athlete`, ne compile pas.
 *
 * `root` marque une RACINE d'élément partageable : sa suppression est de l'administration.
 */
export type TenantScope =
  | { coach: CapabilityScope; athlete?: CapabilityScope; company?: never; root?: true }
  | { company: CapabilityScope; coach?: never; athlete?: never; root?: never }
  | { coach: CapabilityScope; company: CapabilityScope; athlete?: never; root?: never };

const coachOwner = column("coachId");
const athleteOwner = column("athleteId");
const issuingOrganization = column("organizationId");

const ofExercise = childOf(coachOwner, { model: "Exercise", key: "exerciseId" });
const ofPlan = childOf(coachOwner, { model: "Plan", key: "planId" });
const ofScheduledExercise = childOf(coachOwner, {
  model: "ScheduledSessionExercise",
  key: "scheduledSessionExerciseId",
});

/**
 * Le MÊME scope pour les deux capacités : c'est ce qui ouvre le modèle à une route sans capacité
 * (`scopeFor`). L'identité le dit, pas la ressemblance — deux `column("userId")` écrits l'un à côté
 * de l'autre ne l'ouvriraient pas, d'où ce constructeur plutôt qu'une déclaration à la main.
 */
function sameForBoth(scope: CapabilityScope): TenantScope {
  return { coach: scope, athlete: scope };
}

/**
 * Une clé n'est ouverte que si une route la TRAVERSE (#626) : le mutation testing a montré qu'on
 * pouvait vider `AthleteSheet.athlete`, `PlanWeek.athlete` et les deux tables de rattachement des
 * exercices planifiés sans qu'aucun test ne le voie — aucune route athlète n'interroge ces modèles
 * à plat. L'athlète lit ses semaines et ses rattachements IMBRIQUÉS dans la séance ou le cycle,
 * que l'extension ne voit pas : leur scope est celui du parent. Les colonnes `athleteId` restent,
 * la réaffectation d'un cycle les tient à jour. La fiche, elle, n'est à l'athlète en aucune façon
 * (`CONTEXT.cimavia.md`, matrice des capacités).
 */
export const TENANT_SCOPES: Record<string, TenantScope> = {
  CoachAthlete: { coach: coachOwner, athlete: athleteOwner },
  // Émise par un Coach (vers un athlète) ou par une entreprise (vers un Coach, #601).
  Invitation: { coach: coachOwner, company: issuingOrganization },
  AthleteSheet: { coach: coachOwner },
  Exercise: { coach: coachOwner, root: true },
  ExerciseDocument: { coach: ofExercise },
  ExerciseTag: { coach: ofExercise },
  CustomMetric: { coach: coachOwner },
  Session: { coach: coachOwner, root: true },
  SessionExercise: { coach: childOf(coachOwner, { model: "Session", key: "sessionId" }) },
  Plan: { coach: coachOwner, athlete: athleteOwner, root: true },
  PlanWeek: { coach: ofPlan },
  ScheduledSession: { coach: ofPlan, athlete: athleteOwner },
  ScheduledSessionExercise: {
    coach: childOf(coachOwner, { model: "ScheduledSession", key: "scheduledSessionId" }),
    athlete: athleteOwner,
  },
  ScheduledSessionExerciseDocument: { coach: ofScheduledExercise },
  ScheduledSessionExerciseTag: { coach: ofScheduledExercise },
  SessionFeedback: { coach: coachOwner, athlete: athleteOwner },
  // Le coach lit les médias IMBRIQUÉS dans le débrief, jamais à plat : sa clé ne sert à aucune
  // route, mais un modèle d'entraînement en porte une par construction (`TenantScope`).
  FeedbackMedia: { coach: coachOwner, athlete: athleteOwner },
  Conversation: { coach: coachOwner, athlete: athleteOwner },
  Message: { coach: coachOwner, athlete: athleteOwner },
  // La facture suit sa planification ; sans elle, elle reste privée à qui l'émet (#593).
  Invoice: {
    coach: childOf(coachOwner, { model: "Plan", key: "planId", optional: true }),
    athlete: athleteOwner,
  },
  PushToken: sameForBoth(column("userId")),
  // Comme PushToken : le même champ pour les deux rôles, chacun ne lisant que ce qu'il a reçu.
  // L'ÉCRITURE vise le destinataire, donc un AUTRE tenant → hors de ce client (NotificationService).
  Notification: sameForBoth(column("recipientId")),
  // Réglages d'e-mail (#65) : comme PushToken, chacun ne gère que les siens, dans les deux rôles.
  // La LECTURE pour envoyer vise le destinataire, donc un autre tenant → NotificationService.
  NotificationEmailPreference: sameForBoth(column("userId")),
  /**
   * Rappels (#44) — le SEUL modèle métier que l'athlète n'atteint d'aucune façon, ni à plat ni
   * imbriqué : c'est un outil privé du coach, sans colonne athlète. L'absence de clé `athlete`
   * n'est donc pas un oubli, c'est la règle — un athlète qui atteindrait ce modèle se verrait
   * refusé par `resolveScopeOrThrow` (fail closed).
   *
   * Ce refus étant une ERREUR (500) et non un 403, deux gardes le précèdent :
   * `@RequireCapability("coach")` sur le contrôleur, et le branchement par rôle du centre de
   * notifications (#51), qui ne lit les rappels que pour un coach.
   */
  Reminder: { coach: coachOwner },
  // L'entreprise (#600) : son id EST celui du compte Entreprise, qui ne voit qu'elle.
  Organization: { company: column("id") },
  // Ses Coachs (#601). Le Coach n'y lit rien par ce client en v1 : ses entreprises viendront avec
  // les droits d'accès (#605), avec leur propre clé.
  OrganizationCoach: { company: issuingOrganization },
  // Ses athlètes (#602), au même titre. Le suivi, lui, reste dans `CoachAthlete`, sans clé
  // `company` : l'entreprise sait qui en est, jamais ce qui s'y fait.
  OrganizationAthlete: { company: issuingOrganization },
};

/**
 * Le scope applicable, ou `null` si la capacité exercée n'a aucun accès à ce modèle.
 *
 * Depuis #10, il se dérive de la capacité **exercée par la route** et non plus du rôle de
 * l'acteur — question qui n'avait plus de réponse dès qu'un compte porte les deux : `GET /invoices`
 * ne pouvait pas savoir s'il fallait montrer les factures émises ou reçues. La route le déclare
 * (`@RequireCapability`), l'interceptor le résout, on le lit ici.
 *
 * `exercised === null` (route qui n'exerce aucune capacité) n'est PAS un refus par défaut : c'est
 * le cas voulu de `Notification` et `PushToken`, dont le scope est le MÊME pour les deux
 * capacités. La condition l'exprime littéralement — un modèle dont les deux scopes coïncident n'a
 * pas besoin qu'on choisisse. Tout autre modèle atteint sans capacité déclarée est refusé, ce qui
 * transforme un oubli de décorateur en panne immédiate plutôt qu'en fuite de tenant.
 *
 * La capacité `company` ne s'ouvre qu'aux modèles qui portent sa clé (#600) ; un modèle émis
 * (#601) s'ouvre à l'entreprise ET au coach, chacun sur sa colonne.
 */
export function scopeFor(
  scope: TenantScope,
  exercised: CapabilityName | null,
): CapabilityScope | null {
  switch (exercised) {
    case "company":
      return scope.company ?? null;
    case "coach":
      return scope.coach ?? null;
    case "athlete":
      return scope.athlete ?? null;
    case null:
      return scope.coach != null && scope.coach === scope.athlete ? scope.coach : null;
  }
}

/**
 * Ce que fait une opération Prisma : sa classe, et si elle CRÉE — le tenant va alors dans ses
 * données, sinon dans son `where`. Une seule table pour les deux, pour qu'une opération ajoutée ne
 * soit pas classée d'un côté et oubliée de l'autre.
 */
export type OperationKind = { operationClass: OperationClass; creates: boolean };

/**
 * La nature d'une opération Prisma sur ce modèle, ou `null` pour celles que le client tenant
 * refuse : `upsert` et les opérations exotiques, dont le `where`/`create` unique créerait un angle
 * mort de scope. La suppression est la seule dont la classe dépend du modèle.
 */
export function operationKindOf(scope: TenantScope, operation: string): OperationKind | null {
  switch (operation) {
    case "findUnique":
    case "findUniqueOrThrow":
    case "findFirst":
    case "findFirstOrThrow":
    case "findMany":
    case "count":
    case "aggregate":
    case "groupBy":
      return { operationClass: "read", creates: false };
    case "create":
    case "createMany":
    case "createManyAndReturn":
      return { operationClass: "write", creates: true };
    case "update":
    case "updateMany":
      return { operationClass: "write", creates: false };
    case "delete":
    case "deleteMany":
      return { operationClass: scope.root === true ? "admin" : "write", creates: false };
    default:
      return null;
  }
}

/**
 * La colonne que la création remplit. Un scope sans colonne (`owner` à `null`) ne crée rien — mieux
 * vaut refuser qu'écrire un filtre dans la ligne.
 */
export function ownerColumnOrThrow(scope: CapabilityScope, model: string): string {
  if (scope.owner == null) {
    throw new Error(`[tenancy] ${model} ne se crée pas sous ce scope`);
  }
  return scope.owner;
}

/**
 * Les parents que désignent les lignes à créer, sans doublon. Une ligne doit porter la clé de son
 * parent, en clair : sans elle, rien ne dirait à qui l'enfant appartient — et une relation écrite
 * `connect` passerait à côté de la lecture du parent. Seul `null` sur un parent optionnel est
 * admis : la ligne n'a pas de parent, et prendra l'acteur pour propriétaire.
 */
export function parentIdsOrThrow(
  rows: TenantFilter[],
  parent: ParentLink,
  model: string,
): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    const id = row[parent.key];
    if (typeof id === "string") {
      ids.add(id);
    } else if (id !== null || parent.optional !== true) {
      throw new Error(
        `[tenancy] ${model} se crée avec son ${parent.key} : son propriétaire est celui de son ${parent.model}`,
      );
    }
  }
  return [...ids];
}
