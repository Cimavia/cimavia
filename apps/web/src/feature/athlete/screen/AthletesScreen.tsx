import { type CoachAthleteDto, PlanStatus, Role } from "@cmv/shared";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AthleteSheetPanel } from "@/feature/athlete/component/AthleteSheetPanel";
import { InvitationPanel } from "@/feature/athlete/component/InvitationPanel";
import { useAthletes } from "@/feature/athlete/hook/useAthletes";
import { usePlans } from "@/feature/plan/hook/usePlans";
import { CmvAppShell, CmvBadge, CmvButton, CmvCard, CmvEmptyState } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

export function AthletesScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: authSession, isPending: isAuthPending } = authClient.useSession();
  const { data: athletes, isPending } = useAthletes();
  const { data: plans } = usePlans();

  const [invitationOpen, setInvitationOpen] = useState(false);
  const [sheetFor, setSheetFor] = useState<CoachAthleteDto | null>(null);

  if (isAuthPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cmv-bg-0 text-cmv-text-mid">
        {t("common.loading")}
      </main>
    );
  }
  if (authSession?.user.role !== Role.COACH) {
    return <Navigate to="/" />;
  }

  const publishedPlanByAthlete = new Map(
    (plans ?? [])
      .filter((plan) => plan.status === PlanStatus.PUBLISHED)
      .map((plan) => [plan.athleteId, plan]),
  );

  const hasAthletes = athletes != null && athletes.length > 0;

  return (
    <CmvAppShell
      title={t("athlete.title")}
      subtitle={t("athlete.subtitle", { count: athletes?.length ?? 0 })}
      actions={<CmvButton onClick={() => setInvitationOpen(true)}>{t("athlete.invite")}</CmvButton>}
    >
      {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

      {!isPending && !hasAthletes ? (
        <CmvEmptyState
          title={t("athlete.empty.title")}
          description={t("athlete.empty.description")}
          action={
            <CmvButton onClick={() => setInvitationOpen(true)}>{t("athlete.invite")}</CmvButton>
          }
        />
      ) : null}

      {hasAthletes ? (
        <div className="grid gap-cmv-md md:grid-cols-2 xl:grid-cols-3">
          {athletes.map((athlete) => {
            const plan = publishedPlanByAthlete.get(athlete.athleteId);
            return (
              <CmvCard key={athlete.id}>
                <div className="flex flex-col gap-cmv-md">
                  <div className="flex items-start gap-cmv-sm">
                    <h3 className="flex-1 text-cmv-subtitle text-cmv-text-hi">
                      {athlete.athleteName}
                    </h3>
                    <CmvBadge>{t(`athlete.relationStatus.${athlete.status}`)}</CmvBadge>
                  </div>

                  {/* Aucun cycle diffusé → « — » (règle nullable), et un raccourci pour en créer un. */}
                  <p className="text-cmv-caption text-cmv-text-mid">
                    {plan == null ? "—" : plan.title}
                  </p>

                  <div className="flex gap-cmv-sm">
                    <CmvButton variant="secondary" onClick={() => setSheetFor(athlete)}>
                      {t("athlete.openSheet")}
                    </CmvButton>
                    <CmvButton variant="ghost" onClick={() => navigate({ to: "/plans" })}>
                      {plan == null ? t("athlete.createPlan") : t("athlete.seePlans")}
                    </CmvButton>
                  </div>
                </div>
              </CmvCard>
            );
          })}
        </div>
      ) : null}

      {invitationOpen ? <InvitationPanel onClose={() => setInvitationOpen(false)} /> : null}
      {sheetFor == null ? null : (
        <AthleteSheetPanel athlete={sheetFor} onClose={() => setSheetFor(null)} />
      )}
    </CmvAppShell>
  );
}
