import { type KeyboardEvent, useId, useMemo, useState } from "react";

/**
 * Saisie de tags libres avec autocomplétion.
 *
 * La NORMALISATION est dans le composant et non chez l'appelant : sans elle, « Renfo » et « renfo »
 * cohabiteraient dans la même liste et la déduplication ne verrait rien. Le défaut — couper et
 * mettre en minuscules — est exactement la règle d'`exerciseTagSchema` côté serveur.
 */
export const defaultTagNormalize = (raw: string): string => raw.trim().toLowerCase();

type CmvTagInputProps = {
  label: string;
  value: readonly string[];
  onChange: (tags: string[]) => void;
  /** Tags déjà connus, proposés à la frappe. Ceux déjà posés en sont retirés. */
  suggestions?: readonly string[];
  placeholder?: string;
  max?: number;
  removeLabel: string;
  normalize?: (raw: string) => string;
};

export function CmvTagInput({
  label,
  value,
  onChange,
  suggestions = [],
  placeholder,
  max,
  removeLabel,
  normalize = defaultTagNormalize,
}: Readonly<CmvTagInputProps>) {
  const inputId = useId();
  const listId = useId();
  const [draft, setDraft] = useState("");

  const isFull = max != null && value.length >= max;

  const matches = useMemo(() => {
    const needle = normalize(draft);
    return suggestions
      .filter((tag) => !value.includes(tag))
      .filter((tag) => needle === "" || tag.includes(needle))
      .slice(0, SUGGESTION_LIMIT);
  }, [draft, suggestions, value, normalize]);

  function add(raw: string) {
    const tag = normalize(raw);
    // Un doublon n'est pas une erreur à signaler : le tag est déjà là, l'intention est satisfaite.
    if (tag === "" || isFull || value.includes(tag)) {
      setDraft("");
      return;
    }
    onChange([...value, tag]);
    setDraft("");
  }

  function remove(tag: string) {
    onChange(value.filter((item) => item !== tag));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      // `preventDefault` sur Entrée : sans lui, la touche soumettrait le formulaire porteur.
      event.preventDefault();
      add(draft);
      return;
    }
    // Retour arrière sur un champ vide = retirer le dernier tag, geste attendu de ce type de champ.
    if (event.key === "Backspace" && draft === "") {
      const last = value.at(-1);
      if (last != null) remove(last);
    }
  }

  return (
    <div className="flex flex-col gap-cmv-xs">
      <label className="text-cmv-caption text-cmv-text-mid" htmlFor={inputId}>
        {label}
      </label>

      <div className="flex flex-wrap items-center gap-cmv-xs rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm focus-within:border-cmv-accent">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-cmv-xs rounded-cmv-sm border border-cmv-accent-line bg-cmv-accent-soft px-cmv-sm py-cmv-xs text-cmv-accent-on text-cmv-caption font-semibold"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              aria-label={`${removeLabel} ${tag}`}
              className="text-cmv-accent-on/70 hover:text-cmv-accent-on"
            >
              ×
            </button>
          </span>
        ))}

        <input
          id={inputId}
          list={listId}
          value={draft}
          disabled={isFull}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
          placeholder={isFull ? undefined : placeholder}
          className="min-w-32 flex-1 bg-transparent text-cmv-body text-cmv-text-hi outline-none"
        />

        {/* `datalist` plutôt qu'un menu maison : le navigateur gère le filtrage au clavier,
            l'accessibilité et le positionnement — trois choses qu'une liste maison rate souvent. */}
        <datalist id={listId}>
          {matches.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      </div>
    </div>
  );
}

const SUGGESTION_LIMIT = 8;
