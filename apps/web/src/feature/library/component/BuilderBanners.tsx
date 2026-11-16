import { useTranslation } from "react-i18next";
import { CmvReadOnlyBanner, CmvStaleBanner } from "@/shared/component";

type BuilderBannersProps = {
  /** Le bandeau de Lecture (#606), déjà traduit : il nomme le propriétaire. `null` en Écriture. */
  readOnlyMessage: string | null;
  /** La clé du conflit d'édition (#604), `null` sans conflit. */
  staleMessage: string | null;
  /**
   * L'élément enregistré, celui que « Recharger » relit — `null` à la création : un élément qui
   * naît n'a aucune version à laquelle se heurter, donc pas de bandeau de conflit.
   */
  editedId: string | null;
  onReload: (id: string) => void;
  isReloading: boolean;
};

/** Les bandeaux des constructeurs d'exercice et de séance : la Lecture, puis le conflit. */
export function BuilderBanners({
  readOnlyMessage,
  staleMessage,
  editedId,
  onReload,
  isReloading,
}: Readonly<BuilderBannersProps>) {
  const { t } = useTranslation();
  return (
    <>
      {readOnlyMessage == null ? null : (
        <div className="mb-cmv-xl">
          <CmvReadOnlyBanner message={readOnlyMessage} />
        </div>
      )}
      {staleMessage == null || editedId == null ? null : (
        <div className="mb-cmv-xl">
          <CmvStaleBanner
            message={t(staleMessage)}
            onReload={() => onReload(editedId)}
            isReloading={isReloading}
          />
        </div>
      )}
    </>
  );
}
