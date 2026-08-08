import { PlanStatus } from "../dto/plan.schema";
import { type InvoiceState, type InvoiceTiming, resolveInvoiceState } from "./invoice.util";
import { type PlanPeriod, planWeekNumber, selectCurrentPlan } from "./plan.util";

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
  athleteId: string;
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
    // Un brouillon n'est pas encore le cycle de l'athlète : il ne le voit pas, il ne compte pas ici.
    (input.plans ?? []).filter((plan) => plan.status === PlanStatus.PUBLISHED),
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
 */
function toRowPlan(plans: readonly AthletePlanSource[], today: string): AthleteRowPlan | null {
  const plan = selectCurrentPlan(plans, today);
  if (plan == null) return null;
  return {
    id: plan.id,
    title: plan.title,
    weekCount: plan.weekCount,
    currentWeek: planWeekNumber(plan, today),
  };
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
