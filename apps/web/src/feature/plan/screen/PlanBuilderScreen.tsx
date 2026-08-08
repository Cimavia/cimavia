import {
  PlanStatus,
  type PlanWeekDto,
  PlanWeekType,
  ReminderEntityType,
  Role,
  type ScheduledSessionDto,
  type ScheduledSessionSummaryDto,
} from "@cmv/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PlanBillingSection } from "@/feature/invoice";
import { usePlanBilling } from "@/feature/invoice/hook/useInvoices";
import { getScheduledSession, scheduledSessionKeys } from "@/feature/plan/api";
import { PlanBuilderActions } from "@/feature/plan/component/PlanBuilderActions";
import { PlanStatusLine } from "@/feature/plan/component/PlanStatusLine";
import { PlanWeekCard } from "@/feature/plan/component/PlanWeekCard";
import { ScheduledSessionPanel } from "@/feature/plan/component/ScheduledSessionPanel";
import { usePlan, usePlanMutations } from "@/feature/plan/hook/usePlan";
import { ScheduleReminderButton } from "@/feature/reminder";
import { CmvAppShell, CmvButton, CmvEmptyState, CmvErrorState } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";
import { formatDate } from "@/shared/util/date.util";

// Séance en cours d'édition : le jour visé + l'instance (null = création sur ce jour).
type SessionEdit = { week: PlanWeekDto; date: string; sessionId: string | null };

export function PlanBuilderScreen() {
  const { t } = useTranslation();
  const { planId } = useParams({ from: "/plans/$planId" });

  const { data: authSession, isPending: isAuthPending } = authClient.useSession();
  const { data: plan, isPending, isError, refetch } = usePlan(planId);
  const { addWeek, isBusy } = usePlanMutations(planId);
  // Gating de la diffusion : une facturation (DRAFT) doit avoir été saisie. `null` = pas encore.
  const { data: billing } = usePlanBilling(planId);

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
  // Échec de chargement : on le DIT, avec un recours. Rediriger vers la liste (ce que faisait le
  // `plan == null` seul) laisserait croire que le cycle a disparu.
  if (isError) {
    return (
      <CmvAppShell title={t("plan.title")}>
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
    return <Navigate to="/plans" />;
  }

  const isPublished = plan.status === PlanStatus.PUBLISHED;

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
    <CmvAppShell
      title={plan.title}
      subtitle={t("plan.card.meta", {
        weeks: plan.weekCount,
        sessions: plan.sessionCount,
        date: formatDate(plan.startDate),
      })}
      actions={
        <>
          {/* Rappel contextuel (#45) : posé ICI plutôt que dans PlanBuilderActions, qui ne porte
              que les actions destructrices et leur gating. Un rappel se programme à tout moment,
              brouillon comme cycle diffusé. */}
          <ScheduleReminderButton
            entityType={ReminderEntityType.PLAN}
            entityId={planId}
            targetLabel={plan.title}
            variant="ghost"
          />
          <PlanBuilderActions
            planId={planId}
            isPublished={isPublished}
            hasWeeks={plan.weeks.length > 0}
            isBillingFilled={billing != null}
            isBusy={isBusy}
          />
        </>
      }
    >
      <div className="mb-cmv-lg flex flex-col gap-cmv-sm">
        <Link to="/plans" className="text-cmv-caption text-cmv-text-mid hover:text-cmv-text-hi">
          {t("plan.builder.back")}
        </Link>

        <PlanStatusLine status={plan.status} isBillingFilled={billing != null} />

        {plan.description == null ? null : (
          <p className="max-w-3xl text-cmv-body text-cmv-text-mid">{plan.description}</p>
        )}
      </div>

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

        {/* Facturation du cycle : sa saisie conditionne la diffusion (gating). */}
        <PlanBillingSection planId={planId} isPublished={isPublished} />
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
    </CmvAppShell>
  );
}
