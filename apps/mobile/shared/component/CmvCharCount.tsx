import { shouldShowCharCount } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvText } from "./CmvText";

type CmvCharCountProps = { length: number; maxLength: number };

/**
 * « 4 620 / 5 000 » sous une zone de texte bornée, à l'approche de sa borne seulement (#319).
 *
 * Le `maxLength` du champ arrête la saisie net ; c'est ce compteur qui dit pourquoi. Le seuil vit
 * dans `@cmv/shared`, pour que mobile et web se taisent et parlent au même caractère.
 */
export function CmvCharCount({ length, maxLength }: Readonly<CmvCharCountProps>) {
  const { t } = useTranslation();
  if (!shouldShowCharCount(length, maxLength)) return null;
  return (
    <CmvText className="self-end text-cmv-text-lo text-xs">
      {t("common.charCount", { length, max: maxLength })}
    </CmvText>
  );
}
