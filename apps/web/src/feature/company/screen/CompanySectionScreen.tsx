import { useTranslation } from "react-i18next";
import { CmvAppShell } from "@/shared/component/CmvAppShell";
import { CmvEmptyState } from "@/shared/component/CmvEmptyState";

export type CompanySection = "coaches" | "athletes";

/**
 * Une page de l'espace Entreprise, vide tant que #601 (coachs) et #602 (athlètes) ne la remplissent
 * pas (#600). Un seul écran pour les deux : ils ne diffèrent que par leurs textes, et chacun aura le
 * sien quand il aura du contenu à montrer.
 */
// i18n-values company: coaches, athletes
export function CompanySectionScreen({ section }: Readonly<{ section: CompanySection }>) {
  const { t } = useTranslation();
  return (
    <CmvAppShell title={t(`company.${section}.title`)}>
      <CmvEmptyState title={t(`company.${section}.empty`)} />
    </CmvAppShell>
  );
}
