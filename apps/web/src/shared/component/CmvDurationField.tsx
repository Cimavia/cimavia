import { formatTrainingDuration, parseTrainingDuration } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvDraftInput, type DraftReading } from "@/shared/component/CmvDraftInput";

type CmvDurationFieldProps = {
  label: string;
  labelHidden?: boolean;
  /** Durée en SECONDES, ou `null` quand elle n'est pas renseignée. */
  value: number | null;
  onChange: (seconds: number | null) => void;
  placeholder?: string;
  /**
   * Les bornes, en secondes, quand le champ en a de plus étroites que les durées d'entraînement :
   * une durée de structure va de 1 s à 3 h (#715). Hors bornes, la saisie est refusée (#566).
   */
  bounds?: { min: number; max: number };
  /** `false` : la durée est exigée, et un champ vidé est refusé plutôt que de remonter `null`. */
  nullable?: boolean;
};

/**
 * Saisie de durée tolérante : `150`, `2:30`, `2m30` et `2'30` désignent tous deux minutes trente.
 * Un nombre nu compte des SECONDES — c'est la convention de `parseTrainingDuration`, partagée avec
 * le serveur.
 */
export function CmvDurationField({
  label,
  labelHidden,
  value,
  onChange,
  placeholder,
  bounds,
  nullable = true,
}: Readonly<CmvDurationFieldProps>) {
  const { t } = useTranslation();

  function read(text: string): DraftReading<number | null> {
    if (text === "") {
      return nullable ? { value: null } : { refused: t("common.durationRequired") };
    }
    const seconds = parseTrainingDuration(text);
    if (seconds == null) return { refused: t("common.durationInvalid") };
    if (bounds != null && (seconds < bounds.min || seconds > bounds.max)) {
      return {
        refused: t("common.durationOutOfBounds", {
          min: formatTrainingDuration(bounds.min),
          max: formatTrainingDuration(bounds.max),
        }),
      };
    }
    return { value: seconds };
  }

  return (
    <CmvDraftInput
      label={label}
      labelHidden={labelHidden}
      formatted={formatTrainingDuration(value) ?? ""}
      read={read}
      onChange={onChange}
      placeholder={placeholder}
    />
  );
}
