import { useTranslation } from "react-i18next";
import { useIsBundleUpdateAvailable } from "@/shared/hook/useBundleUpdate";
import { CmvButton } from "./CmvButton";

/**
 * « Nouvelle version disponible — Recharger » (#290), quand la route racine a vu un nouveau bundle
 * en ligne.
 *
 * Jamais de rechargement sans le Coach (« Tranché en #290 ») : il effacerait une saisie en cours.
 * Le bouton recharge la page ; un écran à saisie non enregistrée arme déjà `beforeunload`
 * (`useLeaveGuard`), et le navigateur demande alors confirmation.
 *
 * Pas de bouton fermer : l'invite reste jusqu'au rechargement, sans rien bloquer. Elle vit dans la
 * barre latérale, au-dessus du compte, et non en surimpression : posée sur la page, elle couvrait
 * le champ de la messagerie ou les actions du bandeau, sans pouvoir s'en écarter.
 */
export function CmvUpdateBanner() {
  const { t } = useTranslation();
  if (!useIsBundleUpdateAvailable()) return null;

  return (
    <output className="flex flex-col gap-cmv-sm rounded-cmv-md border border-cmv-info-line bg-cmv-info-soft p-cmv-md">
      <p className="text-cmv-caption text-cmv-info-on">{t("common.update.available")}</p>
      <CmvButton onClick={() => window.location.reload()}>{t("common.update.reload")}</CmvButton>
    </output>
  );
}
