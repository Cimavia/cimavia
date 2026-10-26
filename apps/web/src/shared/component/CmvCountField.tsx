import { useTranslation } from "react-i18next";
import { CmvDraftInput, type DraftReading } from "@/shared/component/CmvDraftInput";

type CmvCountFieldProps = {
  label: string;
  labelHidden?: boolean;
  /** Ce que l'on compte, après le champ (« tours »). */
  unit?: string;
  value: number;
  onChange: (count: number) => void;
  min: number;
  max: number;
};

const WHOLE_NUMBER = /^\d{1,4}$/;

/**
 * Un nombre entier exigé, entre deux bornes : tours, bips, intervalles. Vide, décimal ou hors
 * bornes, la saisie est refusée et reste à l'écran (#566).
 */
export function CmvCountField({
  label,
  labelHidden,
  unit,
  value,
  onChange,
  min,
  max,
}: Readonly<CmvCountFieldProps>) {
  const { t } = useTranslation();

  function read(text: string): DraftReading<number> {
    const count = WHOLE_NUMBER.test(text) ? Number(text) : null;
    if (count == null || count < min || count > max) {
      return { refused: t("common.countOutOfBounds", { min, max }) };
    }
    return { value: count };
  }

  return (
    <CmvDraftInput
      label={label}
      labelHidden={labelHidden}
      suffix={unit}
      formatted={String(value)}
      read={read}
      onChange={onChange}
    />
  );
}
