import {
  PLAN_STATE_BADGE,
  type PlanState,
  type PlanSummaryDto,
  pageOf,
  planState,
  planWeekNumber,
  todayIsoDate,
} from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CMV_TABLE, CmvBadge, CmvButton } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";
import { formatDate } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values plan.history.columns: PLAN_HISTORY_COLUMNS
// i18n-values plan.state: PLAN_STATES

/**
 * L'historique des cycles d'UN athlète, déplié sous sa ligne (#225, maquette frames 3 et 4).
 *
 * L'ordre vient de `@cmv/shared` (`sortAthletePlans`, appliqué à la construction de la ligne) : du
 * cycle le plus récemment commencé au plus ancien. Ce composant ne fait que le DÉCOUPER en pages —
 * la décision d'ordre est une décision produit, elle est mesurée ailleurs.
 *
 * Cliquer une ligne ouvre le CONSTRUCTEUR, et non un panneau de détail : un cycle a déjà un écran
 * à lui, qui porte son en-tête éditable (#207), ses semaines, sa facturation et ses actions. Un
 * panneau en serait une version dégradée.
 */

const PLAN_HISTORY_COLUMNS = ["plan", "weeks", "startDate"] as const;

/**
 * L'en-tête et les lignes partagent leur grille — sinon les intitulés se décalent du contenu.
 *
 * La dernière piste est FIXE, et c'est ce qui rend la promesse ci-dessus vraie. En `auto`, elle ne
 * l'était pas : l'en-tête et chaque ligne sont des grilles SÉPARÉES, une piste `auto` s'y calcule
 * donc indépendamment — nulle pour le `<span />` de l'en-tête, large de la pastille pour une ligne,
 * et différente d'une ligne à l'autre selon que la pastille dit « À venir » ou « En cours · S3 ».
 * Le reste de la largeur, distribué en `fr`, décalait d'autant. Une piste fixe donne aux quatre
 * colonnes la même géométrie partout.
 */
const GRID = "grid grid-cols-[2fr_1fr_1.2fr_8rem] items-center gap-cmv-lg";

type PlanHistoryTableProps = {
  /** Déjà triés. Non vide : une ligne d'athlète naît d'au moins un cycle. */
  plans: readonly PlanSummaryDto[];
};

export function PlanHistoryTable({ plans }: Readonly<PlanHistoryTableProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  /**
   * La page vit ICI, et non dans l'URL : elle appartient à un athlète déplié et meurt avec lui.
   * Replier puis rouvrir repart donc de la première page — celle des cycles récents, la bonne.
   */
  const [page, setPage] = useState(1);
  const shown = pageOf(plans, page);
  const today = todayIsoDate();

  return (
    <div className={cn(CMV_TABLE.frame, "bg-cmv-bg-1")}>
      <div className={cn(GRID, CMV_TABLE.head, CMV_TABLE.headBorder, "px-cmv-md py-cmv-sm")}>
        {PLAN_HISTORY_COLUMNS.map((column) => (
          <span key={column} className={CMV_TABLE.headLabel}>
            {t(`plan.history.columns.${column}`)}
          </span>
        ))}
        {/* La colonne de la pastille n'a pas d'intitulé : l'état se lit sans qu'on le nomme. */}
        <span />
      </div>

      {shown.items.map((plan) => (
        <button
          key={plan.id}
          type="button"
          onClick={() => navigate({ to: "/plans/$planId", params: { planId: plan.id } })}
          className={cn(
            GRID,
            CMV_TABLE.row,
            "w-full px-cmv-md py-cmv-sm text-left transition-colors hover:bg-cmv-surface",
          )}
        >
          <span className="truncate text-cmv-text-hi">{plan.title}</span>
          <span className="font-cmv-display text-cmv-text-mid tabular-nums">
            {t("plan.history.weeks", { n: plan.weekCount })}
          </span>
          <span className="text-cmv-text-mid">{formatDate(plan.startDate)}</span>
          <span className="justify-self-end">
            <PlanStateBadge plan={plan} today={today} />
          </span>
        </button>
      ))}

      {/* Une seule page : ni compteur ni boutons. Une pagination qui ne pagine rien est du bruit. */}
      {shown.pageCount <= 1 ? null : (
        <div className="flex flex-wrap items-center justify-between gap-cmv-sm border-cmv-border border-t px-cmv-md py-cmv-sm">
          <span className="text-cmv-caption text-cmv-text-lo">
            {t("plan.history.range", { from: shown.from, to: shown.to, total: shown.total })}
          </span>
          <div className="flex items-center gap-cmv-xs">
            {Array.from({ length: shown.pageCount }, (_, index) => index + 1).map((number) => (
              <CmvButton
                key={number}
                variant={number === shown.page ? "secondary" : "ghost"}
                onClick={() => setPage(number)}
              >
                {String(number)}
              </CmvButton>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * L'état d'un cycle : brouillon, à venir, en cours (avec sa semaine), terminé.
 *
 * `null` = cycle non situable (dates illisibles). On n'écrit alors rien plutôt que d'inventer un
 * état — le ranger parmi les terminés donnerait au coach un travail qui n'existe pas.
 */
export function PlanStateBadge({ plan, today }: Readonly<{ plan: PlanSummaryDto; today: string }>) {
  const { t } = useTranslation();
  const state: PlanState | null = planState(plan, today);
  if (state == null) return null;

  return (
    <CmvBadge variant={PLAN_STATE_BADGE[state]}>
      {/* La semaine n'est interpolée que par « En cours », seul libellé à la porter. `ONGOING`
          garantit un numéro (invariant `planPhase` ⟺ `planWeekNumber`, tenu par un test). */}
      {t(`plan.state.${state}`, { week: planWeekNumber(plan, today) })}
    </CmvBadge>
  );
}
