import type { InputHTMLAttributes } from "react";

type CmvTextFieldProps = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  | "type"
  | "value"
  | "onChange"
  // Validation/normalisation à la sortie du champ (ex. recaler une date sur un lundi).
  | "onBlur"
  | "placeholder"
  | "required"
  | "autoComplete"
  | "name"
  | "minLength"
  // Bornes des champs numériques et de date (ex. nombre de semaines d'un cycle).
  | "min"
  | "max"
> & { label: string };

export function CmvTextField({ label, name, ...rest }: CmvTextFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-cmv-text-mid text-sm" htmlFor={name}>
      {label}
      <input
        id={name}
        name={name}
        className="rounded-lg border border-cmv-border bg-cmv-surface px-3 py-2 text-cmv-text-hi outline-none focus:border-cmv-accent"
        {...rest}
      />
    </label>
  );
}
