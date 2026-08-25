import { formatTrainingDuration, parseTrainingDuration } from "@cmv/shared";
import { useId, useState } from "react";
import { cn } from "@/shared/util/cn.util";

type CmvDurationFieldProps = {
  label: string;
  /** Durée en SECONDES, ou `null` quand elle n'est pas renseignée. */
  value: number | null;
  onChange: (seconds: number | null) => void;
  placeholder?: string;
};

/**
 * Saisie de durée tolérante : `150`, `2:30`, `2m30` et `2'30` désignent tous deux minutes trente.
 * Un nombre nu compte des SECONDES — c'est la convention de `parseTrainingDuration`, partagée avec
 * le serveur.
 *
 * Le texte reste local tant qu'il n'est pas valide, et la valeur n'est propagée qu'à la sortie du
 * champ : propager à chaque frappe ferait remonter `2` puis `2:` puis `2:3`, c'est-à-dire trois
 * durées que le coach n'a jamais voulues.
 */
export function CmvDurationField({
  label,
  value,
  onChange,
  placeholder,
}: Readonly<CmvDurationFieldProps>) {
  const inputId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  // `draft` non nul = le coach est en train de taper ; sinon on affiche la valeur mise en forme.
  const shown = draft ?? formatTrainingDuration(value) ?? "";

  function commit() {
    const text = (draft ?? "").trim();
    if (draft == null) return;

    if (text === "") {
      setInvalid(false);
      setDraft(null);
      onChange(null);
      return;
    }

    const seconds = parseTrainingDuration(text);
    if (seconds == null) {
      // On NE revient PAS silencieusement à l'ancienne valeur : le coach verrait sa saisie
      // disparaître sans savoir ce qui a été refusé.
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft(null);
    onChange(seconds);
  }

  return (
    <label className="flex items-center gap-cmv-sm" htmlFor={inputId}>
      <span className="whitespace-nowrap text-cmv-caption text-cmv-text-mid">{label}</span>
      <input
        id={inputId}
        value={shown}
        inputMode="numeric"
        aria-invalid={invalid}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
        className={cn(
          "w-20 rounded-cmv-sm border bg-cmv-surface px-cmv-sm py-cmv-xs text-cmv-body text-cmv-text-hi outline-none",
          invalid ? "border-cmv-error" : "border-cmv-border focus:border-cmv-accent",
        )}
      />
    </label>
  );
}
