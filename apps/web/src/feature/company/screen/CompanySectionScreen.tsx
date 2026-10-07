import { useTranslation } from "react-i18next";
import { CmvAppShell } from "@/shared/component/CmvAppShell";
import { CmvEmptyState } from "@/shared/component/CmvEmptyState";

export type CompanySection = "athletes";

/**
 * Une page de l'espace Entreprise encore vide (#600) : les athlètes, jusqu'à #602. Les coachs ont
 * reçu leur écran en #601 ; celui-ci disparaîtra avec la dernière section qu'il tient.
 */
// i18n-values company: athletes
export function CompanySectionScreen({ section }: Readonly<{ section: CompanySection }>) {
  const { t } = useTranslation();
  return (
    <CmvAppShell title={t(`company.${section}.title`)}>
      <CmvEmptyState title={t(`company.${section}.empty`)} />
    </CmvAppShell>
  );
}
