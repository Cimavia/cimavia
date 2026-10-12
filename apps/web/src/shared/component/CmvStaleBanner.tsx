import { useTranslation } from "react-i18next";
import { CmvButton } from "./CmvButton";

type CmvStaleBannerProps = {
  /** Ce qui a changé, dit pour l'élément édité : « Cette fiche… », « Cet exercice… ». */
  message: string;
  onReload: () => void;
  isReloading: boolean;
};

/**
 * Le bandeau d'un conflit d'édition (#440, maquette #597) : l'élément a changé pendant la saisie,
 * l'API a refusé l'écriture. La saisie reste affichée ; « Recharger » la REMPLACE par la dernière
 * version, sans fusion. Ni version serveur à côté, ni nom d'auteur — tranché en #597.
 */
export function CmvStaleBanner({ message, onReload, isReloading }: Readonly<CmvStaleBannerProps>) {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-cmv-sm rounded-cmv-md border border-cmv-warning-line bg-cmv-warning-soft px-cmv-md py-cmv-sm"
    >
      <span className="flex-1 text-cmv-caption text-cmv-warning-on">{message}</span>
      <CmvButton variant="ghost" onClick={onReload} disabled={isReloading}>
        {t("common.staleReload")}
      </CmvButton>
    </div>
  );
}
