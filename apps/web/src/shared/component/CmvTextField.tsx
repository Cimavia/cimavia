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
> & {
  label: string;
  requiredMark?: boolean;
};

export function CmvTextField({ label, name, requiredMark, ...rest }: CmvTextFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-cmv-text-mid text-sm" htmlFor={name}>
      <span>
        {label}
        {requiredMark ? <span className="text-cmv-error"> *</span> : null}
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
