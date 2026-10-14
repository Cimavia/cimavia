import type { MyAccess } from "../dto/access.schema";
import { PlanStatus } from "../dto/plan.schema";
import { required } from "./invariant.util";
import { type InvoiceState, type InvoiceTiming, resolveInvoiceState } from "./invoice.util";
import {
  type PlanPeriod,
  type PlanPhase,
  planEndDate,
  planPhase,
  planWeekNumber,
  selectCurrentPlan,
} from "./plan.util";
import { searchMatcher } from "./search.util";

/**
 * Le tableau de suivi des athlètes du coach (#113) : une ligne par athlète, composée de cinq
 * sources déjà chargées par ailleurs (athlètes, cycles, débriefs, conversations, factures).
 *
 * **Jointure côté client, délibérément** — pas d'endpoint d'agrégat. Les cinq listes sont déjà en
 * cache pour d'autres écrans et partagent leurs clés ; les recomposer ici ne coûte aucune requête,
 * et cette fonction se réutilise telle quelle sur mobile (#30). Le jour où ça mordra, #114 tranche.
 *
 * Chaque type d'entrée décrit ce dont la ligne dépend, **et rien de plus** (même idiome
 * qu'`InvoiceTiming`) : un DTO complet convient, une ligne réduite aussi, et les tests n'ont pas à
 * fabriquer des objets entiers.
 */

export type AthleteIdentity = { athleteId: string; athleteName: string };

export type AthletePlanSource = PlanPeriod & {
  id: string;
  /**
   * `null` = brouillon dont le destinataire n'est pas encore choisi (#144). Un tel cycle
   * n'appartient à AUCUNE ligne du tableau, qui liste des athlètes — voir `buildAthleteRows`.
   */
  athleteId: string | null;
  title: string;
  status: PlanStatus;
  /** Le Coach qui a écrit le cycle, et ce que l'acteur en peut (#607) : cf. `PlanSummaryDto`. */
  coachName: string;
  myAccess: MyAccess | null;
};

export type AthleteFeedbackSource = {
  id: string;
  athleteId: string;
  coachReadAt: string | null;
  createdAt: string;
};

// La conversation nomme son interlocuteur `counterpartId` (elle est vue depuis le coach), pas
// `athleteId` : c'est le seul point de jointure qui change de nom d'une source à l'autre.
export type AthleteConversationSource = { counterpartId: string; unreadCount: number };

export type AthleteInvoiceSource = InvoiceTiming & {
  id: string;
  athleteId: string;
  /** `null` tant que la facture est un brouillon — elle n'est alors pas encore due à l'athlète. */
  issuedAt: string | null;
};

/** Une facture ÉMISE : les brouillons sont écartés avant le choix, et le type le dit. */
type IssuedInvoice = AthleteInvoiceSource & { issuedAt: string };

export type AthleteRowPlan = {
  id: string;
  title: string;
  weekCount: number;
  /** `null` = cycle pas encore commencé, ou terminé (cf. `planWeekNumber`). */
  currentWeek: number | null;
  /**
   * Ce que `currentWeek: null` ne dit pas : « pas encore commencé » et « terminé » sont deux
   * situations contraires, et seule la seconde appelle un geste du coach.
   *
   * Recoupe `currentWeek` sur un point (`ONGOING` ⟺ `currentWeek != null`) sans le dupliquer :
   * `planPhase` est la source UNIQUE de l'époque, `planWeekNumber` celle du numéro de semaine, et
   * un test tient l'équivalence pour qu'elles ne dérivent jamais.
   *
   * Jamais `null` : `selectCurrentPlan` n'élit que des cycles situables (#512). Un cycle aux dates
   * illisibles n'arrive pas jusqu'ici — l'athlète n'a alors pas de cycle courant.
   */
  phase: PlanPhase;
  startDate: string;
  /** Dernier jour du cycle — toujours calculable, pour la même raison que `phase`. */
  endDate: string;
  /**
   * Son propriétaire et le droit de l'acteur (#607) : le cycle courant d'un athlète suivi à
   * plusieurs peut être celui d'un autre Coach, et la ligne le dit.
   */
  coachName: string;
  myAccess: MyAccess | null;
};

export type AthleteRow = {
  athleteId: string;
  athleteName: string;
  /**
   * Le cycle diffusé courant. `null` = aucun **ou** liste des cycles indisponible : les deux se
   * rendent « — ». C'est l'écran, qui connaît l'état de ses requêtes, qui décide s'il propose
   * « Créer un cycle » — proposer de créer alors qu'on n'a pas pu lire serait le repli de trop.
   */
  plan: AthleteRowPlan | null;
  /** `null` = liste indisponible → « — ». `0` = tout est lu. Les deux ne disent pas la même chose. */
  unreadFeedbacks: number | null;
  /** Le plus récent débrief non lu, pour l'ouvrir directement. `null` s'il n'y en a aucun. */
  lastUnreadFeedbackId: string | null;
  unreadMessages: number | null;
  /** État de la DERNIÈRE facture émise. `null` = aucune, ou liste indisponible. */
  invoiceState: InvoiceState | null;
};

export type AthleteRowsInput = {
  athletes: readonly AthleteIdentity[] | null | undefined;
  plans: readonly AthletePlanSource[] | null | undefined;
  feedbacks: readonly AthleteFeedbackSource[] | null | undefined;
  conversations: readonly AthleteConversationSource[] | null | undefined;
  invoices: readonly AthleteInvoiceSource[] | null | undefined;
  /** Date CIVILE (`todayIsoDate()`) : `Invoice.dueDate` et `Plan.startDate` en sont, pas des instants. */
  today: string;
};

/**
 * `null` si la liste des athlètes est absente : sans elle il n'y a pas de lignes à composer, et un
 * tableau vide ferait croire que le coach n'a aucun athlète. Les autres sources, elles, manquent
 * colonne par colonne sans faire disparaître la ligne.
 *
 * Les sources sont indexées UNE fois par athlète plutôt que refiltrées à chaque ligne : la jointure
 * reste linéaire même quand un coach cumule des années de factures et de débriefs.
 */
export function buildAthleteRows(input: AthleteRowsInput): AthleteRow[] | null {
  if (input.athletes == null) return null;

  /**
   * Tous les cycles, brouillons compris : c'est `currentAthletePlan` qui écarte ceux que l'athlète
   * ne voit pas. Un cycle SANS destinataire (#144) se range sous la clé `null`, qu'aucun athlète
   * ne lit — il ne risque pas de passer pour le cycle de quelqu'un.
   */
  const plansOf = groupBy(listOf(input.plans), (plan) => plan.athleteId);
  // Groupés une fois : la colonne en tire son compteur ET l'id du débrief que le lien doit ouvrir.
  const unreadFeedbacksOf = groupBy(
    listOf(input.feedbacks).filter((feedback) => feedback.coachReadAt == null),
    (feedback) => feedback.athleteId,
  );
  const unreadMessagesByAthlete = new Map(
    listOf(input.conversations).map((conversation) => [
      conversation.counterpartId,
      conversation.unreadCount,
    ]),
  );
  const issuedInvoicesOf = groupBy(
    listOf(input.invoices).filter((invoice): invoice is IssuedInvoice => invoice.issuedAt != null),
    (invoice) => invoice.athleteId,
  );

  /**
   * Le cycle et la facture n'ont pas à distinguer une liste absente d'une liste vide : les deux
   * rendent `null` (« — »). Les compteurs, eux, le doivent — « 0 » est une réponse, que seule une
   * liste reçue autorise.
   */
  return input.athletes.map((athlete) => ({
    athleteId: athlete.athleteId,
    athleteName: athlete.athleteName,
    plan: currentAthletePlan(plansOf(athlete.athleteId), input.today),
    unreadFeedbacks: input.feedbacks == null ? null : unreadFeedbacksOf(athlete.athleteId).length,
    lastUnreadFeedbackId:
      latestOf(unreadFeedbacksOf(athlete.athleteId), (feedback) => feedback.createdAt)?.id ?? null,
    // Pas encore de fil ouvert = 0 message non lu, pas « inconnu » : la liste a répondu.
    unreadMessages:
      input.conversations == null ? null : (unreadMessagesByAthlete.get(athlete.athleteId) ?? 0),
    invoiceState: latestInvoiceState(issuedInvoicesOf(athlete.athleteId), input.today),
  }));
}

/**
 * Une liste absente se lit VIDE : chaque colonne décide elle-même, plus haut, si l'absence la
 * rend `null`. Le repli ne fabrique donc aucune valeur — il évite de traiter `null` cinq fois.
 */
function listOf<T>(items: readonly T[] | null | undefined): readonly T[] {
  // Stryker disable next-line ArrayDeclaration: une liste absente n'est jamais lue pour sa valeur
  return items ?? [];
}

/**
 * Le cycle à afficher pour un athlète, choisi par `selectCurrentPlan` — source UNIQUE de ce choix
 * (en cours > à venir > terminé), qu'on ne reconstitue pas ici.
 *
 * Sa priorité donne à `phase` une propriété qu'elle n'aurait pas sur un cycle isolé : un
 * `ENDED` ici signifie « terminé ET rien derrière », puisqu'un cycle à venir aurait été élu à sa
 * place. C'est ce qui rend « ce cycle est fini » lisible comme « cet athlète attend une suite ».
 *
 * Exportée depuis #225, où la liste des planifications a besoin du MÊME cycle courant que le
 * tableau de bord : deux dérivations parallèles finiraient par désigner deux cycles différents
 * pour le même athlète, sur deux écrans qu'un coach lit à la suite.
 *
 * Le filtre est ICI et non chez l'appelant, pour la même raison : un brouillon n'est pas encore le
 * cycle de l'athlète (il ne le voit pas), et un cycle sans destinataire n'appartient à personne
 * (#144). Laisser cette règle au bord ferait diverger le prochain écran qui s'y branche.
 */
export function currentAthletePlan<T extends AthletePlanSource>(
  plans: readonly T[],
  today: string,
): AthleteRowPlan | null {
  const published = plans.filter(
    (plan) => plan.status === PlanStatus.PUBLISHED && plan.athleteId != null,
  );
  const plan = selectCurrentPlan(published, today);
  if (plan == null) return null;
  return {
    id: plan.id,
    title: plan.title,
    weekCount: plan.weekCount,
    currentWeek: planWeekNumber(plan, today),
    // Stryker disable next-line StringLiteral: message d'un invariant que rien n'atteint
    phase: required(planPhase(plan, today), `cycle élu non situable : ${plan.id}`),
    startDate: plan.startDate,
    endDate: required(
      planEndDate(plan.startDate, plan.weekCount),
      // Stryker disable next-line StringLiteral: message d'un invariant que rien n'atteint
      `cycle élu sans fin : ${plan.id}`,
    ),
    coachName: plan.coachName,
    myAccess: plan.myAccess,
  };
}

/**
 * Les segments de la barre d'outils du tableau (#123).
 *
 * Les deux filtres décrivent le MÊME axe — l'état du cycle — et sont **disjoints par
 * construction** : une ligne a un cycle courant ou n'en a pas. Aucun athlète ne peut apparaître
 * sous les deux, et aucun ne recompte ce qu'une tuile annonce déjà (les tuiles comptent des
 * cycles, pas des athlètes qui en manquent).
 */
export const ATHLETE_ROW_FILTERS = ["ALL", "ENDED_PLAN", "NO_PLAN"] as const;

export type AthleteRowFilter = (typeof ATHLETE_ROW_FILTERS)[number];

export type AthleteRowQuery = {
  /** Recherche par nom. Vide = aucune restriction. */
  search: string;
  filter: AthleteRowFilter;
  /** Locale de tri, fournie par l'appelant (i18next) — comme les formateurs de `date-format.util`. */
  locale: string;
};

/**
 * Ce que le tableau affiche : les lignes retenues, **dans l'ordre où les afficher**.
 *
 * Sélection et tri dans la MÊME fonction, délibérément. Les composer dans le composant laisserait
 * la moitié de la décision derrière un test de rendu, qui ne l'atteint qu'à travers ce qui
 * s'affiche — le web EST instrumenté (§11 couvre les écrans), mais couvrir une ligne n'est pas
 * affirmer ce qu'elle décide. Or l'ordre est une décision produit, pas un détail de rendu : il
 * remplace le tri « activité récente » de la maquette, écarté faute de donnée honnête (cf. #123).
 *
 * L'ordre est **alphabétique**, et c'est le pendant de la recherche par nom : on cherche quelqu'un
 * par son nom, la liste est rangée par nom. L'ordre d'arrivée servi par l'API (`joinedAt desc`)
 * n'est perceptible par personne.
 *
 * N'altère jamais `rows` : `filter` produit un nouveau tableau, que `sort` trie sur place.
 */
export function visibleAthleteRows(
  rows: readonly AthleteRow[],
  query: AthleteRowQuery,
): AthleteRow[] {
  const matchesSearch = searchMatcher(query.search);

  return rows
    .filter((row) => matchesFilter(row, query.filter) && matchesSearch(row.athleteName))
    .sort((left, right) => left.athleteName.localeCompare(right.athleteName, query.locale));
}

function matchesFilter(row: AthleteRow, filter: AthleteRowFilter): boolean {
  switch (filter) {
    case "ALL":
      return true;
    /**
     * Aucun cycle diffusé. ⚠️ `plan: null` recouvre AUSSI « liste des cycles indisponible » : c'est
     * l'écran, seul à connaître l'état de ses requêtes, qui garantit de ne pas proposer ce filtre
     * quand la source a échoué — sinon il annoncerait toute l'écurie comme étant sans plan.
     */
    case "NO_PLAN":
      return row.plan == null;
    /**
     * Cycle terminé, et rien derrière — `selectCurrentPlan` aurait élu un cycle à venir s'il en
     * existait un (cf. `currentAthletePlan`). Un cycle non situable n'est jamais élu : il n'arrive
     * pas jusqu'ici, et ne risque donc pas d'être rangé parmi les terminés.
     */
    case "ENDED_PLAN":
      return row.plan?.phase === "ENDED";
  }
}

/**
 * Le plus RÉCENT selon `dateOf` — le débrief qu'ouvre le lien de la colonne, la facture qui donne
 * sa pastille. À date égale, le plus petit `id` : le choix ne doit pas dépendre de l'ordre
 * d'arrivée, sans quoi le lien et la pastille changeraient d'un chargement à l'autre.
 */
function latestOf<T extends { id: string }>(
  items: readonly T[],
  dateOf: (item: T) => string,
): T | null {
  const [latest] = [...items].sort(
    (left, right) => dateOf(right).localeCompare(dateOf(left)) || left.id.localeCompare(right.id),
  );
  return latest ?? null;
}

/**
 * L'état de la facture émise la plus récente. Une seule pastille par athlète : le tableau répond à
 * « où en est la facturation », pas « combien de factures ». `resolveInvoiceState` peut rendre
 * `null` (échéance illisible) — on n'invente alors aucun état.
 */
function latestInvoiceState(
  invoices: readonly IssuedInvoice[],
  today: string,
): InvoiceState | null {
  const latest = latestOf(invoices, (invoice) => invoice.issuedAt);
  return latest == null ? null : resolveInvoiceState(latest, today);
}

/** Les éléments groupés par clé, lus par une fonction qui rend `[]` pour une clé sans groupe. */
function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K): (key: K) => readonly T[] {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group == null) groups.set(key, [item]);
    else group.push(item);
  }
  return (key) => groups.get(key) ?? [];
}
