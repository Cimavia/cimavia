import {
  buildPlanAthleteRows,
  countPlanAthletesBySituation,
  type PlanRowFilter,
  type PlanSummaryDto,
  todayIsoDate,
  visiblePlanAthleteRows,
} from "@cmv/shared";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PlanAthleteTable } from "@/feature/plan/component/PlanAthleteTable";
import { PlanToolbar } from "@/feature/plan/component/PlanToolbar";
import type { PlansSearch } from "@/routes/plans.index";
import { CmvEmptyState } from "@/shared/component";

const route = getRouteApi("/plans/");

/**
 * Le tableau des planifications du coach et sa barre d'outils (#225).
 *
 * La section possède l'état de sa vue — lu dans l'URL, pas dans un `useState` — plutôt que de le
 * recevoir en props : les quatre décisions qui en dépendent (que filtrer, quoi rendre, quel vide,
 * quel athlète est déplié) tiennent alors dans un seul endroit, et l'écran n'a pas à connaître un
 * réglage d'affichage qui ne le regarde pas. Même découpe que `CoachInvoiceSection` (#120).
 */

type CoachPlanSectionProps = {
  /** Tous les cycles servis par `GET /plans`, brouillons sans destinataire compris. */
  plans: readonly PlanSummaryDto[];
};

export function CoachPlanSection({ plans }: Readonly<CoachPlanSectionProps>) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { q, state, athlete } = route.useSearch();

  const filter: PlanRowFilter = state ?? "ALL";
  /**
   * `plans` est toujours défini ici — l'écran ne monte la section qu'une fois la liste servie, et
   * c'est lui qui rend l'erreur. Le `?? []` n'est donc pas un repli sur l'absence de données mais
   * le typage d'un retour nullable dont le `null` est déjà écarté en amont.
   */
  const rows = buildPlanAthleteRows(plans, todayIsoDate()) ?? [];
  const visible = visiblePlanAthleteRows(rows, { search: q ?? "", filter, locale: i18n.language });
  const counts = countPlanAthletesBySituation(rows);

  /**
   * `replace` partout : la barre est un RÉGLAGE DE VUE, pas une étape de navigation. Sans lui,
   * chaque frappe au clavier empilerait une entrée d'historique, et le bouton Retour rembobinerait
   * la saisie au lieu de quitter l'écran.
   */
  const go = (next: Partial<PlansSearch>) =>
    navigate({ to: "/plans", search: { q, state, athlete, ...next }, replace: true });

  return (
    <div className="flex flex-col gap-cmv-lg">
      <PlanToolbar
        search={q ?? ""}
        filter={filter}
        counts={counts}
        onSearchChange={(next) => go({ q: next || undefined })}
        // « Tous » ne s'écrit pas dans l'URL : c'est la valeur par défaut, l'y laisser serait du bruit.
        onFilterChange={(next) => go({ state: next === "ALL" ? undefined : next })}
      />

      {visible.length === 0 ? (
        /* Aucun athlète ne correspond — ce n'est PAS « aucune planification ». Les confondre
           enverrait le coach construire un cycle alors qu'il lui suffit de vider sa recherche. */
        <CmvEmptyState
          title={t("plan.noMatch.title")}
          description={t("plan.noMatch.description")}
        />
      ) : (
        <PlanAthleteTable
          rows={visible}
          expandedAthleteId={athlete ?? null}
          // Recliquer sur l'athlète déplié le referme : un seul historique ouvert à la fois.
          onToggle={(athleteId) => go({ athlete: athleteId === athlete ? undefined : athleteId })}
        />
      )}
    </div>
  );
}
