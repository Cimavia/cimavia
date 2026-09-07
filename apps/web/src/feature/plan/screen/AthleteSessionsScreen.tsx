import type { ScheduledSessionSummaryDto } from "@cmv/shared";
import { todayIsoDate } from "@cmv/shared";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AthleteSessionCard } from "@/feature/plan/component/AthleteSessionCard";
import { useMyPlans } from "@/feature/plan/hook/useMyPlan";
import {
  CmvAppShell,
  CmvEmptyState,
  CmvErrorState,
  CmvSegmented,
  type CmvSegmentedOption,
} from "@/shared/component";
import { formatDayLabel } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values plan.athlete.sessions: upcoming, past

export type SessionsSegment = "upcoming" | "past";

/** Une séance et le cycle d'où elle vient — le nom voyage avec elle, il ne se rejoint pas au rendu. */
type SessionEntry = { session: ScheduledSessionSummaryDto; planTitle: string };

const route = getRouteApi("/sessions/");

/**
 * Toutes les séances des cycles servis à plat, en deux segments (#25).
 *
 * L'écran que la sidebar de `athlete_web.dc.html` annonçait dans ses douze frames sans jamais le
 * dessiner ; son contenu vient de la planche mobile (`athlete_seance.dc.html`, frames
 * `SÉANCES — LISTE` / `— LISTE VIDE`), en layout desktop.
 *
 * Aucune requête propre : les séances sont déjà dans les cycles chargés par le planning, et c'est
 * exactement ce qui justifie que l'API n'expose que deux routes à l'athlète.
 */
export function AthleteSessionsScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { segment } = route.useSearch();
  const { data: plans, isPending, isError, refetch } = useMyPlans();

  const today = todayIsoDate();

  const options: CmvSegmentedOption<SessionsSegment>[] = [
    { value: "upcoming", label: t("plan.athlete.sessions.upcoming") },
    { value: "past", label: t("plan.athlete.sessions.past") },
  ];

  /**
   * Le tri s'inverse avec le segment, et ce n'est pas un détail : « à venir » se lit de la plus
   * proche à la plus lointaine (ce qui arrive d'abord est en tête), « passées » de la plus récente
   * à la plus ancienne (ce qu'on vient de faire est en tête). Un tri unique mettrait à chaque fois
   * en tête la ligne dont on se soucie le moins.
   */
  const entries = (plans ?? [])
    .flatMap((plan) =>
      plan.weeks.flatMap((week) =>
        week.sessions.map((session) => ({ session, planTitle: plan.title })),
      ),
    )
    .filter(({ session }) =>
      segment === "upcoming" ? session.scheduledDate >= today : session.scheduledDate < today,
    )
    .sort((a, b) =>
      segment === "upcoming"
        ? a.session.scheduledDate.localeCompare(b.session.scheduledDate)
        : b.session.scheduledDate.localeCompare(a.session.scheduledDate),
    );

  // Le nom du cycle n'apparaît que si l'athlète en suit plusieurs (#172) : répété sur chaque carte
  // d'un cycle unique, il serait du bruit — c'est ce qui DISTINGUE qui mérite d'être écrit.
  const showPlanTitle = (plans ?? []).length > 1;

  return (
    <CmvAppShell
      title={t("plan.athlete.sessions.title")}
      // Le nombre de cycles plutôt qu'un titre : avec plusieurs, en nommer un seul serait faux, et
      // les concaténer donnerait un sous-titre illisible. `—` tant que la liste n'a pas répondu.
      subtitle={
        plans == null ? "—" : t("plan.athlete.sessions.cycleCount", { count: plans.length })
      }
    >
      <div className="flex flex-col gap-cmv-lg">
        <CmvSegmented
          options={options}
          value={segment}
          onChange={(value) =>
            navigate({ to: "/sessions", search: { segment: value }, replace: true })
          }
        />

        {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

        {/* Une panne réseau n'est pas « aucune séance » : la seconde laisserait croire que le
            cycle est vide. */}
        {isError ? (
          <CmvErrorState
            title={t("common.errorTitle")}
            description={t("common.errorDescription")}
            retryLabel={t("common.retry")}
            onRetry={() => refetch()}
          />
        ) : null}

        {!isPending && !isError && entries.length === 0 ? (
          <CmvEmptyState
            title={t("plan.athlete.sessions.empty")}
            description={t("plan.athlete.sessions.emptyHint")}
          />
        ) : null}

        {entries.length === 0 ? null : (
          <SessionsByDay entries={entries} showPlanTitle={showPlanTitle} />
        )}
      </div>
    </CmvAppShell>
  );
}

/**
 * Groupées par jour, l'intitulé au-dessus. Le groupe est construit en parcourant la liste DÉJÀ
 * triée : c'est ce qui garantit que l'ordre des jours suit celui du segment, sans le retrier.
 */
function SessionsByDay({
  entries,
  showPlanTitle,
}: Readonly<{ entries: SessionEntry[]; showPlanTitle: boolean }>) {
  const days: { date: string; entries: SessionEntry[] }[] = [];
  for (const entry of entries) {
    const last = days.at(-1);
    if (last?.date === entry.session.scheduledDate) last.entries.push(entry);
    else days.push({ date: entry.session.scheduledDate, entries: [entry] });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-cmv-lg">
      {days.map((day) => (
        <section key={day.date} className="flex flex-col gap-cmv-sm">
          <h2 className="text-cmv-caption text-cmv-text-mid uppercase tracking-wide">
            {formatDayLabel(day.date)}
          </h2>
          {/* Plusieurs séances le même jour : `position` est le rang DANS la journée. Deux cycles
              peuvent y poser chacun la sienne — l'ordre reste celui des cycles, puis du rang. */}
          {[...day.entries]
            .sort((a, b) => a.session.position - b.session.position)
            .map((entry) => (
              <AthleteSessionCard
                key={entry.session.id}
                session={entry.session}
                planLabel={showPlanTitle ? entry.planTitle : null}
              />
            ))}
        </section>
      ))}
    </div>
  );
}
