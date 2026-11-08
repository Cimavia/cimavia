import { capabilitiesOf } from "@cmv/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CapabilitySection } from "@/feature/account/component/CapabilitySection";
import { LegalLinks } from "@/feature/legal";
import { NotificationEmailSection } from "@/feature/notification";
import { CmvAppShell } from "@/shared/component";
import { appVersionLabel } from "@/shared/lib/app-version";
import { authClient } from "@/shared/lib/auth";

/**
 * Le compte : identité, capacités, notifications, informations légales, suppression.
 *
 * Hors des espaces de navigation, comme l'onglet Profil du mobile : ce n'est ni du coach ni de
 * l'athlète, c'est le compte. D'où son entrée dans le pied de la barre latérale, visible quel que
 * soit l'espace actif. L'Entreprise y vient aussi (#795), sans les capacités qu'elle ne peut pas
 * prendre (#600) ni les notifications qui ne la concernent pas.
 */
export function AccountScreen() {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();
  // Figé au montage : la session peut tomber sous la fenêtre de reconnexion, l'écran reste monté.
  const [isCompany] = useState(() => capabilitiesOf(session?.user).isCompany);
  const version = appVersionLabel();

  return (
    <CmvAppShell title={t("account.title")}>
      <div className="flex flex-col gap-cmv-xl">
        {/* Les notifications sont un réglage DU COMPTE, comme les casquettes : elles valent pour les
            deux espaces, et un compte à double capacité n'a qu'une seule boîte mail. Une Entreprise
            ne prend aucune casquette et ne reçoit aucun de ces événements. */}
        {!isCompany && (
          <>
            <CapabilitySection />
            <NotificationEmailSection />
          </>
        )}

        {/* Depuis l'app, et pas seulement avant l'inscription : les stores l'exigent (App Store,
            règle 5.1.1), et c'est ici qu'on revient chercher ses droits une fois inscrit (#778). */}
        <section className="flex max-w-xl flex-col gap-cmv-md">
          <h2 className="text-cmv-subtitle text-cmv-text-hi">{t("legal.title")}</h2>
          <p className="text-cmv-caption text-cmv-text-mid">{t("account.legal.description")}</p>
          <LegalLinks />
        </section>

        <section className="flex max-w-xl flex-col gap-cmv-md">
          <h2 className="text-cmv-subtitle text-cmv-text-hi">{t("account.delete.title")}</h2>
          <p className="text-cmv-caption text-cmv-text-mid">{t("account.delete.entry")}</p>
          <Link to="/account/delete" className="text-cmv-caption text-cmv-error hover:underline">
            {t("account.delete.title")}
          </Link>
        </section>

        {/* Ligne de pied de la maquette (`athlete_profile.dc.html`), sous le dernier bloc : c'est la
            seule réponse à « tu es sur quelle version ? ». Sans OTA, chaque livraison mobile est un
            build de store et un Athlete peut rester des semaines sur un binaire ancien sans le
            savoir. Discrète à dessein — on la cherche, on ne la subit pas. */}
        <p className="text-cmv-caption text-cmv-text-lo">
          {version == null ? t("account.about.unknown") : t("account.about.version", { version })}
        </p>
      </div>
    </CmvAppShell>
  );
}
