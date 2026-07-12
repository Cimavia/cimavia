import type { ReactNode } from "react";

type CmvEmptyStateProps = {
  title: string;
  description?: string;
  // Action optionnelle (ex. « Nouvel exercice »).
  action?: ReactNode;
};

// État vide d'une liste — évite les écrans blancs (design system : états vide/chargement/erreur).
export function CmvEmptyState({ title, description, action }: CmvEmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-cmv-sm rounded-cmv-lg border border-cmv-border border-dashed bg-cmv-bg-1 p-cmv-2xl text-center">
      <p className="text-cmv-subtitle text-cmv-text-hi">{title}</p>
      {description == null ? null : (
        <p className="max-w-sm text-cmv-caption text-cmv-text-mid">{description}</p>
      )}
      {action}
    </div>
  );
}
