import { useId, useState } from "react";
import { useReportRefused } from "@/shared/hook/useRefusedFields";
import { cn } from "@/shared/util/cn.util";

/** Ce que devient le texte saisi : une valeur à propager, ou la raison de son refus. */
export type DraftReading<T> = { value: T } | { refused: string };

type CmvDraftInputProps<T> = {
  label: string;
  /** Le libellé n'est lu que par les lecteurs d'écran : le texte autour du champ le dit déjà. */
  labelHidden?: boolean | undefined;
  /** Ce qui suit le champ, sur la même ligne (« tours »). */
  suffix?: string | undefined;
  /** Le texte de la valeur reçue, mis en forme. */
  formatted: string;
  /** Lit le texte saisi, rogné. */
  read: (text: string) => DraftReading<T>;
  onChange: (value: T) => void;
  placeholder?: string | undefined;
};

/**
 * Un champ court dont la saisie ne vaut qu'une fois quittée : durée, nombre de tours. Propager à
 * chaque frappe ferait remonter `2` puis `2:` puis `2:3`, c'est-à-dire des valeurs que le coach n'a
 * jamais voulues.
 *
 * Le texte reste local tant qu'il n'est pas lu. Une saisie refusée reste À L'ÉCRAN, avec sa raison,
 * et se déclare au registre de l'écran (#566) : revenir en silence à l'ancienne valeur ferait
 * enregistrer autre chose que ce que le coach voit.
 */
export function CmvDraftInput<T>({
  label,
  labelHidden = false,
  suffix,
  formatted,
  read,
  onChange,
  placeholder,
}: Readonly<CmvDraftInputProps<T>>) {
  const inputId = useId();
  const hintId = useId();
  // `draft` non nul = le coach est en train de taper ; sinon on affiche la valeur mise en forme.
  const [draft, setDraft] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  useReportRefused(refused != null);

  function commit() {
    if (draft == null) return;
    const reading = read(draft.trim());
    if ("refused" in reading) {
      setRefused(reading.refused);
      return;
    }
    setRefused(null);
    setDraft(null);
    onChange(reading.value);
  }

  return (
    <div className="flex flex-col gap-cmv-xs">
      {/* Le suffixe hors du `<label>` : il ne fait pas partie du nom du champ. */}
      <div className="flex items-center gap-cmv-sm">
        <label
          htmlFor={inputId}
          className={cn(
            "whitespace-nowrap text-cmv-caption text-cmv-text-mid",
            labelHidden && "sr-only",
          )}
        >
          {label}
        </label>
        <input
          id={inputId}
          value={draft ?? formatted}
          inputMode="numeric"
          aria-invalid={refused != null}
          aria-describedby={refused == null ? undefined : hintId}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
          }}
          className={cn(
            "w-20 rounded-cmv-sm border bg-cmv-surface px-cmv-sm py-cmv-xs text-cmv-body text-cmv-text-hi outline-none",
            refused == null ? "border-cmv-border focus:border-cmv-accent" : "border-cmv-error",
          )}
        />
        {suffix == null ? null : (
          <span className="whitespace-nowrap text-cmv-caption text-cmv-text-mid">{suffix}</span>
        )}
      </div>

      {/* Un liseré rouge seul laisse croire à une saisie acceptée : rien ne dit ce qui a été refusé
          ni ce qu'on attend. La raison donne ce qui est valide plutôt qu'un « format invalide ». */}
      {refused == null ? null : (
        <span id={hintId} className="text-cmv-caption text-cmv-error-on">
          {refused}
        </span>
      )}
    </div>
  );
}
