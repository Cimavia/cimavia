import { type BlockTally, BlockTallyState } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvText } from "@/shared/component";
import { usePhraseText } from "@/shared/hook/usePhraseText";

/**
 * Le décompte d'un bloc dans un débrief (#722) : vert quand tout est coché, en accent sinon, et
 * « pas de décompte » en gris quand rien ne l'est — ce qui MANQUE, jamais un reproche.
 */
export function BlockTallyText({ tally }: Readonly<{ tally: BlockTally | null }>) {
  const { t } = useTranslation();
  const text = usePhraseText();

  if (tally == null) {
    return (
      <CmvText className="text-cmv-text-lo text-xs">{t("feedback.tracking.untracked")}</CmvText>
    );
  }
  return (
    <CmvText
      className={
        tally.state === BlockTallyState.DONE
          ? "text-cmv-success text-xs"
          : "text-cmv-accent text-xs"
      }
    >
      {text([tally.label])}
    </CmvText>
  );
}
