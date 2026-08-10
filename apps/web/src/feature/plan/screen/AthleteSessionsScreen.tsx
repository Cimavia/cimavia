import type { ScheduledSessionSummaryDto } from "@cmv/shared";
import { todayIsoDate } from "@cmv/shared";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AthleteSessionCard } from "@/feature/plan/component/AthleteSessionCard";
import { useMyPlan } from "@/feature/plan/hook/useMyPlan";
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

const route = getRouteApi("/sessions/");

/**
 * Toutes les séances du cycle à plat, en deux segments (#25).
 *
 * L'écran que la sidebar de `athlete_web.dc.html` annonçait dans ses douze frames sans jamais le
 * dessiner ; son contenu vient de la planche mobile (`athlete_seance.dc.html`, frames
 * `SÉANCES — LISTE` / `— LISTE VIDE`), en layout desktop.
 *
 * Aucune requête propre : les séances sont déjà dans le cycle chargé par le planning, et c'est
 * exactement ce qui justifie que l'API n'expose que deux routes à l'athlète.
 */
export function AthleteSessionsScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { segment } = route.useSearch();
  const { data: plan, isPending, isError, refetch } = useMyPlan();

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
  const sessions = (plan?.weeks ?? [])
    .flatMap((week) => week.sessions)
    .filter((session) =>
      segment === "upcoming" ? session.scheduledDate >= today : session.scheduledDate < today,
    )
    .sort((a, b) =>
      segment === "upcoming"
        ? a.scheduledDate.localeCompare(b.scheduledDate)
        : b.scheduledDate.localeCompare(a.scheduledDate),
    );

  return (
    <CmvAppShell title={t("plan.athlete.sessions.title")} subtitle={plan?.title ?? "—"}>
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

        {!isPending && !isError && sessions.length === 0 ? (
          <CmvEmptyState
            title={t("plan.athlete.sessions.empty")}
            description={t("plan.athlete.sessions.emptyHint")}
          />
        ) : null}

        {sessions.length === 0 ? null : <SessionsByDay sessions={sessions} />}
      </div>
    </CmvAppShell>
  );
}

/**
 * Groupées par jour, l'intitulé au-dessus. Le groupe est construit en parcourant la liste DÉJÀ
 * triée : c'est ce qui garantit que l'ordre des jours suit celui du segment, sans le retrier.
 */
function SessionsByDay({ sessions }: Readonly<{ sessions: ScheduledSessionSummaryDto[] }>) {
  const days: { date: string; sessions: ScheduledSessionSummaryDto[] }[] = [];
  for (const session of sessions) {
    const last = days.at(-1);
    if (last?.date === session.scheduledDate) last.sessions.push(session);
    else days.push({ date: session.scheduledDate, sessions: [session] });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-cmv-lg">
      {days.map((day) => (
        <section key={day.date} className="flex flex-col gap-cmv-sm">
          <h2 className="text-cmv-caption text-cmv-text-mid uppercase tracking-wide">
            {formatDayLabel(day.date)}
          </h2>
          {/* Plusieurs séances le même jour : `position` est le rang DANS la journée. */}
          {[...day.sessions]
            .sort((a, b) => a.position - b.position)
            .map((session) => (
              <AthleteSessionCard key={session.id} session={session} />
            ))}
        </section>
      ))}
    </div>
  );
}
