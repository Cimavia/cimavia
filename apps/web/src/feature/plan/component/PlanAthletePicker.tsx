import { useTranslation } from "react-i18next";
import { useAthletes } from "@/feature/athlete/hook/useAthletes";
import { CmvSelect } from "@/shared/component";
import { useAthleteLabel } from "@/shared/hook/useAthleteLabel";

type PlanAthletePickerProps = {
  /** `null` = destinataire pas encore choisi (#144). */
  athleteId: string | null;
  isPublished: boolean;
  /** Un justificatif PDF est joint à la facturation du cycle : il nomme son destinataire (#472). */
  hasInvoiceDocument: boolean;
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
 *
 * Fermé AUSSI tant qu'un justificatif est joint (#472) : le PDF est rédigé pour ce destinataire, et
 * l'API refuse de le faire suivre. La raison s'écrit SOUS le champ, et non en info-bulle — celle
 * d'un contrôle désactivé ne s'affiche pas partout (#313), et c'est ici un geste à faire, pas un
 * état à constater.
 */
export function PlanAthletePicker({
  athleteId,
  isPublished,
  hasInvoiceDocument,
  isBusy,
  onChange,
}: Readonly<PlanAthletePickerProps>) {
  const { t } = useTranslation();
  const athleteLabel = useAthleteLabel();
  const { data: athletes } = useAthletes();

  // Diffusé, la raison est déjà dite par l'en-tête du formulaire : seul le justificatif s'ajoute.
  const lockedByDocument = hasInvoiceDocument && !isPublished;

  return (
    <div className="flex flex-col gap-cmv-xs">
      {/* Info-bulle portée par un span : le `title` d'un contrôle désactivé ne s'affiche pas
          partout. */}
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
          disabled={isPublished || lockedByDocument || isBusy}
        />
      </span>
      {lockedByDocument ? (
        <p className="text-cmv-caption text-cmv-text-lo">
          {t("plan.header.athleteLockedDocument")}
        </p>
      ) : null}
    </div>
  );
}
