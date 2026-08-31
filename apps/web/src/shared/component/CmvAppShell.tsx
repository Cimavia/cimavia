import type { CapabilityName } from "@cmv/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { IconType } from "react-icons";
import { IoBarbellOutline, IoPersonOutline, IoSettingsOutline } from "react-icons/io5";
import { NotificationBell } from "@/feature/notification";
import { CmvButton } from "@/shared/component/CmvButton";
import { useActiveSpace, useCapabilities } from "@/shared/hook/useCapabilities";
import { authClient } from "@/shared/lib/auth";
import { itemsOfSpace, landingPath, SHARED_ROUTES } from "@/shared/lib/nav";

/**
 * Le basculeur d'espace — un seul univers actif à la fois (#129).
 *
 * Ne rend RIEN pour un compte mono-capacité : lui proposer de basculer vers un espace qu'il n'a
 * pas serait une porte fermée de plus à l'écran.
 *
 * Basculer NAVIGUE, il ne pose pas d'état : l'espace se déduit de l'URL (`useActiveSpace`), donc
 * changer de page suffit à changer d'espace. C'est ce qui garantit que le menu affiché correspond
 * toujours à l'écran en dessous.
 */
function SpaceSwitcher({ active }: Readonly<{ active: CapabilityName }>) {
  const { t } = useTranslation();
  const { isCoach, isAthlete } = useCapabilities();
  if (!isCoach || !isAthlete) return null;

  return (
    <div className="flex gap-cmv-xs rounded-cmv-md bg-cmv-surface p-cmv-xs" role="tablist">
      {SPACES.map(({ space, icon: Icon }) => {
        const current = space === active;
        return (
          <Link
            key={space}
            to={landingPath(space)}
            search={searchFor(landingPath(space), space)}
            role="tab"
            aria-selected={current}
            className={
              current
                ? "flex flex-1 items-center justify-center gap-cmv-xs rounded-cmv-sm bg-cmv-accent px-cmv-sm py-cmv-xs text-cmv-caption text-cmv-text-hi"
                : "flex flex-1 items-center justify-center gap-cmv-xs rounded-cmv-sm px-cmv-sm py-cmv-xs text-cmv-caption text-cmv-text-mid transition-colors hover:text-cmv-text-hi"
            }
          >
            <Icon aria-hidden />
            {t(`nav.space.${space}`)}
          </Link>
        );
      })}
    </div>
  );
}

// i18n-values nav.space: coach, athlete
// i18n-values nav.spaceTitle: coach, athlete
const SPACES = [
  { space: "coach", icon: IoPersonOutline },
  { space: "athlete", icon: IoBarbellOutline },
] as const satisfies readonly { space: CapabilityName; icon: IconType }[];

/**
 * Le `search` d'une entrée de nav. Les routes partagées portent leur titre — c'est ce qui distingue
 * `/invoices` côté coach de `/invoices` côté athlète, et ce que l'API exige d'un compte cumulant
 * (#10). Les autres n'ont rien à préciser ; TanStack exige néanmoins un objet, où `undefined` vaut
 * « clé absente ».
 */
function searchFor(to: string, space: CapabilityName) {
  return SHARED_ROUTES.has(to)
    ? { as: space, athlete: undefined, q: undefined, filter: undefined }
    : { as: undefined, athlete: undefined, q: undefined, filter: undefined };
}

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
  const activeSpace = useActiveSpace();
  const items = itemsOfSpace(activeSpace);

  async function onLogout() {
    await authClient.signOut();
    navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen bg-cmv-bg-0">
      {/*
        Barre latérale FIXE et haute d'un écran : sur une page longue, le nom du compte et « Se
        déconnecter » descendaient hors de vue et il fallait défiler tout en bas pour les
        atteindre. Sa nav défile toute seule si elle déborde, le pied reste collé.
      */}
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col gap-cmv-xl border-cmv-border border-r bg-cmv-bg-1 p-cmv-lg">
        <Link
          to="/"
          search={{ q: undefined, filter: undefined }}
          className="font-cmv-display text-cmv-subtitle text-cmv-text-hi"
        >
          {t("common.appName")}
        </Link>

        <SpaceSwitcher active={activeSpace} />

        <nav className="flex flex-1 flex-col gap-cmv-xs overflow-y-auto">
          {/* Le titre de l'espace reste, même seul : il nomme ce qu'on est en train de parcourir,
              là où le basculeur ne montre que le choix. Rendu aussi pour un compte mono-capacité,
              qui n'a pas de basculeur au-dessus. */}
          <h2 className="px-cmv-md text-cmv-caption text-cmv-text-lo uppercase tracking-wide">
            {t(`nav.spaceTitle.${activeSpace}`)}
          </h2>
          {items.map((item) => (
            <Link
              key={`${item.capability}:${item.to}`}
              to={item.to}
              search={searchFor(item.to, item.capability)}
              className="flex items-center gap-cmv-sm rounded-cmv-md px-cmv-md py-cmv-sm text-cmv-body text-cmv-text-mid transition-colors hover:bg-cmv-surface hover:text-cmv-text-hi"
              activeProps={{ className: "bg-cmv-surface-hi text-cmv-text-hi" }}
              activeOptions={{
                exact: item.to === "/",
                includeSearch: SHARED_ROUTES.has(item.to),
              }}
            >
              <item.icon aria-hidden className="shrink-0" />
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>

        <div className="flex flex-col gap-cmv-sm border-cmv-border border-t pt-cmv-md">
          {/* Le compte vit HORS des deux espaces — ce n'est ni du coach ni de l'athlète — d'où sa
              place dans le pied plutôt que dans la table de nav. Équivalent web de l'onglet Profil
              du mobile (#13). */}
          <Link
            to="/account"
            className="flex items-center gap-cmv-sm truncate rounded-cmv-md px-cmv-sm py-cmv-xs text-cmv-caption text-cmv-text-mid transition-colors hover:bg-cmv-surface hover:text-cmv-text-hi"
            activeProps={{ className: "bg-cmv-surface-hi text-cmv-text-hi" }}
          >
            <IoSettingsOutline aria-hidden className="shrink-0" />
            <span className="truncate">{authSession?.user.name ?? "—"}</span>
          </Link>
          <CmvButton variant="ghost" onClick={onLogout}>
            {t("common.logout")}
          </CmvButton>
        </div>
      </aside>

      {/* `min-w-0` : sans lui un enfant large — un tableau à défilement — pousse la
          largeur du conteneur flex au lieu de défiler dans son cadre. */}
      <main className="min-w-0 flex-1 p-cmv-xl">
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
