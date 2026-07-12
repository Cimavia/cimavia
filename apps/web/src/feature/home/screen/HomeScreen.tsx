import { Role } from "@cmv/shared";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CmvButton } from "@/shared/component/CmvButton";
import { authClient } from "@/shared/lib/auth";

// Accueil authentifié — affichage conditionné par le rôle (p1-4). Redirige vers /login si non connecté.
export function HomeScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cmv-bg-0 text-cmv-text-mid">
        {t("common.loading")}
      </main>
    );
  }

  if (!session) {
    return <Navigate to="/login" />;
  }

  const isCoach = session.user.role === Role.COACH;

  async function onLogout() {
    await authClient.signOut();
    navigate({ to: "/login" });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-cmv-bg-0 p-4 text-center">
      <h1 className="font-cmv-display text-2xl text-cmv-text-hi">
        {t("home.welcome", { name: session.user.name })}
      </h1>
      <p className="text-cmv-accent">{isCoach ? t("home.spaceCoach") : t("home.spaceAthlete")}</p>
      <p className="max-w-sm text-sm text-cmv-text-mid">
        {isCoach ? t("home.coachHint") : t("home.athleteHint")}
      </p>
      <div className="mt-4 flex w-full max-w-xs flex-col gap-cmv-sm">
        {isCoach ? (
          <CmvButton type="button" onClick={() => navigate({ to: "/library" })} fullWidth>
            {t("home.toLibrary")}
          </CmvButton>
        ) : null}
        <CmvButton type="button" variant="secondary" onClick={onLogout} fullWidth>
          {t("home.logout")}
        </CmvButton>
      </div>
    </main>
  );
}
