import { useId } from "react";
import { cn } from "@/shared/util/cn.util";

export type CmvSegmentedOption<T extends string> = { value: T; label: string };

/**
 * Ce qui NOMME le groupe — une forme et une seule, jamais aucune (#650) : un lecteur d'écran
 * annoncerait « Entraînement, bouton » sans dire ce qu'on choisit. Le type l'impose, un oubli ne
 * compile pas.
 */
type CmvSegmentedName =
  /** Libellé visible au-dessus des segments : il nomme aussi le groupe. */
  | { label: string; ariaLabel?: never; ariaLabelledBy?: never }
  /** Libellé visible posé AILLEURS par l'appelant (sur la même ligne, en tête de rangée) : son id. */
  | { ariaLabelledBy: string; label?: never; ariaLabel?: never }
  /** Pas de libellé visible — le contexte le dit à l'œil, pas au lecteur d'écran. */
  | { ariaLabel: string; label?: never; ariaLabelledBy?: never };

type CmvSegmentedProps<T extends string> = CmvSegmentedName & {
  options: CmvSegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  // Une écriture en vol : un second choix partirait sur l'état d'avant elle.
  disabled?: boolean;
};

/**
 * Sélecteur segmenté (catégorie d'exercice, filtre de liste…) — alternative accessible au select.
 *
 * Des boutons à bascule (`aria-pressed`), pas un `radiogroup` : c'est le contrat de
 * `CmvToggleChip`, et le patron radio exigerait la navigation aux flèches et un seul arrêt de
 * tabulation, pour des groupes de deux à quatre options (« Tranché en #650 »).
 */
export function CmvSegmented<T extends string>({
  options,
  value,
  onChange,
  label,
  ariaLabel,
  ariaLabelledBy,
  disabled = false,
}: Readonly<CmvSegmentedProps<T>>) {
  const labelId = useId();
  const labelledBy = label == null ? ariaLabelledBy : labelId;
  return (
    <div className="flex flex-col gap-cmv-xs">
      {label == null ? null : (
        <span id={labelId} className="text-cmv-caption text-cmv-text-mid">
          {label}
        </span>
      )}
      {/* `fieldset` : le rôle `group` sans l'écrire. Nommé par `aria-labelledby` plutôt que par
          une `legend`, que les navigateurs sortent du flux et refusent de mettre en flex. */}
      <fieldset
        aria-labelledby={labelledBy}
        aria-label={ariaLabel}
        className="inline-flex min-w-0 gap-cmv-xs rounded-cmv-md border border-cmv-border bg-cmv-bg-1 p-cmv-xs"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-cmv-sm px-cmv-md py-cmv-xs text-cmv-caption transition-colors disabled:opacity-50",
              option.value === value
                ? "bg-cmv-surface-hi text-cmv-text-hi"
                : "text-cmv-text-mid hover:text-cmv-text-hi",
            )}
          >
            {option.label}
          </button>
        ))}
      </fieldset>
    </div>
  );
}
