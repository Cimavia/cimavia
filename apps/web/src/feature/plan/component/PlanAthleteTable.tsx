import type { PlanAthleteRow, PlanDeadline, PlanOverlap, PlanSummaryDto } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { PlanHistoryTable } from "@/feature/plan/component/PlanHistoryTable";
import { CMV_TABLE, CmvAvatar, CmvBadge } from "@/shared/component";
import { useAthleteLabel } from "@/shared/hook/useAthleteLabel";
import { cn } from "@/shared/util/cn.util";
import { formatDate } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values plan.table.columns: PLAN_ATHLETE_COLUMNS
// i18n-values plan.deadline: ENDS_THIS_WEEK, ENDS_IN, ENDED_THIS_WEEK, ENDED_SINCE, STARTS_ON

/**
 * Les planifications du coach, une ligne par athlète (#225, maquette frames 1 et 2).
 *
 * Ce que la reprise change vraiment : on ne lit plus des cycles, on lit des ATHLÈTES. Le coach ne
 * se demande pas « quels cycles existent » mais « où en est Léa » — la grille de cartes lui
 * laissait recomposer de tête qu'un même athlète en avait un en cours, un à venir et deux
 * terminés.
 *
 * Chaque ligne se déplie sur son historique. UN SEUL à la fois : la question posée à cet écran est
 * « qui », et déplier tout le monde la reposerait à zéro.
 */

const PLAN_ATHLETE_COLUMNS = ["athlete", "plan", "deadline"] as const;

/** L'en-tête et les lignes partagent leur grille — sinon les intitulés se décalent du contenu. */
const GRID = "grid grid-cols-[2fr_2fr_1.5fr_auto] items-center gap-cmv-lg";

type PlanAthleteTableProps = {
  rows: readonly PlanAthleteRow<PlanSummaryDto>[];
  /** `null` = tout est replié. */
  expandedAthleteId: string | null;
  onToggle: (athleteId: string) => void;
};

export function PlanAthleteTable({
  rows,
  expandedAthleteId,
  onToggle,
}: Readonly<PlanAthleteTableProps>) {
  const { t } = useTranslation();

  return (
    <div className={cn(CMV_TABLE.frame, "overflow-x-auto bg-cmv-surface")}>
      <div className="min-w-[44rem]">
        <div className={cn(GRID, CMV_TABLE.head, CMV_TABLE.headBorder, "px-cmv-lg py-cmv-sm")}>
          {PLAN_ATHLETE_COLUMNS.map((column) => (
            <span key={column} className={CMV_TABLE.headLabel}>
              {t(`plan.table.columns.${column}`)}
            </span>
          ))}
          {/* La colonne du chevron n'a pas d'intitulé : « déplier » se lit au symbole. */}
          <span />
        </div>

        {rows.map((row) => (
          <AthleteRow
            key={row.athleteId}
            row={row}
            expanded={row.athleteId === expandedAthleteId}
            onToggle={() => onToggle(row.athleteId)}
          />
        ))}
      </div>
    </div>
  );
}

type AthleteRowProps = {
  row: PlanAthleteRow<PlanSummaryDto>;
  expanded: boolean;
  onToggle: () => void;
};

function AthleteRow({ row, expanded, onToggle }: Readonly<AthleteRowProps>) {
  // « (moi) » se déduit de la session : un compte auto-coaché apparaît dans sa propre liste.
  const athleteLabel = useAthleteLabel();

  return (
    <div className={CMV_TABLE.row}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          GRID,
          "w-full px-cmv-lg py-cmv-md text-left transition-colors hover:bg-cmv-surface-hi",
        )}
      >
        <span className="flex items-center gap-cmv-sm">
          <CmvAvatar name={row.athleteName} />
          <span className="flex flex-col">
            <span className="text-cmv-text-hi">{athleteLabel(row.athleteId, row.athleteName)}</span>
            <OverlapFlag overlap={row.overlap} />
          </span>
        </span>

        <CurrentPlanCell row={row} />
        <DeadlineCell deadline={row.deadline} ending={row.situation === "ONGOING"} />

        <span aria-hidden className="text-cmv-text-lo">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {/* Pleine largeur, sans décalage ni rail : le dépli appartient au tableau, il ne s'en
          détache pas. Même géométrie que celui de la facturation. */}
      {expanded ? (
        <div className="flex flex-col gap-cmv-sm px-cmv-lg pb-cmv-md">
          <OverlapNotice overlap={row.overlap} plans={row.plans} />
          <PlanHistoryTable plans={row.plans} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Le cycle courant : son titre et sa pastille d'état — sa semaine s'il court, son époque sinon.
 *
 * `null` = aucun cycle DIFFUSÉ : l'athlète n'a que des brouillons, ce que « — » dit exactement.
 * Écrire « 0 cycle » serait faux (il en a), et nommer l'un de ses brouillons ferait croire qu'il
 * le voit.
 */
function CurrentPlanCell({ row }: Readonly<{ row: PlanAthleteRow<PlanSummaryDto> }>) {
  const { t } = useTranslation();
  const plan = row.currentPlan;
  if (plan == null) return <span className="text-cmv-text-lo">—</span>;

  return (
    <span className="flex min-w-0 items-center gap-cmv-sm">
      <span className="truncate text-cmv-text-hi">{plan.title}</span>
      {row.situation == null ? null : (
        <CmvBadge variant={row.situation === "ONGOING" ? "accent" : "info"}>
          {row.situation === "ONGOING"
            ? t("plan.row.week", { week: plan.currentWeek, total: plan.weekCount })
            : t(`plan.state.${row.situation}`)}
        </CmvBadge>
      )}
    </span>
  );
}

/**
 * L'échéance — et c'est elle qui rend l'ordre des lignes vérifiable à l'œil : lue de haut en bas,
 * la colonne raconte le tri. `@cmv/shared` rend un MOTIF et sa donnée ; c'est ici que le motif
 * devient une phrase, sans quoi elle serait du français figé dans un paquet partagé.
 *
 * `null` = rien de vrai à dire (aucun cycle diffusé, dates illisibles) → « — ».
 */
function DeadlineCell({
  deadline,
  ending,
}: Readonly<{ deadline: PlanDeadline | null; ending: boolean }>) {
  const { t } = useTranslation();
  if (deadline == null) return <span className="text-cmv-text-lo">—</span>;

  const line =
    deadline.kind === "STARTS_ON"
      ? t("plan.deadline.STARTS_ON", { date: formatDate(deadline.date) })
      : deadline.kind === "ENDS_IN" || deadline.kind === "ENDED_SINCE"
        ? t(`plan.deadline.${deadline.kind}`, { count: deadline.weeks })
        : t(`plan.deadline.${deadline.kind}`);

  /* La teinte suit l'ÉTAT et non le nombre de semaines : un cycle qui court est le moment dont le
     coach s'occupe, qu'il lui reste une semaine ou neuf. Même règle qu'en #120. */
  return <span className={ending ? "text-cmv-accent-on" : "text-cmv-text-mid"}>{line}</span>;
}

/**
 * Le signalement de chevauchement sur la ligne repliée (#172) : deux cycles diffusés courent, et
 * l'athlète n'en voit qu'un. Une pastille, pas un bandeau — la ligne doit rester d'une hauteur.
 */
function OverlapFlag({ overlap }: Readonly<{ overlap: PlanOverlap | null }>) {
  const { t } = useTranslation();
  if (overlap == null) return null;

  return (
    <span className="text-cmv-caption text-cmv-warning-on">
      {t("plan.overlap.flag", { n: overlap.hiddenPlanIds.length + 1 })}
    </span>
  );
}

/**
 * Le bandeau de l'anomalie, en TÊTE du dépli — comme celui de la facturation, et pour la même
 * raison : ce qui explique la ligne se lit avant son détail, pas au milieu du tableau.
 *
 * Il nomme le cycle INVISIBLE, jamais celui qui est servi : c'est le contre-intuitif de #172, et
 * c'est toute l'information. L'athlète voit le cycle commencé le plus TARD.
 */
function OverlapNotice({
  overlap,
  plans,
}: Readonly<{ overlap: PlanOverlap | null; plans: readonly PlanSummaryDto[] }>) {
  const { t } = useTranslation();
  if (overlap == null) return null;

  const hidden = plans
    .filter((plan) => overlap.hiddenPlanIds.includes(plan.id))
    .map((plan) => plan.title)
    .join(", ");

  return (
    <p className="rounded-cmv-md border border-cmv-warning-line bg-cmv-warning-soft px-cmv-md py-cmv-sm text-cmv-caption text-cmv-warning-on">
      {t("plan.overlap.notice", {
        from: formatDate(overlap.from),
        to: formatDate(overlap.to),
        hidden,
      })}
    </p>
  );
}
