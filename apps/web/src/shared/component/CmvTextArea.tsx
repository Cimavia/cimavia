import type { TextareaHTMLAttributes } from "react";

type CmvTextAreaProps = Pick<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "placeholder" | "required" | "name" | "rows" | "maxLength"
> & { label: string };

export function CmvTextArea({ label, name, rows = 4, ...rest }: CmvTextAreaProps) {
  return (
    <label className="flex flex-col gap-cmv-xs text-cmv-caption text-cmv-text-mid" htmlFor={name}>
      {label}
      <textarea
        id={name}
        name={name}
        rows={rows}
        className="resize-y rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm text-cmv-body text-cmv-text-hi outline-none focus:border-cmv-accent"
        {...rest}
      />
    </label>
  );
}
