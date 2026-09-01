import type { PlanDto, PlanWeekDto } from "@cmv/shared";
import { PlanWeekType, todayIsoDate, weekSessionProgress } from "@cmv/shared";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMyCoach } from "@/feature/coach";
import { AthleteWeekGrid } from "@/feature/plan/component/AthleteWeekGrid";
import { resolveShownWeek, useMyPlan } from "@/feature/plan/hook/useMyPlan";
import { CmvAppShell, CmvBadge, CmvButton, CmvEmptyState, CmvErrorState } from "@/shared/component";
import { formatDateRange } from "@/shared/util/date.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values plan.athlete.weekType: PlanWeekType

const route = getRouteApi("/planning");

/**
 * Le planning de l'athlète sur web (#25) : une semaine du cycle diffusé, en grille de sept jours.
 *
 * La semaine affichée vit dans l'URL (`?week=3`) et non dans un `useState` : c'est ce qui rend un
 * lien partageable et le bouton Retour utile. `replace: true` — parcourir six semaines ne doit pas
 * empiler six entrées d'historique.
 */
export function AthletePlanningScreenC() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { week: requestedWeek } = route.useSearch();

  const { data: plan, isPending, isError, refetch } = useMyPlan();
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

  if (plan == null) {
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

  const { week, isOutOfCycle } = resolveShownWeek(plan, today, requestedWeek);
  const goToWeek = (weekNumber: number | undefined) =>
    navigate({ to: "/planning", search: { week: weekNumber }, replace: true });

  return (
    <CmvAppShell title={t("plan.athlete.title")} subtitle={plan.title}>
      <div className="flex flex-col gap-cmv-lg">
        {/* Le cycle n'a pas cours : on affiche quand même une semaine (la première), mais on dit
            que ce n'est pas la semaine courante — sinon un cycle terminé se lirait comme en cours. */}
        {isOutOfCycle ? (
          <p className="text-cmv-body text-cmv-text-mid">{t("plan.athlete.outOfCycle")}</p>
        ) : null}

        {week == null ? (
          <CmvEmptyState
            title={t("plan.athlete.empty.title")}
            description={t("plan.athlete.empty.description")}
          />
        ) : (
          <>
            <WeekHeader
              plan={plan}
              week={week}
              onGoToWeek={goToWeek}
              isCurrent={!isOutOfCycle && requestedWeek == null}
            />
            <AthleteWeekGrid week={week} today={today} />
          </>
        )}
      </div>
    </CmvAppShell>
  );
}

type WeekHeaderProps = {
  plan: PlanDto;
  week: PlanWeekDto;
  isCurrent: boolean;
  onGoToWeek: (weekNumber: number | undefined) => void;
};

function WeekHeader({ plan, week, isCurrent, onGoToWeek }: Readonly<WeekHeaderProps>) {
  const { t } = useTranslation();
  const progress = weekSessionProgress(week.sessions);

  const hasPrevious = week.weekNumber > 1;
  const hasNext = week.weekNumber < plan.weekCount;

  return (
    <div className="flex flex-wrap items-center gap-cmv-md">
      <div className="flex flex-col gap-cmv-xs">
        <div className="flex items-center gap-cmv-sm">
          {/* La décharge se colore, l'entraînement reste neutre : la couleur marque l'EXCEPTION
              du cycle, pas sa règle (arbitrage #37). */}
          <CmvBadge variant={week.type === PlanWeekType.DELOAD ? "info" : "neutral"}>
            {t("plan.athlete.week.numberAndType", {
              number: week.weekNumber,
              type: t(`plan.athlete.weekType.${week.type}`),
            })}
          </CmvBadge>
          <span className="font-cmv-mono text-cmv-caption text-cmv-text-mid">
            {formatDateRange(week.startDate, week.endDate)}
          </span>
        </div>
        {week.note == null ? null : (
          <p className="text-cmv-caption text-cmv-text-mid">{week.note}</p>
        )}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-cmv-sm">
        <CmvButton
          variant="secondary"
          disabled={!hasPrevious}
          onClick={() => onGoToWeek(week.weekNumber - 1)}
        >
          {t("plan.athlete.week.previous")}
        </CmvButton>
        {/* `undefined` et non le numéro de la semaine courante : retirer le paramètre rend la page
            à son défaut, qui suivra le calendrier demain sans qu'on ait à y toucher. */}
        <CmvButton variant="ghost" disabled={isCurrent} onClick={() => onGoToWeek(undefined)}>
          {t("plan.athlete.week.today")}
        </CmvButton>
        <CmvButton
          variant="secondary"
          disabled={!hasNext}
          onClick={() => onGoToWeek(week.weekNumber + 1)}
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
