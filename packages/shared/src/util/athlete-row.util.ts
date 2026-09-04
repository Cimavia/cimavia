import { PlanStatus } from "../dto/plan.schema";
import { type InvoiceState, type InvoiceTiming, resolveInvoiceState } from "./invoice.util";
import {
  type PlanPeriod,
  type PlanPhase,
  planEndDate,
  planPhase,
  planWeekNumber,
  selectCurrentPlan,
} from "./plan.util";
import { comparableText } from "./search.util";

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
  athleteId: string;
  /** `null` tant que la facture est un brouillon — elle n'est alors pas encore due à l'athlète. */
  issuedAt: string | null;
};

export type AthleteRowPlan = {
  id: string;
  title: string;
  weekCount: number;
  /** `null` = cycle pas encore commencé, ou terminé (cf. `planWeekNumber`). */
  currentWeek: number | null;
  /**
   * Ce que `currentWeek: null` ne dit pas : « pas encore commencé » et « terminé » sont deux
   * situations contraires, et seule la seconde appelle un geste du coach. `null` = cycle non
   * situable (dates illisibles) — ni l'une ni l'autre, et surtout pas rangé d'office parmi les
   * terminés.
   *
   * Recoupe `currentWeek` sur un point (`ONGOING` ⟺ `currentWeek != null`) sans le dupliquer :
   * `planPhase` est la source UNIQUE de l'époque, `planWeekNumber` celle du numéro de semaine, et
   * un test tient l'équivalence pour qu'elles ne dérivent jamais.
   */
  phase: PlanPhase | null;
  startDate: string;
  /** Dernier jour du cycle. `null` si `weekCount` est illisible (cf. `planEndDate`). */
  endDate: string | null;
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

  const plansByAthlete = groupBy(
    /**
     * Un brouillon n'est pas encore le cycle de l'athlète : il ne le voit pas, il ne compte pas
     * ici. Un cycle SANS destinataire (#144) tombe au même endroit, et pour une autre raison — il
     * n'appartient à personne. Inatteignable en pratique (un `PUBLISHED` a toujours un athlète,
     * `publish` l'exige), le cas est écarté quand même : le jour où le verrou bougerait, ces
     * cycles ne doivent surtout pas se ranger parmi les athlètes « sans plan », qui appellent un
     * geste du coach.
     */
    (input.plans ?? []).filter(
      (plan): plan is AthletePlanSource & { athleteId: string } =>
        plan.status === PlanStatus.PUBLISHED && plan.athleteId != null,
    ),
    (plan) => plan.athleteId,
  );
  // Groupés une fois : la colonne en tire son compteur ET l'id du débrief que le lien doit ouvrir.
  const unreadFeedbacksByAthlete = groupBy(
    (input.feedbacks ?? []).filter((feedback) => feedback.coachReadAt == null),
    (feedback) => feedback.athleteId,
  );
  const unreadMessagesByAthlete = new Map(
    (input.conversations ?? []).map((conversation) => [
      conversation.counterpartId,
      conversation.unreadCount,
    ]),
  );
  const issuedInvoicesByAthlete = groupBy(
    (input.invoices ?? []).filter((invoice) => invoice.issuedAt != null),
    (invoice) => invoice.athleteId,
  );

  return input.athletes.map((athlete) => ({
    athleteId: athlete.athleteId,
    athleteName: athlete.athleteName,
    plan:
      input.plans == null
        ? null
        : toRowPlan(plansByAthlete.get(athlete.athleteId) ?? [], input.today),
    unreadFeedbacks:
      input.feedbacks == null
        ? null
        : (unreadFeedbacksByAthlete.get(athlete.athleteId)?.length ?? 0),
    lastUnreadFeedbackId: latestFeedbackId(unreadFeedbacksByAthlete.get(athlete.athleteId) ?? []),
    // Pas encore de fil ouvert = 0 message non lu, pas « inconnu » : la liste a répondu.
    unreadMessages:
      input.conversations == null ? null : (unreadMessagesByAthlete.get(athlete.athleteId) ?? 0),
    invoiceState:
      input.invoices == null
        ? null
        : latestInvoiceState(issuedInvoicesByAthlete.get(athlete.athleteId) ?? [], input.today),
  }));
}

/**
 * Le cycle à afficher, choisi par `selectCurrentPlan` — source UNIQUE de ce choix (en cours > à
 * venir > terminé), qu'on ne reconstitue pas ici.
 *
 * Sa priorité donne à `phase` une propriété qu'elle n'aurait pas sur un cycle isolé : un
 * `ENDED` ici signifie « terminé ET rien derrière », puisqu'un cycle à venir aurait été élu à sa
 * place. C'est ce qui rend « ce cycle est fini » lisible comme « cet athlète attend une suite ».
 */
function toRowPlan(plans: readonly AthletePlanSource[], today: string): AthleteRowPlan | null {
  const plan = selectCurrentPlan(plans, today);
  if (plan == null) return null;
  return {
    id: plan.id,
    title: plan.title,
    weekCount: plan.weekCount,
    currentWeek: planWeekNumber(plan, today),
    phase: planPhase(plan, today),
    startDate: plan.startDate,
    endDate: planEndDate(plan.startDate, plan.weekCount),
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
 * la moitié de la décision hors de toute mesure de couverture (le web n'est pas instrumenté, §11) —
 * or l'ordre est une décision produit, pas un détail de rendu : il remplace le tri « activité
 * récente » de la maquette, écarté faute de donnée honnête (cf. #123).
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
  const needle = comparableText(query.search);

  return rows
    .filter((row) => matchesFilter(row, query.filter) && matchesSearch(row, needle))
    .sort((left, right) => left.athleteName.localeCompare(right.athleteName, query.locale));
}

function matchesSearch(row: AthleteRow, needle: string): boolean {
  // Sous-chaîne et non préfixe : un coach tape aussi bien le nom de famille que le prénom.
  return needle === "" || comparableText(row.athleteName).includes(needle);
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
     * existait un (cf. `toRowPlan`). Un `phase: null` (cycle non situable) n'est PAS capturé : on
     * ne range pas un cycle illisible parmi les terminés, ce serait inventer un travail au coach.
     */
    case "ENDED_PLAN":
      return row.plan?.phase === "ENDED";
  }
}

// Le débrief non lu le plus RÉCENT : c'est celui qu'ouvre le lien de la colonne, pas le plus ancien.
function latestFeedbackId(feedbacks: readonly AthleteFeedbackSource[]): string | null {
  let latest: AthleteFeedbackSource | null = null;
  for (const feedback of feedbacks) {
    if (latest == null || feedback.createdAt > latest.createdAt) latest = feedback;
  }
  return latest?.id ?? null;
}

/**
 * L'état de la facture émise la plus récente. Une seule pastille par athlète : le tableau répond à
 * « où en est la facturation », pas « combien de factures ». `resolveInvoiceState` peut rendre
 * `null` (échéance illisible) — on n'invente alors aucun état.
 */
function latestInvoiceState(
  invoices: readonly AthleteInvoiceSource[],
  today: string,
): InvoiceState | null {
  let latest: AthleteInvoiceSource | null = null;
  for (const invoice of invoices) {
    // `issuedAt` est non nul ici (les brouillons sont filtrés en amont) — d'où la comparaison directe.
    if (latest == null || (invoice.issuedAt ?? "") > (latest.issuedAt ?? "")) latest = invoice;
  }
  return latest == null ? null : resolveInvoiceState(latest, today);
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group == null) groups.set(key, [item]);
    else group.push(item);
  }
  return groups;
}
