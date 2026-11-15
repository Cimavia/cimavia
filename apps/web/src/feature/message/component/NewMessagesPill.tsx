import { useTranslation } from "react-i18next";
import { IoArrowDown } from "react-icons/io5";

type NewMessagesPillProps = {
  /** Les entrants que le lecteur n'a pas vus ; `null` ou `0`, la pastille se tait. */
  count: number | null;
  onClick: () => void;
};

/**
 * Ce qu'un lecteur parti remonter l'historique ne verrait pas sans elle : des messages arrivés au
 * bas du fil, qui ne l'y ramène plus d'office (#367). Un clic l'y conduit.
 *
 * La région `aria-live` est TOUJOURS montée, la pastille seule va et vient : une région qui naît
 * avec son contenu n'est pas annoncée. Elle laisse passer le clic hors de la pastille.
 */
export function NewMessagesPill({ count, onClick }: Readonly<NewMessagesPillProps>) {
  const { t } = useTranslation();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 bottom-cmv-md flex justify-center"
    >
      {count != null && count > 0 ? (
        <button
          type="button"
          onClick={onClick}
          className="pointer-events-auto flex items-center gap-cmv-xs rounded-full border border-cmv-border bg-cmv-surface-hi px-cmv-md py-cmv-xs text-cmv-caption text-cmv-text-hi shadow-lg transition-colors hover:border-cmv-border-hi"
        >
          <IoArrowDown aria-hidden />
          {t("messages.newMessages", { count })}
        </button>
      ) : null}
    </div>
  );
}
