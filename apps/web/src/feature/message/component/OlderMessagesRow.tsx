import { useTranslation } from "react-i18next";
import type { OlderMessages } from "@/feature/message/hook/useOlderMessages";
import { CmvButton } from "@/shared/component/CmvButton";

/**
 * La tête du fil (#77) : le repère qui fait charger la page d'avant quand le lecteur y arrive, et
 * ce qu'il en est — rien tant que tout va bien, une ligne pendant le chargement, une ligne et un
 * bouton quand il a échoué. Pas de maquette : les tokens de légende du fil.
 *
 * La région `<output>` (rôle `status`) est TOUJOURS montée, comme celle de la pastille : une
 * région qui naît avec son contenu n'est pas annoncée.
 */
export function OlderMessagesRow({ older }: Readonly<{ older: OlderMessages }>) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-cmv-xs">
      <div ref={older.sentinelRef} aria-hidden className="h-px w-full" />
      <output className="block text-cmv-caption text-cmv-text-mid">
        {older.loading ? t("messages.older.loading") : null}
        {older.failed && !older.loading ? t("messages.older.error") : null}
      </output>
      {older.failed && !older.loading ? (
        <CmvButton variant="secondary" onClick={older.retry}>
          {t("common.retry")}
        </CmvButton>
      ) : null}
    </div>
  );
}
