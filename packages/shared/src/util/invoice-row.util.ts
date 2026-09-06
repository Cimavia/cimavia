import { InvoiceStatus } from "../dto/invoice.schema";
import { daysBetweenIsoDates } from "./date.util";
import { InvoiceState, type InvoiceTiming, resolveInvoiceState } from "./invoice.util";
import { HISTORY_PAGE_SIZE, type Page, pageOf } from "./pagination.util";
import { comparableText } from "./search.util";

/**
 * La facturation vue PAR ATHLÈTE (#120) : une ligne par personne facturée, dépliable sur son
 * historique — et non plus une liste plate de factures où le coach recomposait de tête à qui il
 * en manquait trois.
 *
 * Toute la dérivation vit ici, et pas dans l'écran : la situation d'un athlète, ce qu'il doit,
 * l'ordre des lignes et celui de leur historique sont des décisions PRODUIT. Un tri faux ne se
 * voit pas — rien à l'écran ne le signale — d'où des fonctions pures, mesurées, plutôt qu'une
 * composition dans le JSX.
 *
 * Comme `athlete-row.util.ts`, la jointure est faite côté client sur une liste déjà chargée
 * (`GET /invoices`, scopée par le tenant) : aucun endpoint d'agrégat, aucune requête de plus.
 */

/**
 * Ce dont une ligne dépend, et rien de plus — même idiome qu'`InvoiceTiming` : un `InvoiceDto`
 * complet convient, un objet réduit aussi, et les tests n'ont pas à fabriquer de factures
 * entières.
 */
export type InvoiceRowSource = InvoiceTiming & {
  athleteId: string;
  athleteName: string;
  /** Mois civil "YYYY-MM" : l'ordre lexical y EST l'ordre chronologique, d'où le tri direct. */
  period: string;
  amountCents: number;
  /** `null` tant qu'impayée. C'est elle qui date le « Dernière le … » d'un athlète à jour. */
  paidAt: string | null;
};

/**
 * Où en est un athlète, en un mot. Trois situations et pas quatre : une facture ANNULÉE n'est due
 * par personne — elle ne pèse ni sur la situation ni sur le montant dû, et reste néanmoins visible
 * dans l'historique (on ne fait pas disparaître une facture qui a existé).
 */
export const INVOICE_SITUATIONS = ["OVERDUE", "DUE", "UP_TO_DATE"] as const;
export type InvoiceSituation = (typeof INVOICE_SITUATIONS)[number];

/**
 * La situation se COLORE comme l'état de facture qu'elle résume, en passant par
 * `INVOICE_STATE_BADGE`. Surtout pas une seconde table de couleurs : elle dériverait de la
 * première, et le même athlète se lirait « en retard » en rouge sur un écran et en orange sur
 * l'autre. Le libellé, lui, reste au rendu — il porte un décompte (« 3 en retard »), que
 * `@cmv/shared` n'a pas à formuler.
 */
export const INVOICE_SITUATION_STATE = {
  OVERDUE: InvoiceState.OVERDUE,
  DUE: InvoiceState.PENDING,
  UP_TO_DATE: InvoiceState.PAID,
} as const satisfies Record<InvoiceSituation, InvoiceState>;

/**
 * Ce que dit le sous-titre d'une ligne, SANS le formuler — le rendu choisit sa clé i18n.
 *
 * Même dispositif que `REMINDER_REASON_KEY` et `NOTIFICATION_LABEL_KEY` : une phrase fabriquée ici
 * serait du français figé dans un paquet que les deux clients partagent, et elle ne parlerait
 * jamais anglais. On rend le MOTIF et sa donnée.
 */
export type InvoiceRowSubtitle =
  /** « Depuis 68 jours » — l'ancienneté du PLUS ANCIEN retard, celui qui décide de l'urgence. */
  | { kind: "OVERDUE_SINCE"; days: number }
  /** « Le 25 août » — la PROCHAINE échéance, celle qui vient. Date civile. */
  | { kind: "NEXT_DUE"; date: string }
  /** « Dernière le 2 août » — le DERNIER règlement reçu. Date civile. */
  | { kind: "LAST_PAID"; date: string };

export type InvoiceAthleteRow<T extends InvoiceRowSource = InvoiceRowSource> = {
  athleteId: string;
  athleteName: string;
  situation: InvoiceSituation;
  /**
   * Combien de factures dans cette situation — 3 en retard, 1 à échéance. `null` quand l'athlète
   * est à jour : il n'y a rien à compter, et « 0 » invitera toujours à chercher ce qui manque.
   */
  count: number | null;
  /**
   * La somme des factures NON RÉGLÉES, retards compris. `null` quand rien n'est dû : le rendu
   * écrit « — », jamais « 0 € » — un zéro se lit comme un montant, et il n'y en a pas.
   */
  amountDueCents: number | null;
  /** `null` quand rien de vrai ne peut être dit (aucune facture réglée, échéance illisible). */
  subtitle: InvoiceRowSubtitle | null;
  /** Tout l'historique, annulées comprises, DÉJÀ trié (cf. `sortAthleteInvoices`). */
  invoices: T[];
};

/**
 * Une ligne par athlète FACTURÉ — le tableau liste des factures, pas l'écurie. Un athlète qui n'a
 * jamais rien reçu n'a pas de ligne ; c'est l'état vide de l'écran qui le dit, et lui seul connaît
 * le nombre réel d'athlètes.
 *
 * `null` en entrée → `null` en sortie : une liste absente (chargement, panne) doit rendre un
 * écran d'erreur, jamais un tableau vide qui annoncerait « aucune facture ».
 *
 * Générique sur la source pour que l'appelant récupère SES objets dans `invoices` : le web passe
 * des `InvoiceDto` et lit `documentUrl` ou `note` sans rejoindre quoi que ce soit par id.
 */
export function buildInvoiceAthleteRows<T extends InvoiceRowSource>(
  invoices: readonly T[] | null | undefined,
  today: string,
): InvoiceAthleteRow<T>[] | null {
  if (invoices == null) return null;

  /**
   * Groupes NON VIDES par construction — le type le dit, plutôt qu'un `?? ""` sur le premier
   * élément : un repli silencieux fabriquerait une ligne sans athlète au lieu d'être impossible.
   */
  const byAthlete = new Map<string, [T, ...T[]]>();
  for (const invoice of invoices) {
    const group = byAthlete.get(invoice.athleteId);
    if (group == null) byAthlete.set(invoice.athleteId, [invoice]);
    else group.push(invoice);
  }

  return [...byAthlete.values()].map((group) => toRow(group, today));
}

function toRow<T extends InvoiceRowSource>(
  invoices: readonly [T, ...T[]],
  today: string,
): InvoiceAthleteRow<T> {
  /**
   * Non réglé = `status PENDING`, et non `resolveInvoiceState` : une échéance illisible rendrait
   * `null`, et la facture disparaîtrait du montant dû sans que personne ne le voie. Le STATUT, lui,
   * ne ment pas — PAID et CANCELLED sont les deux seules façons de ne plus rien devoir.
   */
  const unpaid = invoices.filter((invoice) => invoice.status === InvoiceStatus.PENDING);
  const overdue = unpaid.filter(
    (invoice) => resolveInvoiceState(invoice, today) === InvoiceState.OVERDUE,
  );

  const situation = pickSituation(overdue.length, unpaid.length);
  // Le tuple garantit un premier élément : l'athlète de la ligne est celui de ses factures.
  const [first] = invoices;

  return {
    athleteId: first.athleteId,
    athleteName: first.athleteName,
    situation,
    count: countOf(situation, overdue.length, unpaid.length),
    amountDueCents:
      unpaid.length === 0
        ? null
        : unpaid.reduce((total, invoice) => total + invoice.amountCents, 0),
    subtitle: toSubtitle(situation, invoices, overdue, unpaid, today),
    invoices: sortAthleteInvoices(invoices, today),
  };
}

function pickSituation(overdueCount: number, unpaidCount: number): InvoiceSituation {
  if (overdueCount > 0) return "OVERDUE";
  // Une facture émise dont l'échéance n'est pas passée : due, mais pas en retard.
  if (unpaidCount > 0) return "DUE";
  /**
   * Rien de non réglé. « À jour » énonce exactement cela — l'athlète ne doit rien — et non « tout
   * va bien » : un athlète dont l'unique facture a été annulée est à jour, sans avoir jamais payé.
   * Son sous-titre reste alors `null`, faute de règlement à dater.
   */
  return "UP_TO_DATE";
}

/**
 * Le décompte que porte la pastille, et il suit la situation : « 3 en retard » compte les retards,
 * « 1 à échéance » compte les factures dues. Un athlète en retard qui a AUSSI une facture à venir
 * n'affiche donc que ses retards — c'est ce qu'on lui demande de régler.
 */
function countOf(
  situation: InvoiceSituation,
  overdueCount: number,
  unpaidCount: number,
): number | null {
  if (situation === "OVERDUE") return overdueCount;
  if (situation === "DUE") return unpaidCount;
  return null;
}

function toSubtitle<T extends InvoiceRowSource>(
  situation: InvoiceSituation,
  invoices: readonly T[],
  overdue: readonly T[],
  unpaid: readonly T[],
  today: string,
): InvoiceRowSubtitle | null {
  if (situation === "OVERDUE") {
    /**
     * Le PLUS ANCIEN retard : c'est lui qui mesure l'urgence, pas le dernier arrivé. Les échéances
     * illisibles sont écartées AVANT le maximum — les garder ferait rendre `NaN` à `Math.max`, et
     * une seule date corrompue effacerait un sous-titre que les autres suffisaient à écrire.
     */
    const ages = overdue
      .map((invoice) => daysBetweenIsoDates(invoice.dueDate, today))
      .filter((days): days is number => days != null);
    // Liste vide inatteignable — être en retard suppose une échéance LISIBLE, `resolveInvoiceState`
    // l'ayant déjà exigée. Le repli est là pour le typage, pas pour un cas à chercher.
    return ages.length === 0 ? null : { kind: "OVERDUE_SINCE", days: Math.max(...ages) };
  }

  if (situation === "DUE") {
    // La PROCHAINE échéance : la plus proche, donc la plus petite date. `null` inatteignable —
    // « à échéance » suppose au moins une impayée. Le repli est là pour le typage.
    const next = minOf(unpaid.map((invoice) => invoice.dueDate));
    return next == null ? null : { kind: "NEXT_DUE", date: next };
  }

  /**
   * Le dernier règlement. `paidAt` est un INSTANT, le sous-titre parle d'un jour : on le tronque
   * ici pour que `formatIsoDate` reçoive une date civile comme partout ailleurs. Comparer les
   * chaînes ISO revient à les comparer chronologiquement, préfixe commun oblige.
   */
  const paidAt = maxOf(
    invoices
      .filter((invoice) => invoice.status === InvoiceStatus.PAID)
      .map((invoice) => invoice.paidAt)
      .filter((value): value is string => value != null),
  );
  return paidAt == null ? null : { kind: "LAST_PAID", date: paidAt.slice(0, 10) };
}

function minOf(values: readonly string[]): string | null {
  return values.reduce<string | null>(
    (best, value) => (best == null || value < best ? value : best),
    null,
  );
}

function maxOf(values: readonly string[]): string | null {
  return values.reduce<string | null>(
    (best, value) => (best == null || value > best ? value : best),
    null,
  );
}

/**
 * L'historique d'UN athlète : ses retards en tête, puis tout le reste, chaque bloc de la facture
 * la plus récente à la plus ancienne.
 *
 * Deux règles, et la seconde explique la première : on lit un historique du plus récent au plus
 * ancien, mais un retard qu'on ne voit qu'en page 3 n'est pas un retard qu'on relance. Épingler
 * les retards garde le geste à un clic, quelle que soit la page ouverte.
 *
 * Ne trie que sur `period`, jamais sur `issuedAt` : c'est le MOIS FACTURÉ que le coach cherche des
 * yeux, et deux factures émises le même jour pour deux mois différents doivent se ranger dans
 * l'ordre des mois.
 */
export function sortAthleteInvoices<T extends InvoiceRowSource>(
  invoices: readonly T[],
  today: string,
): T[] {
  const isOverdue = (invoice: T) =>
    resolveInvoiceState(invoice, today) === InvoiceState.OVERDUE ? 0 : 1;

  return [...invoices].sort(
    (left, right) => isOverdue(left) - isOverdue(right) || right.period.localeCompare(left.period),
  );
}

/**
 * Les segments de la barre d'outils. « Tous » n'est pas une situation — c'est l'absence de filtre,
 * et il ne se range donc pas dans `INVOICE_SITUATIONS`, qui décrit ce qu'un athlète PEUT être.
 */
export const INVOICE_ROW_FILTERS = ["ALL", ...INVOICE_SITUATIONS] as const;
export type InvoiceRowFilter = (typeof INVOICE_ROW_FILTERS)[number];

export type InvoiceRowQuery = {
  /** Recherche par nom d'athlète. Vide = aucune restriction. */
  search: string;
  filter: InvoiceRowFilter;
  /** Locale de tri, fournie par l'appelant (i18next) — comme les formateurs de `date-format.util`. */
  locale: string;
};

/** L'ordre des situations : ce qui appelle un geste d'abord, ce qui n'en appelle aucun ensuite. */
const SITUATION_RANK: Record<InvoiceSituation, number> = {
  OVERDUE: 0,
  DUE: 1,
  UP_TO_DATE: 2,
};

/**
 * Ce que le tableau affiche : les lignes retenues, **dans l'ordre où les afficher**.
 *
 * Sélection et tri dans la MÊME fonction, comme `visibleAthleteRows` : l'ordre est une décision
 * produit (« trié par retard le plus ancien »), pas un détail de rendu, et le composer dans le
 * composant éparpillerait la moitié de la décision.
 *
 * L'ordre se lit dans la colonne qu'il trie — c'est ce qui le rend vérifiable à l'œil : les
 * retards d'abord, du plus ancien au plus récent (« Depuis 68 jours » avant « Depuis 12 jours ») ;
 * puis les échéances à venir, de la plus proche à la plus lointaine ; puis les athlètes à jour,
 * par ordre alphabétique, qui n'appellent aucune hiérarchie.
 *
 * N'altère jamais `rows` : `filter` produit un nouveau tableau, que `sort` trie sur place.
 */
export function visibleInvoiceAthleteRows<T extends InvoiceRowSource>(
  rows: readonly InvoiceAthleteRow<T>[],
  query: InvoiceRowQuery,
): InvoiceAthleteRow<T>[] {
  const needle = comparableText(query.search);

  return rows
    .filter(
      (row) =>
        (query.filter === "ALL" || row.situation === query.filter) &&
        // Sous-chaîne et non préfixe : un coach tape aussi bien le nom que le prénom.
        (needle === "" || comparableText(row.athleteName).includes(needle)),
    )
    .sort(
      (left, right) =>
        SITUATION_RANK[left.situation] - SITUATION_RANK[right.situation] ||
        compareWithinSituation(left, right) ||
        left.athleteName.localeCompare(right.athleteName, query.locale),
    );
}

/**
 * Départage deux lignes de MÊME situation par leur sous-titre — celui-là même qui est affiché.
 * `0` quand rien ne les sépare (à jour, ou sous-titre absent) : le nom tranche alors, et l'ordre
 * reste stable au lieu de dépendre de celui d'arrivée de l'API.
 */
function compareWithinSituation(
  left: InvoiceAthleteRow<InvoiceRowSource>,
  right: InvoiceAthleteRow<InvoiceRowSource>,
): number {
  const a = left.subtitle;
  const b = right.subtitle;
  // Le plus ancien retard d'abord : le plus grand nombre de jours.
  if (a?.kind === "OVERDUE_SINCE" && b?.kind === "OVERDUE_SINCE") return b.days - a.days;
  // L'échéance la plus proche d'abord.
  if (a?.kind === "NEXT_DUE" && b?.kind === "NEXT_DUE") return a.date.localeCompare(b.date);
  return 0;
}

// ── Historique paginé ────────────────────────────────────────────────────────

/**
 * La pagination de l'historique vit dans `pagination.util.ts` depuis #225 : la liste des cycles
 * découpe le sien exactement pareil, à la même taille, et deux copies auraient fini par diverger
 * sur une borne. Les noms d'ici restent, eux, pour leurs appelants — ils disent CE QU'ON pagine.
 */
export const INVOICE_HISTORY_PAGE_SIZE = HISTORY_PAGE_SIZE;
export type InvoicePage<T> = Page<T>;
export const pageOfInvoices = pageOf;

/**
 * Combien d'athlètes dans chaque situation — les compteurs des segments. Comptés sur les lignes
 * NON filtrées : un segment doit annoncer ce qu'il contient, pas ce qu'il reste après le filtre
 * en cours, sinon « En retard 2 » deviendrait « En retard 0 » dès qu'on ouvre « À jour ».
 */
export function countAthletesBySituation(
  rows: readonly InvoiceAthleteRow<InvoiceRowSource>[],
): Record<InvoiceRowFilter, number> {
  return {
    ALL: rows.length,
    OVERDUE: rows.filter((row) => row.situation === "OVERDUE").length,
    DUE: rows.filter((row) => row.situation === "DUE").length,
    UP_TO_DATE: rows.filter((row) => row.situation === "UP_TO_DATE").length,
  };
}
