import type { SelectHTMLAttributes } from "react";

export type CmvSelectOption = { value: string; label: string };

type CmvSelectProps = Pick<
  SelectHTMLAttributes<HTMLSelectElement>,
  "value" | "onChange" | "required" | "name" | "disabled"
> & {
  label: string;
  options: CmvSelectOption[];
  // Option vide en tête (ex. « Aucun modèle ») — omise = liste sans choix neutre.
  placeholder?: string;
};

// Choix parmi une liste potentiellement longue (athlètes, séances modèles) — là où CmvSegmented,
// qui affiche toutes les options d'un coup, ne tient plus.
export function CmvSelect({
  label,
  name,
  options,
  placeholder,
  ...rest
}: Readonly<CmvSelectProps>) {
  return (
    <label className="flex flex-col gap-1 text-cmv-text-mid text-sm" htmlFor={name}>
      {label}
      <select
        id={name}
        name={name}
        className="rounded-lg border border-cmv-border bg-cmv-surface px-3 py-2 text-cmv-text-hi outline-none focus:border-cmv-accent"
        {...rest}
      >
        {placeholder == null ? null : <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
