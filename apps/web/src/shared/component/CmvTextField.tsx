import type { InputHTMLAttributes } from "react";

type CmvTextFieldProps = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  | "type"
  | "value"
  | "onChange"
  | "onBlur"
  | "placeholder"
  | "required"
  | "autoComplete"
  | "name"
  | "minLength"
  | "min"
  | "max"
  | "disabled"
> & {
  label: string;
  /**
   * Repère visuel d'obligation. Opt-in, et pas dérivé de `required` : on ne le pose que sur les
   * formulaires qui MÉLANGENT obligatoire et facultatif — sur un login dont tout est requis, il
   * ne distingue rien (« Tranché en #97 »).
   */
  requiredMark?: boolean;
};

export function CmvTextField({ label, name, requiredMark, ...rest }: CmvTextFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-cmv-text-mid text-sm" htmlFor={name}>
      <span>
        {label}
        {/* `aria-hidden` : sans lui l'astérisque entre dans le NOM ACCESSIBLE du champ, qui
            s'annonce « Montant astérisque ». L'obligation est déjà portée par `required`, que le
            lecteur d'écran restitue seul — le repère n'est donc que visuel. */}
        {requiredMark ? (
          <span aria-hidden="true" className="text-cmv-error">
            {" *"}
          </span>
        ) : null}
      </span>
      <input
        id={name}
        name={name}
        className="rounded-lg border border-cmv-border bg-cmv-surface px-3 py-2 text-cmv-text-hi outline-none focus:border-cmv-accent"
        {...rest}
      />
    </label>
  );
}
