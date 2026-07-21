import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CmvButton } from "@/shared/component/CmvButton";
import { authClient } from "@/shared/lib/auth";

// Sections du coach.
const NAV_ITEMS = [
  { to: "/", labelKey: "nav.dashboard" },
  { to: "/athletes", labelKey: "nav.athletes" },
  { to: "/library", labelKey: "nav.library" },
  { to: "/plans", labelKey: "nav.plans" },
  { to: "/feedbacks", labelKey: "nav.feedbacks" },
  { to: "/messages", labelKey: "nav.messages" },
  { to: "/invoices", labelKey: "nav.invoices" },
] as const;

type CmvAppShellProps = {
  title: string;
  subtitle?: string;
  // Actions d'en-tête (ex. « Nouvelle planification »).
  actions?: ReactNode;
  children: ReactNode;
};

/**
 * Coquille des écrans coach : navigation latérale + en-tête. Sans elle, chaque écran était une
 * page isolée qu'on ne pouvait atteindre que par l'accueil (les sections ne se voyaient pas
 * entre elles).
 */
export function CmvAppShell({ title, subtitle, actions, children }: Readonly<CmvAppShellProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: authSession } = authClient.useSession();

  async function onLogout() {
    await authClient.signOut();
    navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen bg-cmv-bg-0">
      <aside className="flex w-60 shrink-0 flex-col gap-cmv-xl border-cmv-border border-r bg-cmv-bg-1 p-cmv-lg">
        <Link to="/" className="font-cmv-display text-cmv-subtitle text-cmv-text-hi">
          {t("common.appName")}
        </Link>

        <nav className="flex flex-1 flex-col gap-cmv-xs">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              // `activeProps` : TanStack Router applique ces classes sur la route courante.
              className="rounded-cmv-md px-cmv-md py-cmv-sm text-cmv-body text-cmv-text-mid transition-colors hover:bg-cmv-surface hover:text-cmv-text-hi"
              activeProps={{ className: "bg-cmv-surface-hi text-cmv-text-hi" }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>

        <div className="flex flex-col gap-cmv-sm border-cmv-border border-t pt-cmv-md">
          <span className="truncate text-cmv-caption text-cmv-text-mid">
            {authSession?.user.name ?? "—"}
          </span>
          <CmvButton variant="ghost" onClick={onLogout}>
            {t("common.logout")}
          </CmvButton>
        </div>
      </aside>

      <main className="flex-1 p-cmv-xl">
        <header className="mb-cmv-xl flex flex-wrap items-center gap-cmv-md">
          <div className="flex flex-col gap-cmv-xs">
            <h1 className="font-cmv-display text-cmv-title text-cmv-text-hi">{title}</h1>
            {subtitle == null ? null : (
              <p className="text-cmv-caption text-cmv-text-mid">{subtitle}</p>
            )}
          </div>
          <div className="flex-1" />
          {actions}
        </header>

        {children}
      </main>
    </div>
  );
}
