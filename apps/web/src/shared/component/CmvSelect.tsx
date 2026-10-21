import type { SelectHTMLAttributes } from "react";

export type CmvSelectOption = { value: string; label: string };

// Des options sous un intitulé commun (`<optgroup>`) — ex. les jours d'un cycle, par semaine.
export type CmvSelectGroup = { label: string; options: CmvSelectOption[] };

type CmvSelectProps = Pick<
  SelectHTMLAttributes<HTMLSelectElement>,
  "value" | "onChange" | "required" | "name" | "disabled"
> & {
  label: string;
  // Option vide en tête (ex. « Aucun modèle ») — omise = liste sans choix neutre.
  placeholder?: string;
} & (
    | { options: CmvSelectOption[]; groups?: never }
    | { groups: CmvSelectGroup[]; options?: never }
  );

function renderOptions(options: readonly CmvSelectOption[]) {
  return options.map((option) => (
    <option key={option.value} value={option.value}>
      {option.label}
    </option>
  ));
}

// Choix parmi une liste potentiellement longue (athlètes, séances modèles) — là où CmvSegmented,
// qui affiche toutes les options d'un coup, ne tient plus.
export function CmvSelect({
  label,
  name,
  options,
  groups,
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
        {groups == null
          ? renderOptions(options)
          : groups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {renderOptions(group.options)}
              </optgroup>
            ))}
      </select>
    </label>
  );
}
