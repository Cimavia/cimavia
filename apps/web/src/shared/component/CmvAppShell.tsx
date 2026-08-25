import { hasCapability } from "@cmv/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NotificationBell } from "@/feature/notification";
import { CmvButton } from "@/shared/component/CmvButton";
import { useCapabilities } from "@/shared/hook/useCapabilities";
import { authClient } from "@/shared/lib/auth";

/**
 * Chaque entrée porte la capacité qui la rend visible — la MÊME que celle exigée par la route
 * correspondante (`CmvRoleGate`). C'est ce qui empêche la dérive dont ce projet a déjà l'expérience :
 * une nav qui propose ce que la route refuse, ou qui cache ce qui est accessible.
 *
 * Pas d'entrée « Athlètes » : la liste vit dans le tableau de bord depuis #113, et deux entrées
 * menant au même écran ne feraient qu'hésiter.
 *
 * Une même route peut apparaître DEUX fois, une par capacité, avec un libellé différent : le coach
 * « fait de la facturation », l'athlète « a des factures ». Ce n'est pas de la redondance, c'est la
 * même ressource nommée depuis les deux bouts de la relation.
 *
 * Le jour où les DEUX groupes sont peuplés pour un même compte (double capacité, #7), c'est ici que
 * les sections nommées « En tant que coach » / « En tant qu'athlète » se posent : une nav plate de
 * quatorze entrées ne dirait plus à quel titre on fait quoi, et deux entrées vers `/invoices` s'y
 * surligneraient ensemble.
 */
const NAV_ITEMS = [
  { to: "/", labelKey: "nav.dashboard", capability: "coach" },
  { to: "/library", labelKey: "nav.library", capability: "coach" },
  { to: "/plans", labelKey: "nav.plans", capability: "coach" },
  { to: "/feedbacks", labelKey: "nav.feedbacks", capability: "coach" },
  { to: "/messages", labelKey: "nav.messages", capability: "coach" },
  { to: "/invoices", labelKey: "nav.invoices", capability: "coach" },
  { to: "/reminders", labelKey: "nav.reminders", capability: "coach" },
  { to: "/planning", labelKey: "nav.planning", capability: "athlete" },
  { to: "/sessions", labelKey: "nav.sessions", capability: "athlete" },
  { to: "/messages", labelKey: "nav.myMessages", capability: "athlete" },
  { to: "/invoices", labelKey: "nav.myInvoices", capability: "athlete" },
  { to: "/my-coach", labelKey: "nav.myCoach", capability: "athlete" },
] as const;

type CmvAppShellProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function CmvAppShell({ title, subtitle, actions, children }: Readonly<CmvAppShellProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: authSession } = authClient.useSession();
  /**
   * Pas de garde sur `isPending` ici : ce composant n'est monté que par un écran, lui-même monté
   * par `CmvRoleGate` — qui a déjà attendu la session. La nav ne peut donc pas se dessiner vide le
   * temps d'un aller-retour.
   */
  const capabilities = useCapabilities();
  const navItems = NAV_ITEMS.filter((item) => hasCapability(capabilities, item.capability));

  async function onLogout() {
    await authClient.signOut();
    navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen bg-cmv-bg-0">
      <aside className="flex w-60 shrink-0 flex-col gap-cmv-xl border-cmv-border border-r bg-cmv-bg-1 p-cmv-lg">
        <Link
          to="/"
          search={{ q: undefined, filter: undefined }}
          className="font-cmv-display text-cmv-subtitle text-cmv-text-hi"
        >
          {t("common.appName")}
        </Link>

        <nav className="flex flex-1 flex-col gap-cmv-xs">
          {navItems.map((item) => (
            <Link
              // La capacité fait partie de la clé : une même route peut être listée deux fois,
              // une par capacité (cf. `/invoices`).
              key={`${item.capability}:${item.to}`}
              to={item.to}
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
        {/*
          Bandeau FIXE : sur un écran qui défile — un constructeur d'exercice ou de séance en fait
          plusieurs hauteurs —, « Enregistrer » imposait de remonter tout en haut. Posé ici et non
          écran par écran, sinon chaque nouvelle page rejoue l'oubli.
          `-mx`/`px` compensent le padding de `main` pour que le fond couvre toute la largeur.
        */}
        <header className="-mx-cmv-xl -mt-cmv-xl sticky top-0 z-20 mb-cmv-xl flex flex-wrap items-center gap-cmv-md border-cmv-border border-b bg-cmv-bg-0 px-cmv-xl py-cmv-lg">
          <div className="flex flex-col gap-cmv-xs">
            <h1 className="font-cmv-display text-cmv-title text-cmv-text-hi">{title}</h1>
            {subtitle == null ? null : (
              <p className="text-cmv-caption text-cmv-text-mid">{subtitle}</p>
            )}
          </div>
          <div className="flex-1" />
          {actions}
          {/* Après les actions d'écran : la cloche est un repère fixe, elle ne doit pas bouger
              d'un écran à l'autre au gré du nombre de boutons. */}
          <NotificationBell />
        </header>

        {children}
      </main>
    </div>
  );
}
