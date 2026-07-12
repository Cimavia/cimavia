import { cn } from "@/shared/util/cn.util";

export type CmvSegmentedOption<T extends string> = { value: T; label: string };

type CmvSegmentedProps<T extends string> = {
  options: CmvSegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
};

// Sélecteur segmenté (catégorie d'exercice, filtre de liste…) — alternative accessible au select.
export function CmvSegmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: CmvSegmentedProps<T>) {
  return (
    <div className="flex flex-col gap-cmv-xs">
      {label == null ? null : <span className="text-cmv-caption text-cmv-text-mid">{label}</span>}
      <div className="inline-flex gap-cmv-xs rounded-cmv-md border border-cmv-border bg-cmv-bg-1 p-cmv-xs">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-cmv-sm px-cmv-md py-cmv-xs text-cmv-caption transition-colors",
              option.value === value
                ? "bg-cmv-surface-hi text-cmv-text-hi"
                : "text-cmv-text-mid hover:text-cmv-text-hi",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
