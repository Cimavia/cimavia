import type { PlanWeekDto, PlanWeekType, ScheduledSessionSummaryDto } from "@cmv/shared";
import { planWeekDays } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { PLAN_WEEK_TYPES } from "@/feature/plan/constant";
import { usePlanMutations } from "@/feature/plan/hook/usePlan";
import { CmvBadge, CmvButton, CmvConfirmButton, CmvSegmented } from "@/shared/component";
import { formatDateRange, formatDayLabel } from "@/shared/util/date.util";

type PlanWeekCardProps = {
  planId: string;
  week: PlanWeekDto;
  onAddSession: (date: string) => void;
  onEditSession: (session: ScheduledSessionSummaryDto) => void;
};

export function PlanWeekCard({
  planId,
  week,
  onAddSession,
  onEditSession,
}: Readonly<PlanWeekCardProps>) {
  const { t } = useTranslation();
  const { updateWeek, removeWeek, isBusy } = usePlanMutations(planId);

  const days = planWeekDays(week.startDate) ?? [];
  const sessionsByDay = new Map<string, ScheduledSessionSummaryDto[]>();
  for (const session of week.sessions) {
    const existing = sessionsByDay.get(session.scheduledDate) ?? [];
    existing.push(session);
    sessionsByDay.set(session.scheduledDate, existing);
  }

  return (
    <section className="flex flex-col gap-cmv-md rounded-cmv-lg border border-cmv-border bg-cmv-surface p-cmv-lg">
      <header className="flex flex-wrap items-center gap-cmv-md">
        <h3 className="text-cmv-subtitle text-cmv-text-hi">
          {t("plan.week.number", { number: week.weekNumber })}
        </h3>
        <span className="text-cmv-caption text-cmv-text-lo">
          {formatDateRange(week.startDate, week.endDate)}
        </span>

        <CmvSegmented<PlanWeekType>
          value={week.type}
          onChange={(type) => updateWeek.mutate({ weekId: week.id, input: { type } })}
          options={PLAN_WEEK_TYPES.map((type) => ({
            value: type,
            label: t(`plan.weekType.${type}`),
          }))}
        />

        <div className="flex-1" />

        <CmvBadge>{t("plan.week.sessionCount", { count: week.sessions.length })}</CmvBadge>
        <CmvConfirmButton
          label={t("plan.week.delete")}
          confirmLabel={t("common.confirmDelete")}
          cancelLabel={t("common.cancel")}
          disabled={isBusy}
          onConfirm={() => removeWeek.mutate(week.id)}
        />
      </header>

      {week.note == null ? null : <p className="text-cmv-caption text-cmv-text-mid">{week.note}</p>}

      <div className="grid grid-cols-2 gap-cmv-sm md:grid-cols-4 lg:grid-cols-7">
        {days.map((day) => {
          const sessions = sessionsByDay.get(day) ?? [];
          return (
            <div
              key={day}
              className="flex min-h-24 flex-col gap-cmv-xs rounded-cmv-md border border-cmv-border bg-cmv-bg-1 p-cmv-sm"
            >
              <span className="text-cmv-caption text-cmv-text-lo">{formatDayLabel(day)}</span>

              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onEditSession(session)}
                  className="flex flex-col gap-cmv-xs rounded-cmv-sm border border-cmv-border bg-cmv-surface px-cmv-sm py-cmv-xs text-left transition-colors hover:border-cmv-border-hi hover:bg-cmv-surface-hi"
                >
                  <span className="truncate text-cmv-caption text-cmv-text-hi">
                    {session.title}
                  </span>
                  <span className="text-cmv-caption text-cmv-text-lo">
                    {t("plan.session.exerciseCount", { count: session.exerciseCount })}
                  </span>
                </button>
              ))}

              <CmvButton variant="ghost" onClick={() => onAddSession(day)} disabled={isBusy}>
                {t("plan.week.addSession")}
              </CmvButton>
            </div>
          );
        })}
      </div>
    </section>
  );
}
