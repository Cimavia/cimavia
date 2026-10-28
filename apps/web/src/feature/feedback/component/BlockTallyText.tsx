import { type BlockTally, BlockTallyState } from "@cmv/shared";
import { useTranslation } from "react-i18next";
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
      <span className="shrink-0 text-cmv-caption text-cmv-text-lo">
        {t("feedback.tracking.untracked")}
      </span>
    );
  }
  return (
    <span
      className={
        tally.state === BlockTallyState.DONE
          ? "shrink-0 text-cmv-caption text-cmv-success"
          : "shrink-0 text-cmv-caption text-cmv-accent"
      }
    >
      {text([tally.label])}
    </span>
  );
}
