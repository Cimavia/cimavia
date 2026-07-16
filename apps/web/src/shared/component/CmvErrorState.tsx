import { CmvButton } from "./CmvButton";

type CmvErrorStateProps = {
  title: string;
  description: string;
  retryLabel: string;
  onRetry: () => void;
};

/**
 * Échec de CHARGEMENT d'une liste — à ne jamais confondre avec un état vide.
 *
 * « Aucun athlète » et « la requête a échoué » sont deux choses opposées : la première invite à
 * créer, la seconde à réessayer. Les afficher pareil fait croire à l'utilisateur que ses données
 * ont disparu (et masque la panne au développeur).
 */
export function CmvErrorState({
  title,
  description,
  retryLabel,
  onRetry,
}: Readonly<CmvErrorStateProps>) {
  return (
    <div className="flex flex-col items-center gap-cmv-sm rounded-cmv-lg border border-cmv-error bg-cmv-bg-1 p-cmv-2xl text-center">
      <p className="text-cmv-subtitle text-cmv-error">{title}</p>
      <p className="max-w-sm text-cmv-caption text-cmv-text-mid">{description}</p>
      <CmvButton variant="secondary" onClick={onRetry}>
        {retryLabel}
      </CmvButton>
    </div>
  );
}
