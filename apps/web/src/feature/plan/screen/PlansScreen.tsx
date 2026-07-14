import { Role } from "@cmv/shared";
import { Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PlanForm } from "@/feature/plan/component/PlanForm";
import { PlanList } from "@/feature/plan/component/PlanList";
import { usePlans } from "@/feature/plan/hook/usePlans";
import { CmvAppShell, CmvButton, CmvEmptyState } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

// Liste des planifications du coach (p3-1). Surface coach : l'API refuse déjà l'athlète en 403.
export function PlansScreen() {
  const { t } = useTranslation();
  const { data: authSession, isPending: isAuthPending } = authClient.useSession();
  const { data: plans, isPending } = usePlans();
  const [formOpen, setFormOpen] = useState(false);

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

  const hasPlans = plans != null && plans.length > 0;

  return (
    <CmvAppShell
      title={t("plan.title")}
      subtitle={t("plan.subtitle")}
      actions={<CmvButton onClick={() => setFormOpen(true)}>{t("plan.new")}</CmvButton>}
    >
      {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

      {!isPending && !hasPlans ? (
        <CmvEmptyState
          title={t("plan.empty.title")}
          description={t("plan.empty.description")}
          action={<CmvButton onClick={() => setFormOpen(true)}>{t("plan.new")}</CmvButton>}
        />
      ) : null}

      {hasPlans ? <PlanList plans={plans} /> : null}

      {formOpen ? <PlanForm open onClose={() => setFormOpen(false)} /> : null}
    </CmvAppShell>
  );
}
