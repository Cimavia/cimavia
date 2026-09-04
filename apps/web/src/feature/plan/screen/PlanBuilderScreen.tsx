import {
  isSelfCoached,
  PlanStatus,
  type PlanWeekDto,
  PlanWeekType,
  ReminderEntityType,
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
import { PlanAthletePicker } from "@/feature/plan/component/PlanAthletePicker";
import { PlanBuilderActions } from "@/feature/plan/component/PlanBuilderActions";
import { PlanStatusLine } from "@/feature/plan/component/PlanStatusLine";
import { PlanWeekCard } from "@/feature/plan/component/PlanWeekCard";
import { ScheduledSessionPanel } from "@/feature/plan/component/ScheduledSessionPanel";
import { usePlan, usePlanMutations } from "@/feature/plan/hook/usePlan";
import { usePlanClipboard } from "@/feature/plan/hook/usePlanClipboard";
import { ScheduleReminderButton } from "@/feature/reminder";
import { CmvAppShell, CmvButton, CmvEmptyState, CmvErrorState } from "@/shared/component";
import { useAthleteLabel } from "@/shared/hook/useAthleteLabel";
import { formatDate } from "@/shared/util/date.util";

// Séance en cours d'édition : le jour visé + l'instance (null = création sur ce jour).
type SessionEdit = { week: PlanWeekDto; date: string; sessionId: string | null };

/**
 * Le destinataire tel qu'il s'écrit dans le titre : son nom, ou le fait qu'il reste à choisir
 * (#144). Sorti du composant, qui frôle le seuil de complexité de la porte qualité — et parce que
 * « pas encore choisi » est une réponse à afficher, pas un cas d'erreur à replier sur un tiret.
 */
function athleteHeading(
  plan: { athleteId: string | null; athleteName: string | null },
  athleteLabel: (athleteId: string, athleteName: string) => string,
  unassignedLabel: string,
): string {
  return plan.athleteId == null || plan.athleteName == null
    ? unassignedLabel
    : athleteLabel(plan.athleteId, plan.athleteName);
}

export function PlanBuilderScreen() {
  const { t } = useTranslation();
  const athleteLabel = useAthleteLabel();
  const { planId } = useParams({ from: "/plans/$planId" });

  const { data: plan, isPending, isError, refetch } = usePlan(planId);
  const { addWeek, assignAthlete, isBusy } = usePlanMutations(planId);
  const { clipboard, clearClipboard } = usePlanClipboard();
  // Gating de la diffusion : une facturation (DRAFT) doit avoir été saisie. `null` = pas encore.
  const { data: billing } = usePlanBilling(planId);

  const [edit, setEdit] = useState<SessionEdit | null>(null);

  // Le résumé (vue semaine) ne porte pas la composition : on charge le détail à l'ouverture.
  const { data: editedSession } = useQuery<ScheduledSessionDto>({
    queryKey: scheduledSessionKeys.detail(edit?.sessionId ?? ""),
    queryFn: () => getScheduledSession(edit?.sessionId ?? ""),
    enabled: edit?.sessionId != null,
  });

  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cmv-bg-0 text-cmv-text-mid">
        {t("common.loading")}
      </main>
    );
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
  const athleteTitle = athleteHeading(plan, athleteLabel, t("plan.unassigned"));

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
      // Le destinataire DANS le titre : devant une liste de cycles qui se ressemblent, savoir à
      // qui celui-ci s'adresse compte autant que son nom.
      title={t("plan.builder.titleWithAthlete", { title: plan.title, name: athleteTitle })}
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
          <PlanAthletePicker
            athleteId={plan.athleteId}
            isPublished={isPublished}
            isBusy={isBusy}
            onChange={(athleteId) => assignAthlete.mutate(athleteId)}
          />
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
            requiresBilling={!isSelfCoached(plan)}
            isBusy={isBusy}
          />
        </>
      }
    >
      <div className="mb-cmv-lg flex flex-col gap-cmv-sm">
        <Link to="/plans" className="text-cmv-caption text-cmv-text-mid hover:text-cmv-text-hi">
          {t("plan.builder.back")}
        </Link>

        <PlanStatusLine
          status={plan.status}
          isBillingFilled={billing != null}
          requiresBilling={!isSelfCoached(plan)}
        />

        {/* Le presse-papier survit à la navigation (c'est ce qui rend le collage inter-cycle
            possible) : sans ce bandeau, des boutons « Coller ici » apparaîtraient sur un cycle
            sans que rien ne dise ce qui est armé, ni d'où il vient. */}
        {clipboard == null ? null : (
          <div className="flex flex-wrap items-center gap-cmv-sm rounded-cmv-md border border-cmv-success-line bg-cmv-success-soft px-cmv-md py-cmv-sm">
            <span className="text-cmv-caption text-cmv-success-on">
              {t("plan.clipboard.banner", {
                number: clipboard.weekNumber,
                plan: clipboard.planTitle,
              })}
            </span>
            <CmvButton variant="ghost" onClick={clearClipboard}>
              {t("plan.clipboard.clear")}
            </CmvButton>
          </div>
        )}

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
            planTitle={plan.title}
            isPublished={isPublished}
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

        {/* Facturation du cycle : sa saisie conditionne la diffusion (gating) — SAUF en
            auto-coaching, où l'on ne se facture pas soi-même. L'API lève alors le gating et
            refuse la saisie (#14) : laisser la section visible proposerait un formulaire
            obligatoire que rien n'accepterait. */}
        {!isSelfCoached(plan) && <PlanBillingSection planId={planId} isPublished={isPublished} />}
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
