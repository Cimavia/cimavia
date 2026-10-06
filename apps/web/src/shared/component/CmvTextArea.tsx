import type { TextareaHTMLAttributes } from "react";
import { CmvCharCount } from "./CmvCharCount";

type CmvTextAreaProps = Pick<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "placeholder" | "required" | "name" | "rows" | "maxLength" | "disabled"
> & { label: string };

/**
 * Pas de `requiredMark` ici, contrairement à `CmvTextField` : aucune zone de texte du produit n'est
 * obligatoire DANS un formulaire qui mélange obligatoire et facultatif — la seule qui le soit (la
 * note d'un rappel) vit dans un panneau dont tout est requis, et que la règle laisse nu. La prop
 * naîtrait donc sans appelant (« Tranché en #97 »).
 *
 * Bornée par `maxLength`, elle montre son compteur à l'approche de la borne (#319).
 */
export function CmvTextArea({ label, name, rows = 4, ...rest }: CmvTextAreaProps) {
  const { value, maxLength } = rest;
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
      {maxLength === undefined ? null : (
        <CmvCharCount length={typeof value === "string" ? value.length : 0} maxLength={maxLength} />
      )}
    </label>
  );
}
