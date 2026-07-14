import { Role } from "@cmv/shared";
import { Navigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAthletes } from "@/feature/athlete/hook/useAthletes";
import { usePlans } from "@/feature/plan/hook/usePlans";
import { CmvAppShell, CmvButton, CmvCard } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

// Tuiles du dashboard (maquette pd-4). Seuls les compteurs déjà disponibles sont branchés ;
// les autres attendent leur phase — la tuile affiche « — », jamais un 0 trompeur.
// MOCKED — débriefs à relire (P4), séances de la semaine (P3 côté agrégat), factures (P6).
type Tile = { labelKey: string; value: string; hintKey: string };

export function DashboardScreen() {
  const { t } = useTranslation();
  const { data: authSession, isPending } = authClient.useSession();
  const { data: athletes } = useAthletes();
  const { data: plans } = usePlans();

  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cmv-bg-0 text-cmv-text-mid">
        {t("common.loading")}
      </main>
    );
  }
  if (!authSession) {
    return <Navigate to="/login" />;
  }

  // Le web est la surface du coach ; l'athlète vit sur mobile (il garde un accès de dépannage,
  // qui sera construit avec les écrans athlète — hors périmètre de cette phase).
  if (authSession.user.role !== Role.COACH) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-cmv-sm bg-cmv-bg-0 p-cmv-xl text-center">
        <h1 className="font-cmv-display text-cmv-title text-cmv-text-hi">
          {t("dashboard.welcome", { name: authSession.user.name })}
        </h1>
        <p className="max-w-sm text-cmv-body text-cmv-text-mid">{t("dashboard.athleteHint")}</p>
        <CmvButton variant="secondary" onClick={() => authClient.signOut()}>
          {t("common.logout")}
        </CmvButton>
      </main>
    );
  }

  const tiles: Tile[] = [
    {
      labelKey: "dashboard.tiles.athletes",
      value: athletes == null ? "—" : String(athletes.length),
      hintKey: "dashboard.tiles.athletesHint",
    },
    {
      labelKey: "dashboard.tiles.plans",
      value: plans == null ? "—" : String(plans.length),
      hintKey: "dashboard.tiles.plansHint",
    },
    // MOCKED — débriefs (P4). À connecter en P4.
    { labelKey: "dashboard.tiles.feedback", value: "—", hintKey: "dashboard.tiles.soon" },
    // MOCKED — facturation (P6). À connecter en P6.
    { labelKey: "dashboard.tiles.invoices", value: "—", hintKey: "dashboard.tiles.soon" },
  ];

  return (
    <CmvAppShell
      title={t("dashboard.title")}
      subtitle={t("dashboard.welcome", { name: authSession.user.name })}
    >
      <div className="grid gap-cmv-md md:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <CmvCard key={tile.labelKey}>
            <div className="flex flex-col gap-cmv-xs">
              <span className="text-cmv-caption text-cmv-text-mid">{t(tile.labelKey)}</span>
              <span className="font-cmv-display text-cmv-title text-cmv-text-hi">{tile.value}</span>
              <span className="text-cmv-caption text-cmv-text-lo">{t(tile.hintKey)}</span>
            </div>
          </CmvCard>
        ))}
      </div>
    </CmvAppShell>
  );
}
