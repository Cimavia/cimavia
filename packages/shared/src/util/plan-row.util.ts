import { PlanStatus } from "../dto/plan.schema";
import {
  type AthletePlanSource,
  type AthleteRowPlan,
  currentAthletePlan,
} from "./athlete-row.util";
import { DAYS_PER_WEEK, daysBetweenIsoDates } from "./date.util";
import { type PlanPhase, planEndDate, planPhase } from "./plan.util";
import { comparableText } from "./search.util";

/**
 * La liste des planifications vue PAR ATHLÈTE (#225) : une ligne par personne, dépliable sur son
 * historique — et non plus une grille de cartes où le coach recomposait de tête qu'un même athlète
 * en avait un en cours, un à venir et deux terminés.
 *
 * Même dispositif qu'`invoice-row.util.ts` (#120), et pour la même raison : la situation d'un
 * athlète, l'ordre des lignes et celui de leur historique sont des décisions PRODUIT. Un tri faux
 * ne se voit pas — rien à l'écran ne le signale — d'où des fonctions pures et mesurées plutôt
 * qu'une composition dans le JSX, que la couverture n'atteint pas (§11).
 *
 * La jointure est faite côté client sur une liste déjà chargée (`GET /plans`, scopée par le
 * tenant) : aucun endpoint d'agrégat, aucune requête de plus. Corollaire assumé, le même qu'en
 * #120 : le tableau ne connaît que les athlètes qui ont AU MOINS UN CYCLE. Celui qui n'a jamais
 * rien reçu n'a pas de ligne — il reste visible au tableau de bord (#113), qui liste l'écurie
 * entière parce qu'il part des athlètes et non des cycles.
 */

/**
 * Ce dont une ligne dépend, et rien de plus — même idiome qu'`AthletePlanSource`, qu'elle étend
 * du seul nom du destinataire. Un `PlanSummaryDto` convient, un objet réduit aussi, et les tests
 * n'ont pas à fabriquer de cycles entiers.
 */
export type PlanRowSource = AthletePlanSource & {
  /** `null` avec `athleteId` : les deux décrivent la même absence de destinataire (#144). */
  athleteName: string | null;
};

/**
 * Ce que dit la colonne d'échéance, SANS le formuler — le rendu choisit sa clé i18n.
 *
 * Même dispositif qu'`InvoiceRowSubtitle` : une phrase fabriquée ici serait du français figé dans
 * un paquet que les deux clients partagent, et elle ne parlerait jamais anglais. On rend le MOTIF
 * et sa donnée.
 *
 * L'unité est la SEMAINE et non le jour, contrairement au sous-titre de la facturation : un cycle
 * se compte en semaines, « terminé depuis 21 jours » demanderait au coach une division que
 * « depuis 3 semaines » lui épargne. D'où les deux motifs `THIS_WEEK`, qui évitent l'unique
 * formulation que la semaine rend fausse — « dans 0 semaine ».
 */
export type PlanDeadline =
  /** Le cycle s'achève avant la fin de la semaine en cours. */
  | { kind: "ENDS_THIS_WEEK" }
  /** Il reste `weeks` semaines pleines, toujours ≥ 1. */
  | { kind: "ENDS_IN"; weeks: number }
  /** Le cycle s'est achevé dans la semaine en cours. */
  | { kind: "ENDED_THIS_WEEK" }
  /** Il s'est achevé il y a `weeks` semaines pleines, toujours ≥ 1. */
  | { kind: "ENDED_SINCE"; weeks: number }
  /** Le prochain cycle démarre à cette date civile. */
  | { kind: "STARTS_ON"; date: string };

/**
 * Deux cycles diffusés qui se chevauchent — l'anomalie de [#172], que cet écran est le seul
 * endroit du produit à pouvoir montrer.
 *
 * L'API n'en sert qu'un (`AthletePlanService.myCurrentPlan` → `selectCurrentPlan`), et l'athlète
 * ignore l'existence de l'autre. Ce type SIGNALE la situation, il ne la corrige pas : le correctif
 * vit côté API et reste ouvert. Le nommer ici est ce qui évite qu'on croie l'avoir traité.
 */
export type PlanOverlap = {
  /** Celui que l'athlète voit réellement — l'élu de `selectCurrentPlan`. */
  servedPlanId: string;
  /** Les autres, diffusés et en cours eux aussi, mais invisibles de l'athlète. Jamais vide. */
  hiddenPlanIds: [string, ...string[]];
  /** La fenêtre commune à tous ces cycles, bornes incluses — ce que le bandeau annonce. */
  from: string;
  to: string;
};

export type PlanAthleteRow<T extends PlanRowSource = PlanRowSource> = {
  athleteId: string;
  athleteName: string;
  /**
   * L'époque du cycle courant, qui EST la situation de l'athlète — `PlanPhase` et pas un second
   * vocabulaire : le tableau de bord (#113) range déjà ses athlètes avec, et deux échelles pour la
   * même chose finiraient par se contredire.
   *
   * `null` = aucun cycle DIFFUSÉ, et c'est un état à part entière : l'athlète n'a que des
   * brouillons — le coach a commencé, il n'a pas fini. Un cycle aux dates illisibles y tombe
   * aussi, `selectCurrentPlan` n'élisant que des cycles situables. Ni l'un ni l'autre ne se range
   * dans un segment : ils n'annoncent rien de vrai sur l'époque, et « Terminés » par défaut
   * inventerait un travail au coach.
   */
  situation: PlanPhase | null;
  /**
   * Le cycle à montrer, choisi par la source UNIQUE de ce choix (`currentAthletePlan`). `null`
   * quand aucun cycle n'est diffusé.
   */
  currentPlan: AthleteRowPlan | null;
  /** Ce qu'annonce la colonne de droite. `null` quand rien de vrai ne peut être dit. */
  deadline: PlanDeadline | null;
  /** `null` = rien d'anormal, le cas de très loin le plus fréquent. */
  overlap: PlanOverlap | null;
  /** TOUS ses cycles, brouillons affectés compris, DÉJÀ triés (cf. `sortAthletePlans`). */
  plans: T[];
};

/**
 * Une ligne par athlète ayant au moins un cycle.
 *
 * `null` en entrée → `null` en sortie : une liste absente (chargement, panne) doit rendre un écran
 * d'erreur, jamais un tableau vide qui annoncerait « aucune planification ».
 *
 * Générique sur la source pour que l'appelant récupère SES objets dans `plans` : le web passe des
 * `PlanSummaryDto` et lit `sessionCount` ou `status` sans rejoindre quoi que ce soit par id.
 */
export function buildPlanAthleteRows<T extends PlanRowSource>(
  plans: readonly T[] | null | undefined,
  today: string,
): PlanAthleteRow<T>[] | null {
  if (plans == null) return null;

  /**
   * Groupes NON VIDES par construction — le type le dit, plutôt qu'un `?? ""` sur le premier
   * élément : un repli silencieux fabriquerait une ligne sans athlète au lieu d'être impossible.
   *
   * Les brouillons SANS destinataire n'entrent pas ici : ils n'appartiennent à personne (#144) et
   * ont leur propre bac, en tête de l'écran (`unassignedDraftPlans`). Les ranger sous un athlète
   * « à définir » contredirait la règle dure n°5 — `null` n'est pas une valeur.
   */
  const byAthlete = new Map<string, [T, ...T[]]>();
  for (const plan of plans) {
    if (plan.athleteId == null) continue;
    const group = byAthlete.get(plan.athleteId);
    if (group == null) byAthlete.set(plan.athleteId, [plan]);
    else group.push(plan);
  }

  return [...byAthlete.values()].map((group) => toRow(group, today));
}

function toRow<T extends PlanRowSource>(
  plans: readonly [T, ...T[]],
  today: string,
): PlanAthleteRow<T> {
  // Le tuple garantit un premier élément : l'athlète de la ligne est celui de ses cycles.
  const [first] = plans;
  const currentPlan = currentAthletePlan(plans, today);

  return {
    // Non nuls sur ce chemin : le groupement a écarté les cycles sans destinataire, et #144 tient
    // les deux champs ensemble. Le repli est là pour le typage, pas pour un cas à chercher.
    athleteId: first.athleteId ?? "",
    athleteName: first.athleteName ?? "",
    situation: currentPlan?.phase ?? null,
    currentPlan,
    deadline: toDeadline(currentPlan, today),
    overlap: toOverlap(plans, currentPlan, today),
    plans: sortAthletePlans(plans),
  };
}

/**
 * Ce qu'annonce la colonne de droite, et c'est elle qui rend l'ordre des lignes VÉRIFIABLE À
 * L'ŒIL : lue de haut en bas, elle raconte le tri (cf. `visiblePlanAthleteRows`). Une colonne qui
 * ne refléterait pas l'ordre laisserait un tri faux passer inaperçu — c'est l'invariant que la
 * facturation s'est donné en #120, repris tel quel.
 *
 * `null` quand rien de vrai ne peut être dit : aucun cycle diffusé, ou cycle non situable. On
 * n'écrit alors rien plutôt qu'une phrase creuse.
 */
function toDeadline(plan: AthleteRowPlan | null, today: string): PlanDeadline | null {
  if (plan == null) return null;

  switch (plan.phase) {
    case "UPCOMING":
      return { kind: "STARTS_ON", date: plan.startDate };
    case "ONGOING": {
      const weeks = fullWeeksBetween(today, plan.endDate);
      if (weeks == null) return null;
      return weeks === 0 ? { kind: "ENDS_THIS_WEEK" } : { kind: "ENDS_IN", weeks };
    }
    case "ENDED": {
      const weeks = fullWeeksBetween(plan.endDate, today);
      if (weeks == null) return null;
      return weeks === 0 ? { kind: "ENDED_THIS_WEEK" } : { kind: "ENDED_SINCE", weeks };
    }
    /**
     * Cycle non situable. Inatteignable : `selectCurrentPlan` n'élit que des cycles dont la fin se
     * calcule, et `planPhase` ne rend `null` que sur ceux-là. Le cas est traité quand même, parce
     * qu'inventer une échéance sur des dates illisibles est exactement ce que la règle nullable
     * interdit — et parce que `AthleteRowPlan` autorise ce `null` dans son type.
     */
    case null:
      return null;
  }
}

/**
 * Combien de semaines PLEINES séparent deux dates. `null` si l'une n'est pas lisible — même repli
 * de typage que ci-dessus. Le plancher est délibéré : « dans 1 semaine » ne doit se dire qu'à
 * partir de sept jours, en deçà de quoi les motifs `THIS_WEEK` prennent le relais.
 */
function fullWeeksBetween(from: string | null, to: string | null): number | null {
  if (from == null || to == null) return null;
  const days = daysBetweenIsoDates(from, to);
  return days == null ? null : Math.floor(days / DAYS_PER_WEEK);
}

/**
 * Les cycles diffusés qui se chevauchent aujourd'hui (#172). `null` dès qu'il y en a moins de deux
 * — l'immense majorité des lignes.
 *
 * Le cycle SERVI est celui qu'a élu `currentAthletePlan`, et surtout pas le premier de la liste :
 * `selectCurrentPlan` retient le plus récemment démarré (« le coach en a diffusé un remplaçant »),
 * si bien que le cycle commencé le PLUS TÔT est celui que l'athlète ne voit pas. C'est
 * contre-intuitif, et c'est précisément ce qui rend l'anomalie invisible sans cet écran.
 */
function toOverlap<T extends PlanRowSource>(
  plans: readonly T[],
  currentPlan: AthleteRowPlan | null,
  today: string,
): PlanOverlap | null {
  if (currentPlan == null) return null;

  /**
   * Les cycles retenus portent leur fin CALCULÉE : un cycle en cours en a forcément une, et la
   * recalculer plus bas obligerait à retraiter un `null` qui ne peut plus se produire.
   */
  const ongoing = plans.flatMap((plan) => {
    if (plan.status !== PlanStatus.PUBLISHED || planPhase(plan, today) !== "ONGOING") return [];
    const endDate = planEndDate(plan.startDate, plan.weekCount);
    return endDate == null ? [] : [{ id: plan.id, startDate: plan.startDate, endDate }];
  });
  /**
   * Déstructuré plutôt que compté : « au moins deux » devient une paire que le typage porte, et
   * les bornes de la fenêtre s'accumulent alors depuis un cycle RÉEL — sans valeur initiale
   * inventée, et sans `reduce` sans accumulateur, que Sonar refuse à juste titre.
   */
  const [head, ...tail] = ongoing;
  if (head == null || tail.length === 0) return null;

  const hidden = ongoing.filter((plan) => plan.id !== currentPlan.id).map((plan) => plan.id);
  const [firstHidden, ...restHidden] = hidden;
  // Inatteignable — l'élu est l'un des cycles en cours, il en reste donc au moins un autre. Le
  // garde-fou est là pour le typage du tuple, pas pour un cas à chercher.
  if (firstHidden == null) return null;

  /**
   * La fenêtre COMMUNE : le plus tardif des débuts, le plus précoce des fins. C'est la période
   * pendant laquelle l'athlète est réellement privé d'un cycle, et non l'union des deux, qui
   * exagérerait l'anomalie.
   */
  const from = tail.reduce(
    (latest, plan) => (plan.startDate > latest ? plan.startDate : latest),
    head.startDate,
  );
  const to = tail.reduce(
    (earliest, plan) => (plan.endDate < earliest ? plan.endDate : earliest),
    head.endDate,
  );

  return { servedPlanId: currentPlan.id, hiddenPlanIds: [firstHidden, ...restHidden], from, to };
}

/**
 * L'historique d'UN athlète, du cycle le plus récemment commencé au plus ancien — brouillons
 * affectés compris, à leur date de début comme les autres.
 *
 * Un brouillon se range donc en tête dès que le coach le date après le cycle en cours, ce qui est
 * le cas courant : il construit la suite pendant que l'athlète termine. Surtout pas d'épinglage
 * des brouillons en tête — ce serait leur donner une urgence qu'ils n'ont pas, alors que
 * l'historique répond à « qu'est-ce que je lui ai construit », dans l'ordre où ça s'est produit.
 *
 * `id` départage les ex æquo : deux cycles peuvent partager un lundi de départ, et l'ordre doit
 * rester stable plutôt que de dépendre de celui d'arrivée de l'API.
 */
export function sortAthletePlans<T extends PlanRowSource>(plans: readonly T[]): T[] {
  return [...plans].sort(
    (left, right) =>
      right.startDate.localeCompare(left.startDate) || left.id.localeCompare(right.id),
  );
}

/**
 * Le bac des brouillons sans destinataire, en tête de l'écran.
 *
 * Ils n'appartiennent à personne : le coach construit un cycle avant de savoir pour qui (#144), et
 * c'est un ÉTAT actionnable, pas une donnée manquante. Ils ne peuvent donc pas vivre dans une
 * ligne d'athlète — d'où ce second retour plutôt qu'une septième ligne intitulée « à définir ».
 *
 * Le bac disparaît quand la liste est vide, ce que l'écran lit sur sa longueur.
 */
export function unassignedDraftPlans<T extends PlanRowSource>(plans: readonly T[]): T[] {
  return sortAthletePlans(
    plans.filter((plan) => plan.status === PlanStatus.DRAFT && plan.athleteId == null),
  );
}

// ── Barre d'outils : segments, recherche et ordre des lignes ─────────────────

/**
 * Les segments de la barre d'outils, dans l'ordre où ils s'affichent. « Tous » n'est pas une
 * époque — c'est l'absence de filtre, et il ne se range donc pas dans `PlanPhase`, qui décrit ce
 * qu'un cycle PEUT être.
 *
 * Aucun segment pour « aucun cycle diffusé » : un athlète dont tous les cycles sont des brouillons
 * n'apparaît que sous « Tous ». En ouvrir un quatrième donnerait un nom d'époque à ce qui n'en a
 * pas, et la maquette n'en prévoit pas — à rouvrir si le bac des brouillons ne suffit pas.
 */
export const PLAN_ROW_FILTERS = ["ALL", "ONGOING", "UPCOMING", "ENDED"] as const;
export type PlanRowFilter = (typeof PLAN_ROW_FILTERS)[number];

export type PlanRowQuery = {
  /** Recherche par nom d'athlète. Vide = aucune restriction. */
  search: string;
  filter: PlanRowFilter;
  /** Locale de tri, fournie par l'appelant (i18next) — comme les formateurs de `date-format.util`. */
  locale: string;
};

/**
 * L'ordre des situations : ce qui appelle un geste d'abord, ce qui n'en appelle aucun ensuite.
 *
 * `ENDED` en tête, et c'est le cœur de l'écran — un cycle terminé sans rien derrière est un
 * athlète qui n'a PLUS RIEN à faire, et `currentAthletePlan` aurait élu un cycle à venir s'il en
 * existait un. Puis ceux dont le cycle court encore, puis ceux dont la suite est déjà construite,
 * qui ne demandent rien à personne.
 *
 * `null` se glisse en deuxième : l'athlète n'a que des brouillons, il n'a donc rien reçu non plus,
 * mais le coach a commencé — moins pressant que celui dont rien n'est en chantier. Le cycle non
 * situable (dates illisibles) partage ce rang, faute de mieux : il n'annonce rien de vrai, et
 * l'inventer ailleurs serait pire.
 */
function rankOf(situation: PlanPhase | null): number {
  if (situation === "ENDED") return 0;
  if (situation == null) return 1;
  if (situation === "ONGOING") return 2;
  return 3;
}

/**
 * Ce que le tableau affiche : les lignes retenues, **dans l'ordre où les afficher**.
 *
 * Sélection et tri dans la MÊME fonction, comme `visibleInvoiceAthleteRows` et `visibleAthleteRows` :
 * l'ordre est une décision produit, pas un détail de rendu, et le composer dans le composant
 * éparpillerait la moitié de la décision hors de toute mesure de couverture.
 *
 * L'ordre se lit dans la colonne d'échéance, qui le trie — « terminé depuis 3 semaines », puis
 * « se termine dans 1 semaine », …, puis « commence le 21 sept. ». C'est ce qui le rend
 * vérifiable à l'œil, et ce qui a fait écarter la variante « nombre de cycles » de la maquette :
 * un décompte ne reflète aucun ordre.
 *
 * N'altère jamais `rows` : `filter` produit un nouveau tableau, que `sort` trie sur place.
 */
export function visiblePlanAthleteRows<T extends PlanRowSource>(
  rows: readonly PlanAthleteRow<T>[],
  query: PlanRowQuery,
): PlanAthleteRow<T>[] {
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
        rankOf(left.situation) - rankOf(right.situation) ||
        compareWithinSituation(left, right) ||
        left.athleteName.localeCompare(right.athleteName, query.locale),
    );
}

/**
 * Départage deux lignes de MÊME situation par la donnée que la colonne affiche — celle-là même que
 * le lecteur voit, sans quoi l'ordre cesserait d'y être vérifiable.
 *
 * Terminés et en cours se départagent sur la même clé, la date de FIN croissante, et les deux fois
 * pour la même raison : le plus proche du moment où l'athlète n'a plus rien passe devant. Un cycle
 * fini depuis longtemps devance donc un cycle fini hier, et un cycle qui s'achève demain devance
 * celui qui court encore deux mois. À venir se départagent sur le DÉBUT, la seule date qu'ils
 * affichent.
 *
 * `0` quand rien ne les sépare (dates illisibles, aucun cycle diffusé) : le nom tranche alors, et
 * l'ordre reste stable au lieu de dépendre de celui d'arrivée de l'API.
 */
function compareWithinSituation(
  left: PlanAthleteRow<PlanRowSource>,
  right: PlanAthleteRow<PlanRowSource>,
): number {
  const a = left.currentPlan;
  const b = right.currentPlan;
  if (a == null || b == null) return 0;

  if (left.situation === "UPCOMING") return a.startDate.localeCompare(b.startDate);
  if (a.endDate == null || b.endDate == null) return 0;
  return a.endDate.localeCompare(b.endDate);
}

/**
 * Combien d'athlètes dans chaque situation — les compteurs des segments. Comptés sur les lignes
 * NON filtrées : un segment doit annoncer ce qu'il contient, pas ce qu'il reste après le filtre en
 * cours, sinon « En cours 4 » deviendrait « En cours 0 » dès qu'on ouvre « Terminés ».
 *
 * Ils comptent des ATHLÈTES et non des cycles, parce que le tableau affiche des athlètes : « 18 »
 * au-dessus de six lignes ne répondrait à aucune question. `ALL` peut donc dépasser la somme des
 * trois autres — un athlète sans cycle diffusé n'appartient à aucune époque.
 */
export function countPlanAthletesBySituation(
  rows: readonly PlanAthleteRow<PlanRowSource>[],
): Record<PlanRowFilter, number> {
  return {
    ALL: rows.length,
    ONGOING: rows.filter((row) => row.situation === "ONGOING").length,
    UPCOMING: rows.filter((row) => row.situation === "UPCOMING").length,
    ENDED: rows.filter((row) => row.situation === "ENDED").length,
  };
}
