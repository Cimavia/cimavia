// Logique pure des planifications (cycle → semaines → séances), partagée API ↔ web ↔ mobile.
// S'appuie sur le calendrier générique (date.util) : ici, seule la notion de CYCLE est traitée.

import { PlanStatus, ScheduledSessionStatus } from "../dto/plan.schema";
import { DAYS_PER_WEEK, daysBetweenIsoDates, isIsoDate, shiftIsoDate } from "./date.util";

// Une semaine de plan, bornes incluses (lundi → dimanche).
export type PlanWeekRange = { startDate: string; endDate: string };

// Le strict nécessaire pour compter : le statut d'une séance planifiée.
export type SessionProgressSource = { status: string };

// Où en est une semaine : combien de séances faites sur combien de prévues.
export type SessionProgress = { done: number; total: number };

/**
 * L'avancement d'une semaine — « 2/5 séances faites ».
 *
 * Les deux nombres ensemble plutôt que deux fonctions : ils sont toujours affichés ensemble, et un
 * `done` sans son `total` ne veut rien dire. Un seul parcours, donc, et surtout **une seule
 * définition de « fait »** : `DONE`, posé par le débrief et par lui seul (`SKIPPED` n'est pas un
 * accomplissement, c'est une séance sautée).
 *
 * `null` sur une liste absente (chargement, panne) — jamais `{ done: 0, total: 0 }`, qui se lirait
 * « semaine vide, rien à faire » et rendrait une API injoignable indiscernable d'un repos.
 */
export function weekSessionProgress(
  sessions: readonly SessionProgressSource[] | null | undefined,
): SessionProgress | null {
  if (sessions == null) return null;
  return {
    done: sessions.filter((session) => session.status === ScheduledSessionStatus.DONE).length,
    total: sessions.length,
  };
}

// Le minimum pour situer un plan dans le temps : sa date de début et son nombre de semaines.
export type PlanPeriod = { startDate: string; weekCount: number };

// Une semaine désignée par son cycle : de quoi la situer dans le calendrier sans la charger.
// Les deux champs sont nécessaires — le numéro seul ne dit rien tant qu'on ignore d'où il compte.
export type PlanWeekRef = { planStartDate: string; weekNumber: number };

// Plage de la semaine `weekNumber` (1-based) d'un plan démarrant à `planStartDate` (un lundi,
// contrainte portée par planStartDateSchema) : aucune date n'est stockée sur PlanWeek, elle se
// déduit du seul `startDate` du plan → pas de dérive possible entre les deux.
export function planWeekRange(planStartDate: string, weekNumber: number): PlanWeekRange | null {
  if (!Number.isInteger(weekNumber) || weekNumber < 1) return null;
  const startDate = shiftIsoDate(planStartDate, (weekNumber - 1) * DAYS_PER_WEEK);
  if (startDate == null) return null;
  const endDate = shiftIsoDate(startDate, DAYS_PER_WEEK - 1);
  if (endDate == null) return null;
  return { startDate, endDate };
}

// Les 7 jours (lundi → dimanche) d'une semaine, à partir de son lundi. `null` si la date est
// illisible. Sert aussi bien au builder du coach qu'à la vue semaine de l'athlète.
export function planWeekDays(weekStartDate: string): string[] | null {
  const days: string[] = [];
  for (let index = 0; index < DAYS_PER_WEEK; index++) {
    const day = shiftIsoDate(weekStartDate, index);
    if (day == null) return null;
    days.push(day);
  }
  return days;
}

// Dernier jour du cycle (dimanche de la dernière semaine). `null` si le plan n'a aucune semaine.
export function planEndDate(planStartDate: string, weekCount: number): string | null {
  if (!Number.isInteger(weekCount) || weekCount < 1) return null;
  return shiftIsoDate(planStartDate, weekCount * DAYS_PER_WEEK - 1);
}

// La date tombe-t-elle dans la semaine `weekNumber` du plan ? (invariant vérifié à l'écriture
// d'une séance planifiée, côté API — et réutilisable par le client pour désactiver les jours.)
export function isDateInPlanWeek(planStartDate: string, weekNumber: number, date: string): boolean {
  const range = planWeekRange(planStartDate, weekNumber);
  if (range == null || !isIsoDate(date)) return false;
  return date >= range.startDate && date <= range.endDate;
}

/**
 * De combien de jours décaler le contenu d'une semaine copiée vers une autre (#4).
 *
 * Copier une semaine n'emporte PAS ses dates, seulement ce qui y est planifié : les
 * `scheduledDate` sont recalculées à partir du lundi de la semaine cible. Une séance du mardi
 * reste donc le mardi, mais du mardi de la semaine d'arrivée.
 *
 * Le décalage se prend entre les deux LUNDIS, jamais entre les numéros de semaine : `(M−N)×7`
 * ne vaut qu'à l'intérieur d'un même cycle, alors que la copie traverse aussi deux cycles aux
 * `startDate` différents. Les deux étant des lundis (`planStartDateSchema`), le résultat est
 * toujours un multiple de 7 — c'est ce qui préserve le jour de la semaine, et ce qui garde
 * `@@unique([planWeekId, scheduledDate, position])` satisfaite après translation.
 *
 * `null` si l'une des deux semaines n'est pas situable (date illisible, numéro hors bornes) —
 * surtout pas `0`, qui est un décalage LÉGITIME (deux semaines alignées) et ne doit pas servir
 * de repli à « je n'ai pas su calculer ».
 */
export function planWeekCopyShiftDays(source: PlanWeekRef, target: PlanWeekRef): number | null {
  const from = planWeekRange(source.planStartDate, source.weekNumber);
  const to = planWeekRange(target.planStartDate, target.weekNumber);
  if (from == null || to == null) return null;
  return daysBetweenIsoDates(from.startDate, to.startDate);
}

/**
 * Dans quelle semaine du cycle tombe `date` — le « S3 » de « S3/4 », 1-based.
 *
 * `null` dès que la date est HORS du cycle (avant son lundi de départ, ou après son dernier
 * dimanche) : un cycle qui n'a pas commencé n'en est pas à sa semaine 1, et un cycle terminé n'en
 * est pas à sa dernière. Rendre 1 ou `weekCount` dans ces cas afficherait une progression inventée
 * — c'est exactement le repli silencieux que la règle nullable interdit.
 *
 * Se déduit du seul `startDate` (un lundi) : aucune date n'est stockée sur `PlanWeek`, donc aucune
 * dérive possible entre les deux représentations.
 */
export function planWeekNumber(plan: PlanPeriod, date: string): number | null {
  if (!Number.isInteger(plan.weekCount) || plan.weekCount < 1) return null;

  const elapsed = daysBetweenIsoDates(plan.startDate, date);
  if (elapsed == null || elapsed < 0) return null;

  const weekNumber = Math.floor(elapsed / DAYS_PER_WEEK) + 1;
  return weekNumber > plan.weekCount ? null : weekNumber;
}

// Où un cycle se situe par rapport à une date : il l'attend, il la contient, il l'a dépassée.
export type PlanPhase = "UPCOMING" | "ONGOING" | "ENDED";

/**
 * L'époque d'un cycle — ce que `planWeekNumber` ne dit pas.
 *
 * `planWeekNumber` répond « quelle semaine », et son `null` recouvre DEUX situations contraires :
 * pas encore commencé, et déjà fini. L'affichage comme le filtrage doivent les séparer — un cycle
 * à venir est un cycle que le coach a DÉJÀ planifié, un cycle terminé est un athlète à relancer.
 * Les confondre reviendrait à dire la même chose de deux états opposés.
 *
 * Les deux fonctions ne peuvent pas diverger : `ONGOING` vaut exactement quand `planWeekNumber`
 * rend un numéro — mêmes bornes de part et d'autre, invariant tenu par un test.
 *
 * `null` quand le cycle n'est pas situable (date illisible, `weekCount` invalide) — surtout pas une
 * époque par défaut, qui rangerait un cycle illisible parmi les terminés et le ferait ressortir
 * dans un filtre « à relancer ».
 */
export function planPhase(plan: PlanPeriod, date: string): PlanPhase | null {
  // `planEndDate` rend `null` sur un `startDate` illisible comme sur un `weekCount` invalide : les
  // deux causes d'un cycle non situable passent par ce seul test.
  const endDate = planEndDate(plan.startDate, plan.weekCount);
  if (endDate == null || !isIsoDate(date)) return null;

  if (date < plan.startDate) return "UPCOMING";
  if (date > endDate) return "ENDED";
  return "ONGOING";
}

/**
 * Un cycle et sa fin CALCULÉE. Un cycle dont la fin ne se calcule pas (dates illisibles,
 * `weekCount` invalide) n'entre pas dans la liste : il n'est situable dans aucune époque, et
 * l'élire reviendrait à annoncer un cycle dont on ne sait pas s'il a commencé.
 */
type DatedPlan<T> = { plan: T; endDate: string };

function withEndDates<T extends PlanPeriod>(plans: readonly T[]): DatedPlan<T>[] {
  return plans.flatMap((plan) => {
    const endDate = planEndDate(plan.startDate, plan.weekCount);
    return endDate == null ? [] : [{ plan, endDate }];
  });
}

const isOngoing = <T extends PlanPeriod>(entry: DatedPlan<T>, today: string): boolean =>
  entry.plan.startDate <= today && today <= entry.endDate;

/**
 * Le cycle qui RÉSUME un athlète en une ligne, parmi ses cycles diffusés :
 * en cours > à venir (le plus proche) > terminé (le plus récent) > `null`.
 *
 * ⚠️ Ce n'est PAS ce que l'athlète voit — `selectVisiblePlans` l'est depuis #172. Les cycles
 * diffusés s'accumulent chez lui ; celui-ci n'en désigne qu'un, parce qu'une COLONNE n'en contient
 * qu'un : le tableau de bord du coach (#113) et la liste des planifications (#225) doivent dire
 * « où en est Léa » en une cellule, et « plusieurs » n'est pas une réponse à cette question.
 *
 * Quand plusieurs cycles courent, le résumé retient le plus récemment démarré — le plus proche de
 * ce que le coach vient de construire. Il n'est plus dit qu'il « remplace » les autres : c'était
 * vrai du temps où l'API n'en servait qu'un, et c'est précisément le défaut qu'a corrigé #172.
 *
 * Source UNIQUE de ce choix (API + clients) — ne pas le reconstituer ailleurs.
 */
export function selectCurrentPlan<T extends PlanPeriod>(
  plans: readonly T[],
  today: string,
): T | null {
  if (!isIsoDate(today)) return null;

  const dated = withEndDates(plans);

  const ongoing = dated.filter((entry) => isOngoing(entry, today));
  if (ongoing.length > 0) return pickByStartDate(ongoing, "latest");

  const upcoming = dated.filter((entry) => entry.plan.startDate > today);
  if (upcoming.length > 0) return pickByStartDate(upcoming, "earliest");

  return pickByStartDate(
    dated.filter((entry) => entry.endDate < today),
    "latest",
  );
}

/**
 * TOUS les cycles diffusés qu'un athlète voit à la date `today` (#172) — en cours d'abord, puis à
 * venir, chacun par date de début croissante.
 *
 * Les cycles diffusés **s'accumulent** : un coach qui en diffuse un second ne remplace pas le
 * premier, il ajoute du travail. C'est le correctif de #172 — l'API n'en servait qu'un
 * (`selectCurrentPlan`), si bien qu'un cycle pouvait être diffusé, facturé et notifié tout en
 * restant invisible de son destinataire, sans que rien nulle part ne le signale.
 *
 * **Les cycles à venir sont servis**, et c'est délibéré : ils sont diffusés, donc promis, et
 * l'athlète a le droit de savoir ce qui l'attend. Ils ne l'étaient pas avant, faute de place dans
 * une réponse à un seul cycle.
 *
 * **Repli sur le dernier cycle terminé, seul**, quand plus rien ne court ni n'arrive. Ce n'est pas
 * une complaisance mais l'état « hors cycle » que les deux clients affichent déjà : sans lui, un
 * athlète entre deux cycles verrait un écran vide au lieu du dernier cycle reçu.
 *
 * Rend une liste VIDE, jamais `null` : « aucun cycle diffusé » est une réponse, et le `null` reste
 * réservé à la requête qui n'a pas abouti — les deux clients distinguent déjà les deux, et les
 * confondre ferait attendre son coach à un athlète qui n'a qu'une panne réseau.
 *
 * `id` départage les cycles partant le même lundi, comme `sortAthletePlans` : l'ordre doit être
 * stable plutôt que de dépendre de celui d'arrivée de l'API.
 */
export function selectVisiblePlans<T extends PlanPeriod & { id: string }>(
  plans: readonly T[],
  today: string,
): T[] {
  if (!isIsoDate(today)) return [];

  const dated = withEndDates(plans);
  const ongoing = dated.filter((entry) => isOngoing(entry, today));
  const upcoming = dated.filter((entry) => entry.plan.startDate > today);

  if (ongoing.length + upcoming.length > 0) {
    return [...byStartDateThenId(ongoing), ...byStartDateThenId(upcoming)];
  }

  const last = pickByStartDate(
    dated.filter((entry) => entry.endDate < today),
    "latest",
  );
  return last == null ? [] : [last];
}

function byStartDateThenId<T extends PlanPeriod & { id: string }>(
  entries: readonly DatedPlan<T>[],
): T[] {
  return entries
    .map((entry) => entry.plan)
    .sort(
      (left, right) =>
        left.startDate.localeCompare(right.startDate) || left.id.localeCompare(right.id),
    );
}

function pickByStartDate<T extends PlanPeriod>(
  entries: readonly { plan: T }[],
  pick: "earliest" | "latest",
): T | null {
  let best: T | null = null;
  for (const { plan } of entries) {
    if (best == null) {
      best = plan;
      continue;
    }
    const wins =
      pick === "latest" ? plan.startDate > best.startDate : plan.startDate < best.startDate;
    if (wins) best = plan;
  }
  return best;
}

/**
 * Le strict nécessaire pour situer un cycle parmi ceux de son athlète — même idiome que
 * `PlanRowSource` : un `PlanSummaryDto` convient, un objet réduit aussi.
 */
export type PlanAudienceSource = PlanPeriod & {
  id: string;
  athleteId: string | null;
  status: PlanStatus;
};

/**
 * Ce que l'athlète voit DE CE CYCLE, dit au coach sur l'écran où il le construit (#172).
 *
 * Le motif se rend, jamais la phrase : même dispositif que `PlanDeadline` — une phrase française
 * fabriquée dans `@cmv/shared` ne parlerait jamais anglais.
 *
 * Six cas, et pas un booléen, parce qu'ils n'appellent pas la même chose du coach. Le constructeur
 * affirmait « L'athlète voit ce cycle » dès la diffusion, sans condition : c'est le mensonge que
 * #172 a reproduit au curl, et un `true`/`false` en aurait simplement réduit la portée.
 */
export type PlanAudience =
  /** Brouillon : personne ne le voit encore. */
  | { kind: "NOT_PUBLISHED" }
  /** Diffusé et visible, mais il ne commence qu'à cette date. */
  | { kind: "VISIBLE_UPCOMING"; startDate: string }
  /** En cours, et seul à l'être : le cas normal. */
  | { kind: "VISIBLE_ALONE" }
  /** En cours, mais l'athlète en mène d'autres de front — une charge, pas une erreur. */
  | { kind: "VISIBLE_WITH"; otherPlanIds: [string, ...string[]] }
  /** Terminé, et l'athlète est passé à autre chose : il ne le voit plus. */
  | { kind: "ENDED_SUPERSEDED"; insteadPlanIds: [string, ...string[]] }
  /** Terminé, et c'est le dernier reçu : l'athlète le voit encore, faute de suite. */
  | { kind: "ENDED_LAST" };

/**
 * Dérivée de `selectVisiblePlans`, et surtout pas d'une règle recopiée : ce que le coach lit doit
 * être ce que l'API sert, et deux dérivations parallèles finiraient par se contredire — sur ce
 * sujet précisément, puisque c'est un écart entre les deux qui a produit #172.
 *
 * `athletePlans` peut contenir TOUS les cycles du coach : le filtrage sur le destinataire se fait
 * ici, là où on voit qu'il se fait. Laisser ce tri à l'appelant, c'est un jour comparer un cycle à
 * ceux d'un autre athlète.
 *
 * `null` quand le cycle n'est pas situable (dates illisibles, `weekCount` invalide) — **surtout
 * pas** « il le voit » par défaut : c'est le repli silencieux qu'interdit la règle dure n°5, et
 * c'est la nature même du défaut qu'on corrige.
 */
export function planAudience<T extends PlanAudienceSource>(
  plan: T,
  athletePlans: readonly T[],
  today: string,
): PlanAudience | null {
  if (plan.status !== PlanStatus.PUBLISHED) return { kind: "NOT_PUBLISHED" };

  const phase = planPhase(plan, today);
  if (phase == null) return null;

  const siblings = athletePlans.filter(
    (candidate) =>
      candidate.status === PlanStatus.PUBLISHED && candidate.athleteId === plan.athleteId,
  );
  const visible = selectVisiblePlans(siblings, today);
  const others = visible.filter((candidate) => candidate.id !== plan.id);

  if (!visible.some((candidate) => candidate.id === plan.id)) {
    // Seul un cycle TERMINÉ peut être écarté : en cours et à venir sont toujours servis.
    const [first, ...rest] = others.map((candidate) => candidate.id);
    return first == null
      ? { kind: "ENDED_LAST" }
      : { kind: "ENDED_SUPERSEDED", insteadPlanIds: [first, ...rest] };
  }

  if (phase === "UPCOMING") return { kind: "VISIBLE_UPCOMING", startDate: plan.startDate };
  if (phase === "ENDED") return { kind: "ENDED_LAST" };

  const [first, ...rest] = others
    .filter((candidate) => planPhase(candidate, today) === "ONGOING")
    .map((candidate) => candidate.id);
  return first == null
    ? { kind: "VISIBLE_ALONE" }
    : { kind: "VISIBLE_WITH", otherPlanIds: [first, ...rest] };
}

/**
 * Le cycle qu'un coach s'est écrit à lui-même (auto-coaching, #14).
 *
 * Une fonction nommée plutôt qu'un `coachId === athleteId` recopié : la comparaison est triviale,
 * mais ce qu'elle SIGNIFIE ne l'est pas — un cycle solo ne se facture pas, ne notifie personne, et
 * n'affiche donc pas la section de facturation du builder. Trois endroits qui doivent rester
 * d'accord entre eux.
 *
 * Un cycle SANS destinataire (#144) n'est pas solo : `false`, et c'est la bonne réponse — il n'est
 * écrit pour personne, pas pour soi. Ce sont deux absences différentes, et les confondre rouvrirait
 * la facturation d'un cycle qui n'a personne à facturer.
 */
export function isSelfCoached(plan: { coachId: string; athleteId: string | null }): boolean {
  return plan.athleteId != null && plan.coachId === plan.athleteId;
}

/**
 * Ce qu'une pastille de cycle annonce (#225) : son STATUT tant qu'il est brouillon, son ÉPOQUE
 * ensuite. Quatre valeurs et pas deux échelles côte à côte — un brouillon daté de la semaine
 * prochaine n'est pas « à venir », il n'est encore promis à personne.
 */
export const PLAN_STATES = ["DRAFT", "UPCOMING", "ONGOING", "ENDED"] as const;
export type PlanState = (typeof PLAN_STATES)[number];

/**
 * `null` quand le cycle n'est pas situable (dates illisibles) — surtout pas un état par défaut,
 * qui rangerait un cycle illisible parmi les terminés.
 */
export function planState(
  plan: PlanPeriod & { status: PlanStatus },
  date: string,
): PlanState | null {
  return plan.status === PlanStatus.DRAFT ? "DRAFT" : planPhase(plan, date);
}

/**
 * La couleur de chaque état, décidée sur la maquette et tenue en un seul endroit — comme
 * `INVOICE_STATE_BADGE`. Une seconde table dériverait de celle-ci, et le même cycle se lirait
 * « en cours » en orange sur un écran et en bleu sur l'autre.
 *
 * L'accent terracotta est réservé à l'action primaire — et à « en cours », qui EST le moment dont
 * le coach s'occupe. Écart assumé à la planche : « terminé » y est plus en retrait que
 * « brouillon » (fond transparent contre fond plein), nuance que `CmvBadge` n'a pas et qui
 * demanderait une variante de plus au design system.
 */
export const PLAN_STATE_BADGE = {
  DRAFT: "neutral",
  UPCOMING: "info",
  ONGOING: "accent",
  ENDED: "neutral",
} as const satisfies Record<PlanState, "neutral" | "info" | "accent">;
