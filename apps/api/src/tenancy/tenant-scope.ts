import type { CapabilityName } from "@cmv/shared";
import type { ParticipantCapability, Prisma } from "@prisma/client";

/**
 * Ce qu'une opération exige de l'acteur sur la ligne qu'elle touche (#603) :
 * - `read` : la lire ;
 * - `write` : la créer, la modifier, ou supprimer un ENFANT — écrire dans un élément, c'est aussi
 *   retirer une semaine ou un document ;
 * - `admin` : supprimer une RACINE (exercice, séance, planification), qui reste au propriétaire.
 *
 * Gérer les accès d'un élément et réaffecter une planification sont aussi de l'administration, mais
 * l'opération Prisma ne les dit pas. Gérer les accès vise un autre modèle, `AccessGrant`, que seul
 * le propriétaire atteint (#605) ; réaffecter est un `update` comme un autre, que `PlanService`
 * réserve au propriétaire avant d'écrire (#607).
 */
export type OperationClass = "read" | "write" | "admin";

export type TenantFilter = Record<string, unknown>;

/**
 * Le parent d'un enfant partageable (#603) : son modèle, et la clé étrangère qui le désigne dans
 * les données de création. `optional` : une clé à `null` dit « sans parent » — la facture hors
 * planification, qui reste privée et prend l'acteur pour propriétaire.
 *
 * `checkOnly` (#611) : le parent est VÉRIFIÉ en écriture, mais l'enfant n'en hérite pas le
 * propriétaire — il prend l'acteur. C'est le message : il faut participer à sa conversation pour y
 * écrire, et c'est son auteur, pas la conversation, qui remplit sa colonne.
 */
export type ParentLink = {
  model: Prisma.ModelName;
  key: string;
  optional?: true;
  checkOnly?: true;
};

/**
 * Ce qu'exige une ligne à participants (#611). À la création, l'acteur doit figurer parmi ceux
 * qu'elle crée avec elle, sous `relation`, au titre exercé — sans quoi il créerait une conversation
 * qu'il ne pourrait pas lire, ou l'ouvrirait à d'autres sans en être. Ensuite, ni `relation` ni les
 * colonnes `frozen`, qui en dérivent, ne bougent : un participant qui en ajouterait un autre par une
 * écriture imbriquée échapperait à toute vérification.
 */
export type Membership = {
  relation: string;
  capability: ParticipantCapability;
  frozen: readonly string[];
};

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
  membership?: Membership;
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
 */
export function throughRoot(relation: string, root: CapabilityScope): CapabilityScope {
  return {
    where: (actorId, operation) => ({ [relation]: root.where(actorId, operation) }),
    owner: null,
    parent: null,
  };
}

/**
 * Les niveaux de droit qu'exige chaque classe (#605) : lire accepte l'Écriture, écrire l'exige.
 * L'administration n'en accepte aucun — elle reste au propriétaire.
 */
const GRANTED_LEVELS = { read: ["READ", "WRITE"], write: ["WRITE"] } as const;

/**
 * Les droits qui ouvrent l'élément à l'acteur pour cette classe (#605, #608) — la traduction en
 * `where` d'`effectiveAccess` (`@cmv/shared`), qu'un e2e confronte au filtre sur la même table de
 * cas :
 *
 * - la ligne de l'acteur, au niveau requis ;
 * - sinon, s'il n'a AUCUNE ligne, celle d'une de ses entreprises au niveau requis. Une ligne à lui,
 *   même `NONE` ou d'un niveau trop bas, l'emporte sur ce que ses entreprises lui ouvrent.
 *
 * Filtre de la racine, pas de `AccessGrant` : la priorité d'une ligne sur une autre ne se dit qu'à
 * travers l'élément (`none` sur la sienne, `some` sur celle de l'entreprise).
 */
export function grantedTo(actorId: string, operation: "read" | "write"): TenantFilter {
  const level = { in: [...GRANTED_LEVELS[operation]] };
  return {
    OR: [
      { accessGrants: { some: { coachId: actorId, level } } },
      {
        AND: [
          { accessGrants: { none: { coachId: actorId } } },
          {
            accessGrants: {
              some: { level, organization: { coaches: { some: { coachId: actorId } } } },
            },
          },
        ],
      },
    ],
  };
}

/**
 * Une RACINE d'élément partageable (#605) — exercice, séance, planification : l'acteur en est
 * propriétaire, ou un droit le vise au niveau qu'exige l'opération. L'administration (supprimer
 * l'élément) ne regarde que la colonne.
 *
 * `audience` borne ceux qu'un droit peut atteindre, au-delà de leurs entreprises : pour une
 * planification, les seuls Coachs de son athlète (#607). Le propriétaire n'y est pas soumis.
 *
 * Le composé passe sous `AND` : posé à plat, son `OR` écraserait celui de l'appelant, et sa
 * recherche ou son filtre de tags deviendraient le filtre tenant — ou l'inverse.
 */
export function sharedRoot(
  ownerColumn: string,
  audience?: (actorId: string) => TenantFilter,
): CapabilityScope {
  const granted = (actorId: string, operation: "read" | "write"): TenantFilter => {
    const grant = grantedTo(actorId, operation);
    return audience == null ? grant : { AND: [grant, audience(actorId)] };
  };
  return {
    where: (actorId, operation) =>
      operation === "admin"
        ? { [ownerColumn]: actorId }
        : { AND: [{ OR: [{ [ownerColumn]: actorId }, granted(actorId, operation)] }] },
    owner: ownerColumn,
    parent: null,
  };
}

/**
 * Ceux qu'un droit sur une planification peut atteindre (#607) : les Coachs de son athlète, par un
 * lien actif — un Coach de F qui ne suit pas l'athlète n'y voit rien, même si F a un droit. Sans
 * athlète (#144), la planification se partage comme un exercice.
 */
export function coachesOfPlanAthlete(actorId: string): TenantFilter {
  return {
    OR: [
      { athleteId: null },
      { athlete: { athleteRelations: { some: { coachId: actorId, status: "ACTIVE" } } } },
    ],
  };
}

/**
 * Un enfant d'élément partageable (#605) : filtré à travers sa racine, créé avec le propriétaire de
 * son parent. Documents et tags suivent l'exercice, exercices de séance suivent la séance, et tout
 * ce que porte une planification la suit (#607) — un rédacteur y écrit, la ligne reste chez le
 * propriétaire (piège n°7). `root` est le scope du parent DIRECT : le petit-enfant s'y filtre à
 * travers lui, jusqu'à la racine.
 */
export function sharedChild(
  relation: string,
  root: CapabilityScope,
  parent: ParentLink,
): CapabilityScope {
  return childOf({ ...throughRoot(relation, root), owner: root.owner }, parent);
}

/**
 * Un enfant à parent OPTIONNEL (#607) — la facture : sans parent, privée à son propriétaire ; avec,
 * elle suit son parent pour la même classe, et se crée chez le propriétaire de ce parent.
 */
export function optionalChild(
  relation: string,
  root: CapabilityScope,
  parent: ParentLink & { optional: true },
): CapabilityScope {
  const owner = ownerColumnOrThrow(root, parent.model);
  const withParent = throughRoot(relation, root);
  return {
    where: (actorId, operation) => ({
      AND: [
        { OR: [{ [parent.key]: null, [owner]: actorId }, withParent.where(actorId, operation)] },
      ],
    }),
    owner,
    parent,
  };
}

/**
 * La PARTICIPATION (#611), troisième forme de scope : on lit une conversation si l'on en est
 * participant, au titre de la capacité exercée. Un compte qui coache TI et s'entraîne avec C a deux
 * fils distincts avec chacun : ses conversations de Coach ne s'ouvrent pas dans son espace athlète.
 *
 * Aucune colonne ne dit à qui est la conversation : elle se crée avec ses participants, et la
 * création doit compter l'acteur parmi eux (`membership`).
 */
export function participation(capability: ParticipantCapability): CapabilityScope {
  return {
    where: (actorId) => ({ participants: { some: { userId: actorId, capability } } }),
    owner: null,
    parent: null,
    // La clé et la nature disent QUI participe : elles se figent avec les participants.
    membership: { relation: "participants", capability, frozen: ["participantKey", "kind"] },
  };
}

/**
 * Le message d'une conversation (#611) : on lit ceux des conversations dont on est participant, on
 * n'écrit que les siens. Sa création vérifie la conversation en écriture (`checkOnly`) et injecte
 * l'acteur comme auteur — l'auteur EST le propriétaire, celui dont la bulle s'aligne à droite.
 */
function messageOf(conversation: CapabilityScope): CapabilityScope {
  const read = throughRoot("conversation", conversation);
  return {
    where: (actorId, operation) =>
      operation === "read"
        ? read.where(actorId, operation)
        : { senderId: actorId, ...read.where(actorId, operation) },
    owner: "senderId",
    parent: { model: "Conversation", key: "conversationId", checkOnly: true },
  };
}

/**
 * La participation elle-même (#611) : on lit celles de ses conversations — c'est ce qui nomme les
 * autres et dit « Lu par » —, on n'écrit que la sienne. Elle ne se crée qu'avec sa conversation,
 * imbriquée : à plat, rien ne dirait à quel titre l'acteur ajoute quelqu'un (`owner` à `null`).
 */
function participantOf(
  conversation: CapabilityScope,
  capability: ParticipantCapability,
): CapabilityScope {
  const read = throughRoot("conversation", conversation);
  return {
    where: (actorId, operation) =>
      operation === "read" ? read.where(actorId, operation) : { userId: actorId, capability },
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
 *
 * `OrganizationCoach` a la forme d'un modèle émis : l'entreprise y lit ses Coachs, le Coach ses
 * entreprises (#605), chacun sur sa colonne.
 */
export type TenantScope =
  | { coach: CapabilityScope; athlete?: CapabilityScope; company?: never; root?: true }
  | { company: CapabilityScope; coach?: never; athlete?: never; root?: never }
  | { coach: CapabilityScope; company: CapabilityScope; athlete?: never; root?: never };

const coachOwner = column("coachId");
const athleteOwner = column("athleteId");
const issuingOrganization = column("organizationId");
const coachParticipation = participation("COACH");
const athleteParticipation = participation("ATHLETE");

// Exercices et séances s'ouvrent aux entreprises (#605), les planifications aux Coachs de leur
// athlète (#607).
const sharedExercise = sharedRoot("coachId");
const sharedSession = sharedRoot("coachId");
const sharedPlan = sharedRoot("coachId", coachesOfPlanAthlete);
const ofExercise = sharedChild("exercise", sharedExercise, {
  model: "Exercise",
  key: "exerciseId",
});
const ofPlan = sharedChild("plan", sharedPlan, { model: "Plan", key: "planId" });
const ofScheduledSession = sharedChild("scheduledSession", ofPlan, {
  model: "ScheduledSession",
  key: "scheduledSessionId",
});
const ofScheduledExercise = sharedChild("scheduledSessionExercise", ofScheduledSession, {
  model: "ScheduledSessionExercise",
  key: "scheduledSessionExerciseId",
});
// Le débrief et ses médias, créés par l'athlète : le Coach les lit à travers la séance, ne les
// crée pas (`owner` à `null`).
const feedbackOfSession = throughRoot("scheduledSession", ofPlan);

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
  Exercise: { coach: sharedExercise, root: true },
  ExerciseDocument: { coach: ofExercise },
  ExerciseTag: { coach: ofExercise },
  CustomMetric: { coach: coachOwner },
  Session: { coach: sharedSession, root: true },
  SessionExercise: {
    coach: sharedChild("session", sharedSession, { model: "Session", key: "sessionId" }),
  },
  // Les droits accordés (#605) : le propriétaire seul les lit et les gère. Celui qui en bénéficie
  // ne les lit pas ici : son droit se calcule sur l'élément qu'il ouvre.
  AccessGrant: { coach: column("ownerId") },
  Plan: { coach: sharedPlan, athlete: athleteOwner, root: true },
  PlanWeek: { coach: ofPlan },
  ScheduledSession: { coach: ofPlan, athlete: athleteOwner },
  ScheduledSessionExercise: { coach: ofScheduledSession, athlete: athleteOwner },
  ScheduledSessionExerciseDocument: { coach: ofScheduledExercise },
  ScheduledSessionExerciseTag: { coach: ofScheduledExercise },
  SessionFeedback: { coach: feedbackOfSession, athlete: athleteOwner },
  // Le coach lit les médias IMBRIQUÉS dans le débrief, jamais à plat : sa clé ne sert à aucune
  // route, mais un modèle d'entraînement en porte une par construction (`TenantScope`).
  FeedbackMedia: {
    coach: throughRoot("sessionFeedback", feedbackOfSession),
    athlete: athleteOwner,
  },
  // La lecture d'un débrief par UN Coach (#610) : chacun pose et lit les siennes. L'athlète les
  // atteint à travers son débrief, pour les effacer quand il le complète — il n'en crée aucune.
  // Pas de `parent` : il jugerait le débrief en ÉCRITURE et en hériterait le propriétaire, or M ne
  // fait que le lire, et la lecture est à lui. C'est donc l'appelant qui prouve le débrief lisible
  // avant de poser la lecture (`CoachFeedbackService.markRead`, seul à en créer).
  SessionFeedbackRead: {
    coach: coachOwner,
    athlete: throughRoot("sessionFeedback", athleteOwner),
  },
  // Conversations à participants (#611) : chacun y lit ce à quoi il participe, à SON titre.
  Conversation: { coach: coachParticipation, athlete: athleteParticipation },
  ConversationParticipant: {
    coach: participantOf(coachParticipation, "COACH"),
    athlete: participantOf(athleteParticipation, "ATHLETE"),
  },
  Message: { coach: messageOf(coachParticipation), athlete: messageOf(athleteParticipation) },
  // La facture suit sa planification ; sans elle, elle reste privée à qui l'émet (#593, #607).
  Invoice: {
    coach: optionalChild("plan", sharedPlan, { model: "Plan", key: "planId", optional: true }),
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
  // Ses Coachs (#601) ; et, pour le Coach, ses entreprises (#605) — chacun sur sa colonne.
  OrganizationCoach: { company: issuingOrganization, coach: coachOwner },
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

/**
 * Une création à participants (#611) : l'acteur doit figurer, à son titre, parmi ceux que la ligne
 * crée avec elle. Une seule ligne, ses participants imbriqués en `create` : un `createMany` ne porte
 * pas de relation, et rien d'autre ne dirait qui en est.
 *
 * Les AUTRES participants ne se jugent pas ici : qui l'acteur a le droit de réunir dépend de ses
 * liens et de ses entreprises, que le service vérifie avant d'écrire. L'extension garantit le seul
 * invariant qui protège le scope — on ne crée pas une conversation dont on n'est pas.
 */
export function actorJoinsOrThrow(
  data: TenantFilter | TenantFilter[],
  membership: Membership,
  model: string,
  actorId: string,
): void {
  const nested = Array.isArray(data)
    ? undefined
    : (data[membership.relation] as Record<string, unknown> | undefined);
  // `create` SEUL : un `createMany` ou un `connect` à côté ajouterait des participants non vus.
  const members =
    nested != null && Object.keys(nested).every((key) => key === "create") ? nested.create : null;
  const joins =
    Array.isArray(members) &&
    members.some(
      (member: TenantFilter) =>
        member.userId === actorId && member.capability === membership.capability,
    );
  if (!joins) {
    throw new Error(
      `[tenancy] ${model} se crée avec l'acteur parmi ses ${membership.relation}, au titre ${membership.capability}`,
    );
  }
}

/**
 * Une écriture sur une ligne à participants (#611) ne touche ni ses participants ni ce qui en
 * dérive : la liste se fixe à la création, quand le service a vérifié chacun d'eux. Le scope
 * d'écriture d'une conversation est la participation, et laisserait sinon n'importe quel participant
 * y en joindre un autre.
 */
export function membershipFrozenOrThrow(
  data: unknown,
  membership: Membership,
  model: string,
): void {
  if (data == null || typeof data !== "object") return;
  const touched = [membership.relation, ...membership.frozen].filter((key) => key in data);
  if (touched.length > 0) {
    throw new Error(`[tenancy] ${model} ne modifie pas ${touched.join(", ")} après sa création`);
  }
}
