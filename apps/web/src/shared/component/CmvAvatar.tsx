import { initialsOf } from "@cmv/shared";

/**
 * Pastille d'identité : la photo de profil si elle existe, ses initiales sinon.
 *
 * L'image passe AVANT les initiales parce qu'elle est plus reconnaissable d'un coup d'œil dans une
 * liste — c'est toute la raison d'être d'un avatar. Les initiales ne sont pas un pis-aller
 * esthétique : elles restent un repère stable et sans requête réseau.
 *
 * Fond NEUTRE pour l'instant, volontairement : colorer une pastille par personne demande une
 * palette décorative que le design system n'a pas (ses familles de couleur sont des ÉTATS —
 * success/warning/error — et les détourner en décoration ferait lire une alerte là où il n'y a
 * qu'un nom). La couleur choisie ou tirée au sort arrive avec l'issue de profil.
 */

// Nom vide → aucune initiale (`initialsOf` rend ""), la pastille reste un rond neutre : c'est
// l'information exacte, là où un « ? » inventerait un signal.
type CmvAvatarProps = {
  name: string;
  /** `null` tant que la photo de profil n'est ni servie ni téléversable (issue de profil). */
  imageUrl?: string | null;
};

export function CmvAvatar({ name, imageUrl = null }: Readonly<CmvAvatarProps>) {
  const base =
    "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-cmv-md bg-cmv-surface-hi";

  if (imageUrl != null) {
    return (
      <span className={base}>
        {/* `alt` vide et `aria-hidden` : le nom est écrit juste à côté, l'annoncer deux fois
            alourdirait la lecture au lecteur d'écran sans rien ajouter. */}
        <img src={imageUrl} alt="" aria-hidden="true" className="size-full object-cover" />
      </span>
    );
  }

  return (
    <span
      className={`${base} font-cmv-display text-cmv-caption text-cmv-text-mid`}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}
