import { IoChevronDown, IoChevronForward } from "react-icons/io5";

type FoldButtonProps = {
  folded: boolean;
  /** « Replier le bloc 1 » ou « Déplier le bloc 1 » : le geste que le clic fera. */
  label: string;
  onToggle: () => void;
};

/** Le chevron qui replie un bloc ou un exercice de la séance (#719) : ▸ replié, ▾ déplié. */
export function FoldButton({ folded, label, onToggle }: Readonly<FoldButtonProps>) {
  return (
    <button
      type="button"
      aria-expanded={!folded}
      aria-label={label}
      onClick={onToggle}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-cmv-sm text-cmv-text-mid hover:bg-cmv-surface-hi hover:text-cmv-text-hi"
    >
      {folded ? <IoChevronForward aria-hidden /> : <IoChevronDown aria-hidden />}
    </button>
  );
}
