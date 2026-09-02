import type { AthleteIdentity } from "@cmv/shared";
import { type SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAthleteSheet, useSaveAthleteSheet } from "@/feature/athlete/hook/useAthletes";
import { CmvButton, CmvPanel, CmvTextArea } from "@/shared/component";
import { useAthleteLabel } from "@/shared/hook/useAthleteLabel";

type AthleteSheetPanelProps = {
  /**
   * Un id et un nom, pas un `CoachAthleteDto` : c'est tout ce que ce panneau lit, et l'exiger
   * entier obligeait chaque appelant à charger la liste des athlètes pour ouvrir une fiche. Le
   * volet de lecture d'un débrief, lui, a déjà les deux sous la main.
   */
  athlete: AthleteIdentity;
  onClose: () => void;
};

/**
 * Fiche athlète : UN champ texte libre, éditable par le coach seul (CDC §5.9). Pas de structure
 * imposée en MVP — objectifs, points forts, notes, tout tient dans ce champ.
 */
export function AthleteSheetPanel({ athlete, onClose }: Readonly<AthleteSheetPanelProps>) {
  const { t } = useTranslation();
  const athleteLabel = useAthleteLabel();
  const { data: sheet, isPending } = useAthleteSheet(athlete.athleteId);
  const saveSheet = useSaveAthleteSheet(athlete.athleteId);

  // La fiche est null tant qu'elle n'a pas été écrite : le champ démarre vide, sans fabriquer
  // un objet fiche fictif côté client.
  const [content, setContent] = useState<string | null>(null);
  const value = content ?? sheet?.content ?? "";

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    saveSheet.mutate(value, { onSuccess: onClose });
  }

  return (
    <CmvPanel
      open
      title={athleteLabel(athlete.athleteId, athlete.athleteName)}
      description={t("athlete.sheet.description")}
      onClose={onClose}
      footer={
        <>
          <CmvButton variant="ghost" onClick={onClose} disabled={saveSheet.isPending}>
            {t("common.cancel")}
          </CmvButton>
          <CmvButton type="submit" onClick={onSubmit} disabled={saveSheet.isPending}>
            {saveSheet.isPending ? t("athlete.sheet.submitting") : t("athlete.sheet.submit")}
          </CmvButton>
        </>
      }
    >
      {isPending ? (
        <p className="text-cmv-text-mid">{t("common.loading")}</p>
      ) : (
        <form onSubmit={onSubmit}>
          <CmvTextArea
            label={t("athlete.sheet.label")}
            name="sheetContent"
            value={value}
            onChange={(event) => setContent(event.target.value)}
            placeholder={t("athlete.sheet.placeholder")}
            rows={16}
          />
        </form>
      )}
    </CmvPanel>
  );
}
