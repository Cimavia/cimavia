import type {
  AthleteCalendarBounds,
  AthleteCalendarCycle,
  AthleteCalendarWeek,
  ScheduledSessionSummaryDto,
} from "@cmv/shared";
import {
  athleteCalendarBounds,
  athleteCalendarWeek,
  athleteWeekNeighbours,
  defaultAthleteMonday,
  PlanWeekType,
  todayIsoDate,
  weekSessionProgress,
} from "@cmv/shared";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMyCoach } from "@/feature/coach";
import { AthleteWeekGrid } from "@/feature/plan/component/AthleteWeekGrid";
import { useMyPlans } from "@/feature/plan/hook/useMyPlan";
import { CmvAppShell, CmvBadge, CmvButton, CmvEmptyState, CmvErrorState } from "@/shared/component";
import { formatDateRange } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values plan.athlete.weekType: PlanWeekType

const route = getRouteApi("/planning");

/**
 * Le planning de l'athlète sur web (#25) : une semaine CIVILE en grille de sept jours, alimentée
 * par tous les cycles diffusés qu'il suit (#172).
 *
 * La semaine vit dans l'URL (`?from=<lundi>`) et non dans un `useState` : c'est ce qui rend un lien
 * partageable et le bouton Retour utile. `replace: true` — parcourir six semaines ne doit pas
 * empiler six entrées d'historique.
 *
 * La composition de la semaine vit dans `@cmv/shared` (`athleteCalendarWeek`) : quel cycle a cours,
 * quelle séance tombe quel jour et dans quel ordre sont des décisions produit, et une composition
 * dans le JSX les mettrait hors de portée d'un test unitaire.
 */
export function AthletePlanningScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { from: requestedMonday } = route.useSearch();

  const { data: plans, isPending, isError, refetch } = useMyPlans();
  // Sans coach, il n'y a pas de cycle à attendre — et le dire évite de laisser patienter pour rien.
  const { data: coach } = useMyCoach();

  const today = todayIsoDate();

  if (isPending) {
    return (
      <CmvAppShell title={t("plan.athlete.title")}>
        <p className="text-cmv-text-mid">{t("common.loading")}</p>
      </CmvAppShell>
    );
  }

  // Une panne réseau n'est pas « aucun cycle » : la seconde inviterait à attendre son coach.
  if (isError) {
    return (
      <CmvAppShell title={t("plan.athlete.title")}>
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => refetch()}
        />
      </CmvAppShell>
    );
  }

  const defaultMonday = defaultAthleteMonday(plans, today);
  const monday = requestedMonday ?? defaultMonday;
  const week = monday == null ? null : athleteCalendarWeek(plans, monday);

  if (week == null) {
    return (
      <CmvAppShell title={t("plan.athlete.title")}>
        <CmvEmptyState
          // « Pas de coach » et « coach sans cycle diffusé » sont DIFFÉRENTS : dire à un athlète
          // non rattaché que son coach n'a rien diffusé le laisserait attendre pour rien.
          title={coach == null ? t("coach.missing.title") : t("plan.athlete.empty.title")}
          description={
            coach == null ? t("coach.missing.description") : t("plan.athlete.empty.description")
          }
        />
      </CmvAppShell>
    );
  }

  const bounds = athleteCalendarBounds(plans);
  const goToMonday = (target: string | undefined) =>
    navigate({ to: "/planning", search: { from: target }, replace: true });

  return (
    <CmvAppShell
      title={t("plan.athlete.title")}
      subtitle={formatDateRange(week.startDate, week.endDate)}
    >
      <div className="flex flex-col gap-cmv-lg">
        {/* Ce qui court cette semaine, AVANT la grille : avec deux cycles concurrents, savoir sur
            quoi on est engagé conditionne la lecture des sept cases (#172). */}
        <CycleList cycles={week.cycles} />

        <WeekHeader
          week={week}
          bounds={bounds}
          isDefault={requestedMonday == null}
          onGoToMonday={goToMonday}
        />

        {/* Aucun cycle n'a cours cette semaine-là. On affiche quand même les sept jours — c'est la
            navigation qui a mené ici —, mais on le DIT : sinon une semaine hors cycle se lirait
            comme une semaine de repos, qui est l'exact contraire. */}
        {week.cycles.length === 0 ? (
          <p className="text-cmv-body text-cmv-text-mid">{t("plan.athlete.outOfCycle")}</p>
        ) : null}

        <AthleteWeekGrid week={week} today={today} />
      </div>
    </CmvAppShell>
  );
}

/**
 * Les cycles qui ont cours cette semaine, avec leur avancement. C'est ici que vit tout ce que le
 * numéro de semaine portait avant #172 : « S3/4 », le type de la semaine, la note du coach — trois
 * choses qui appartiennent à UN cycle et qui ne peuvent donc plus coiffer la grille entière.
 *
 * `null` quand il n'y en a aucun : la phrase « hors cycle » de l'écran dit déjà la situation, et un
 * cadre vide au-dessus d'elle ne dirait rien de plus.
 */
function CycleList({ cycles }: Readonly<{ cycles: readonly AthleteCalendarCycle[] }>) {
  const { t } = useTranslation();
  if (cycles.length === 0) return null;

  return (
    <ul className="flex flex-col gap-cmv-sm">
      {cycles.map((cycle) => (
        <li
          key={cycle.planId}
          className="flex flex-wrap items-center gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm"
        >
          <span className="font-cmv-display text-cmv-body text-cmv-text-hi">{cycle.title}</span>
          {/* La décharge se colore, l'entraînement reste neutre : la couleur marque l'EXCEPTION du
              cycle, pas sa règle (arbitrage #37). */}
          <CmvBadge variant={cycle.type === PlanWeekType.DELOAD ? "info" : "neutral"}>
            {t("plan.athlete.cycle.week", {
              number: cycle.weekNumber,
              total: cycle.weekCount,
              type: t(`plan.athlete.weekType.${cycle.type}`),
            })}
          </CmvBadge>
          {cycle.note == null ? null : (
            <span className="text-cmv-caption text-cmv-text-mid">{cycle.note}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

type WeekHeaderProps = {
  week: AthleteCalendarWeek<ScheduledSessionSummaryDto>;
  bounds: AthleteCalendarBounds | null;
  isDefault: boolean;
  onGoToMonday: (monday: string | undefined) => void;
};

/**
 * La navigation d'une semaine à l'autre, bornée par la plage réelle des cycles servis : sans
 * bornes, l'athlète parcourt indéfiniment des semaines vides qui ne lui apprennent rien.
 *
 * Où s'arrête la plage est une DÉCISION, pas un détail de rendu : elle vit dans `@cmv/shared`
 * (#236), où le mobile lit la même — deux clients qui se bornent différemment se contrediraient
 * sur les mêmes cycles.
 */
function WeekHeader({ week, bounds, isDefault, onGoToMonday }: Readonly<WeekHeaderProps>) {
  const { t } = useTranslation();

  const sessions = week.days.flatMap((day) => day.entries.map((entry) => entry.session));
  const progress = weekSessionProgress(sessions);

  const { previous, next } = athleteWeekNeighbours(week.startDate, bounds);

  return (
    <div className="flex flex-wrap items-center gap-cmv-md">
      <span className="font-cmv-mono text-cmv-caption text-cmv-text-mid">
        {formatDateRange(week.startDate, week.endDate)}
      </span>

      <div className="flex-1" />

      <div className="flex items-center gap-cmv-sm">
        <CmvButton
          variant="secondary"
          disabled={previous == null}
          onClick={() => onGoToMonday(previous ?? undefined)}
        >
          {t("plan.athlete.week.previous")}
        </CmvButton>
        {/* `undefined` et non le lundi courant : retirer le paramètre rend la page à son défaut,
            qui suivra le calendrier la semaine prochaine sans qu'on ait à y toucher. */}
        <CmvButton variant="ghost" disabled={isDefault} onClick={() => onGoToMonday(undefined)}>
          {t("plan.athlete.week.today")}
        </CmvButton>
        <CmvButton
          variant="secondary"
          disabled={next == null}
          onClick={() => onGoToMonday(next ?? undefined)}
        >
          {t("plan.athlete.week.next")}
        </CmvButton>

        {/* `null` = liste absente : « — », jamais « 0/0 » qui se lirait « semaine de repos ». */}
        <span className="text-cmv-caption text-cmv-text-mid">
          {progress == null
            ? "—"
            : t("plan.athlete.doneCount", { done: progress.done, total: progress.total })}
        </span>
      </div>
    </div>
  );
}
