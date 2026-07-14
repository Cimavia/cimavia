import {
  PlanStatus,
  type PlanWeekDto,
  PlanWeekType,
  Role,
  type ScheduledSessionDto,
  type ScheduledSessionSummaryDto,
} from "@cmv/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getScheduledSession, scheduledSessionKeys } from "@/feature/plan/api";
import { PlanWeekCard } from "@/feature/plan/component/PlanWeekCard";
import { ScheduledSessionPanel } from "@/feature/plan/component/ScheduledSessionPanel";
import { usePlan, usePlanMutations } from "@/feature/plan/hook/usePlan";
import { useDeletePlan, usePublishPlan } from "@/feature/plan/hook/usePlans";
import { CmvBadge, CmvButton, CmvConfirmButton, CmvEmptyState } from "@/shared/component";
import { apiErrorMessage } from "@/shared/lib/api";
import { authClient } from "@/shared/lib/auth";
import { formatDate } from "@/shared/util/date.util";

// Séance en cours d'édition : le jour visé + l'instance (null = création sur ce jour).
type SessionEdit = { week: PlanWeekDto; date: string; sessionId: string | null };

export function PlanBuilderScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { planId } = useParams({ from: "/plans/$planId" });

  const { data: authSession, isPending: isAuthPending } = authClient.useSession();
  const { data: plan, isPending } = usePlan(planId);
  const { addWeek, isBusy, error } = usePlanMutations(planId);
  const publish = usePublishPlan();
  const removePlan = useDeletePlan();

  const [edit, setEdit] = useState<SessionEdit | null>(null);

  // Le résumé (vue semaine) ne porte pas la composition : on charge le détail à l'ouverture.
  const { data: editedSession } = useQuery<ScheduledSessionDto>({
    queryKey: scheduledSessionKeys.detail(edit?.sessionId ?? ""),
    queryFn: () => getScheduledSession(edit?.sessionId ?? ""),
    enabled: edit?.sessionId != null,
  });

  if (isAuthPending || isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cmv-bg-0 text-cmv-text-mid">
        {t("common.loading")}
      </main>
    );
  }
  if (authSession?.user.role !== Role.COACH) {
    return <Navigate to="/" />;
  }
  if (plan == null) {
    return <Navigate to="/plans" />;
  }

  const isPublished = plan.status === PlanStatus.PUBLISHED;
  const errorMessage =
    apiErrorMessage(error) ?? apiErrorMessage(publish.error) ?? apiErrorMessage(removePlan.error);

  function onOpenCreate(week: PlanWeekDto, date: string) {
    setEdit({ week, date, sessionId: null });
  }

  function onOpenEdit(week: PlanWeekDto, session: ScheduledSessionSummaryDto) {
    setEdit({ week, date: session.scheduledDate, sessionId: session.id });
  }

  // Le panneau d'édition attend l'instance complète : on n'ouvre qu'une fois le détail chargé.
  const panelSession = edit?.sessionId == null ? null : (editedSession ?? null);
  const isPanelReady = edit != null && (edit.sessionId == null || panelSession != null);

  return (
    <main className="min-h-screen bg-cmv-bg-0 p-cmv-xl">
      <header className="mb-cmv-xl flex flex-col gap-cmv-md">
        <Link to="/plans" className="text-cmv-caption text-cmv-text-mid hover:text-cmv-text-hi">
          {t("plan.builder.back")}
        </Link>

        <div className="flex flex-wrap items-center gap-cmv-md">
          <div className="flex flex-col gap-cmv-xs">
            <div className="flex items-center gap-cmv-sm">
              <h1 className="font-cmv-display text-cmv-title text-cmv-text-hi">{plan.title}</h1>
              <CmvBadge variant={isPublished ? "accent" : "neutral"}>
                {t(`plan.status.${plan.status}`)}
              </CmvBadge>
            </div>
            <p className="text-cmv-caption text-cmv-text-lo">
              {t("plan.card.meta", {
                weeks: plan.weekCount,
                sessions: plan.sessionCount,
                date: formatDate(plan.startDate),
              })}
            </p>
          </div>

          <div className="flex-1" />

          <CmvConfirmButton
            label={t("plan.builder.delete")}
            confirmLabel={t("common.confirmDelete")}
            cancelLabel={t("common.cancel")}
            disabled={isBusy}
            onConfirm={() =>
              removePlan.mutate(planId, { onSuccess: () => navigate({ to: "/plans" }) })
            }
          />

          {/* La diffusion est irréversible et exige au moins une semaine (l'API le refuse sinon). */}
          <CmvButton
            onClick={() => publish.mutate(planId)}
            disabled={isPublished || plan.weeks.length === 0 || publish.isPending}
          >
            {isPublished ? t("plan.builder.published") : t("plan.builder.publish")}
          </CmvButton>
        </div>

        {plan.description == null ? null : (
          <p className="max-w-3xl text-cmv-body text-cmv-text-mid">{plan.description}</p>
        )}

        {isPublished ? (
          <p className="text-cmv-caption text-cmv-text-lo">{t("plan.builder.publishedHint")}</p>
        ) : null}

        {errorMessage == null ? null : (
          <p className="text-cmv-caption text-cmv-error">{errorMessage}</p>
        )}
      </header>

      <div className="flex flex-col gap-cmv-lg">
        {plan.weeks.length === 0 ? (
          <CmvEmptyState
            title={t("plan.builder.emptyWeeks")}
            description={t("plan.builder.emptyWeeksHint")}
          />
        ) : null}

        {plan.weeks.map((week) => (
          <PlanWeekCard
            key={week.id}
            planId={planId}
            week={week}
            onAddSession={(date) => onOpenCreate(week, date)}
            onEditSession={(session) => onOpenEdit(week, session)}
          />
        ))}

        <div>
          <CmvButton
            variant="secondary"
            disabled={isBusy}
            onClick={() => addWeek.mutate({ type: PlanWeekType.TRAINING })}
          >
            {t("plan.builder.addWeek")}
          </CmvButton>
        </div>
      </div>

      {isPanelReady && edit != null ? (
        <ScheduledSessionPanel
          planId={planId}
          week={edit.week}
          date={edit.date}
          session={panelSession}
          onClose={() => setEdit(null)}
        />
      ) : null}
    </main>
  );
}
