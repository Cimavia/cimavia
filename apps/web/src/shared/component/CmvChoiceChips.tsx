import { cn } from "@/shared/util/cn.util";

export type CmvChoiceChip<T extends string> = { value: T; label: string };

type CmvChoiceChipsProps<T extends string> = {
  options: readonly CmvChoiceChip<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
};

/**
 * Choix unique sur une liste OUVERTE, qui passe à la ligne.
 *
 * `CmvSegmented` couvre le même besoin sur une liste fermée et courte — trois catégories tenaient
 * dans un rail. Des tags libres n'y tiennent pas : le rail déborderait latéralement dès la
 * dizaine, et rien ne borne le nombre de tags d'un coach.
 */
export function CmvChoiceChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: Readonly<CmvChoiceChipsProps<T>>) {
  return (
    <div className="flex flex-col gap-cmv-xs">
      {label == null ? null : <span className="text-cmv-caption text-cmv-text-mid">{label}</span>}
      <div className="flex flex-wrap gap-cmv-xs">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-cmv-pill border px-cmv-md py-cmv-xs text-cmv-caption transition-colors",
              option.value === value
                ? "border-cmv-accent-line bg-cmv-accent-soft text-cmv-accent-on"
                : "border-cmv-border bg-cmv-surface text-cmv-text-mid hover:text-cmv-text-hi",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
