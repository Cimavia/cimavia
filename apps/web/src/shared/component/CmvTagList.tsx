import { CmvBadge } from "./CmvBadge";

type CmvTagListProps = {
  tags: readonly string[];
  /** Cinq surfaces affichent les mêmes tags ; seule la carte de bibliothèque les met en avant. */
  variant?: "neutral" | "accent";
};

/**
 * La liste de tags d'un exercice. Un composant plutôt qu'un `map` recopié : la carte, le sélecteur,
 * les deux éditeurs de composition et la lecture athlète affichent exactement la même chose, et
 * Sonar mesure la duplication sur les trois couches.
 *
 * Un exercice sans tag ne rend RIEN — pas de pastille « aucun tag », qui serait du bruit sur une
 * absence légitime.
 */
export function CmvTagList({ tags, variant = "neutral" }: Readonly<CmvTagListProps>) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-cmv-xs">
      {tags.map((tag) => (
        <CmvBadge key={tag} variant={variant}>
          {tag}
        </CmvBadge>
      ))}
    </div>
  );
}
