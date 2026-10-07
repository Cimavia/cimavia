import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IoCheckmark } from "react-icons/io5";

type AuthLayoutProps = {
  title: string;
  children: ReactNode;
};

/**
 * Les trois publics, dans l'ordre du panneau. La puce Entreprise arrive avec le compte du même nom
 * (#600) : le panneau annonce ce que le formulaire d'à côté permet de créer.
 */
const BRAND_POINTS = [
  { labelKey: "auth.brand.coach", textKey: "auth.brand.coachText" },
  { labelKey: "auth.brand.athlete", textKey: "auth.brand.athleteText" },
  { labelKey: "auth.brand.company", textKey: "auth.brand.companyText" },
] as const;

/**
 * Le panneau de marque de la maquette #595, à gauche du formulaire. Il ne s'affiche qu'en grand
 * écran : en dessous, il repousserait le formulaire hors de vue sans rien apporter pour s'inscrire.
 * Le même panneau sert à toutes les pages d'authentification, connexion comprise.
 */
function BrandPanel() {
  const { t } = useTranslation();
  return (
    <div className="hidden w-[45%] max-w-[620px] shrink-0 flex-col bg-gradient-to-br from-cmv-surface to-cmv-bg-1 p-cmv-3xl lg:flex">
      <div className="flex items-center gap-cmv-md">
        <svg width="32" height="32" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <path
            d="M11 3 L19 18 H3 Z"
            className="stroke-cmv-accent"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <circle cx="11" cy="7.4" r="1.6" className="fill-cmv-accent" />
        </svg>
        <span className="font-cmv-display text-cmv-title text-cmv-text-hi">
          {t("common.appName")}
        </span>
      </div>
      <div className="my-auto max-w-[460px]">
        <p className="font-cmv-display text-cmv-display text-cmv-text-hi">
          {t("auth.brand.title")}
        </p>
        <p className="mt-cmv-xl text-cmv-text-mid">{t("auth.brand.lead")}</p>
        <ul className="mt-cmv-2xl flex flex-col gap-cmv-lg">
          {BRAND_POINTS.map(({ labelKey, textKey }) => (
            <li key={labelKey} className="flex items-start gap-cmv-md">
              <IoCheckmark aria-hidden="true" className="mt-1 shrink-0 text-cmv-accent-on" />
              <span className="text-cmv-text-mid">
                <b className="font-semibold text-cmv-text-hi">{t(labelKey)}</b> {t(textKey)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function AuthLayout({ title, children }: Readonly<AuthLayoutProps>) {
  return (
    <main className="flex min-h-screen bg-cmv-bg-0">
      <BrandPanel />
      <div className="flex flex-1 items-center justify-center p-cmv-lg lg:p-cmv-3xl">
        <div className="w-full max-w-[440px]">
          <h1 className="mb-cmv-xl font-cmv-display text-cmv-title text-cmv-text-hi">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
