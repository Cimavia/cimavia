import { Role } from "@cmv/shared";
import { Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PlanForm } from "@/feature/plan/component/PlanForm";
import { PlanList } from "@/feature/plan/component/PlanList";
import { usePlans } from "@/feature/plan/hook/usePlans";
import { CmvButton, CmvEmptyState } from "@/shared/component";
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
    <main className="min-h-screen bg-cmv-bg-0 p-cmv-xl">
      <header className="mb-cmv-xl flex flex-wrap items-center gap-cmv-md">
        <div className="flex flex-col gap-cmv-xs">
          <h1 className="font-cmv-display text-cmv-title text-cmv-text-hi">{t("plan.title")}</h1>
          <p className="text-cmv-caption text-cmv-text-mid">{t("plan.subtitle")}</p>
        </div>
        <div className="flex-1" />
        <CmvButton onClick={() => setFormOpen(true)}>{t("plan.new")}</CmvButton>
      </header>

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
    </main>
  );
}
