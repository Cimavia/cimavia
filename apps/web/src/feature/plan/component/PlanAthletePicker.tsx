import { useTranslation } from "react-i18next";
import { useAthletes } from "@/feature/athlete/hook/useAthletes";
import { CmvSelect } from "@/shared/component";
import { useAthleteLabel } from "@/shared/hook/useAthleteLabel";

type PlanAthletePickerProps = {
  /** `null` = destinataire pas encore choisi (#144). */
  athleteId: string | null;
  isPublished: boolean;
  isBusy: boolean;
  onChange: (athleteId: string | null) => void;
};

/**
 * À qui ce cycle s'adresse — modifiable tant qu'il est en brouillon (#144).
 *
 * DÉSACTIVÉ et expliqué une fois le cycle diffusé, jamais masqué : le faire disparaître laisserait
 * croire que le destinataire n'a jamais été modifiable, alors qu'il l'était jusqu'à la diffusion.
 * Même grammaire que « Coller ici » sur un cycle diffusé, et que le bouton « Supprimer ».
 *
 * Descendu de l'en-tête fixe vers le formulaire du cycle (#207) : un seul endroit pour tout ce qui
 * définit le cycle l'emporte sur l'accès sans défilement, l'affectation se faisant une fois par
 * cycle et non en cours de construction.
 */
export function PlanAthletePicker({
  athleteId,
  isPublished,
  isBusy,
  onChange,
}: Readonly<PlanAthletePickerProps>) {
  const { t } = useTranslation();
  const athleteLabel = useAthleteLabel();
  const { data: athletes } = useAthletes();

  return (
    // Info-bulle portée par un span : le `title` d'un contrôle désactivé ne s'affiche pas partout.
    <span title={isPublished ? t("plan.header.athleteLockedPublished") : undefined}>
      <CmvSelect
        label={t("plan.header.athlete")}
        name="planAthleteId"
        value={athleteId ?? ""}
        // Le choix neutre vaut « pas encore décidé », et se transmet comme tel : `null`, jamais
        // une chaîne vide que l'API prendrait pour un identifiant.
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
        placeholder={t("plan.header.athletePlaceholder")}
        // « (moi) » sur sa propre entrée, comme partout où un coach lit sa liste d'athlètes (#14).
        options={(athletes ?? []).map((relation) => ({
          value: relation.athleteId,
          label: athleteLabel(relation.athleteId, relation.athleteName),
        }))}
        disabled={isPublished || isBusy}
      />
    </span>
  );
}
