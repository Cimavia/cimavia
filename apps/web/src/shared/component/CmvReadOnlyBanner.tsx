type CmvReadOnlyBannerProps = {
  /** Pourquoi rien ne se modifie : « Lecture seule : exercice de M. Tu peux l'utiliser… » */
  message: string;
};

/**
 * Le bandeau d'un élément ouvert en lecture (#606, maquette #597, frame 12) : dit d'emblée
 * pourquoi rien ne se modifie, plutôt que de laisser le Coach le découvrir champ après champ.
 * `note` et non `status` : présent dès l'ouverture, il se lit avec la page, il ne s'annonce pas.
 */
export function CmvReadOnlyBanner({ message }: Readonly<CmvReadOnlyBannerProps>) {
  return (
    <p
      role="note"
      className="rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm text-cmv-caption text-cmv-text-mid"
    >
      {message}
    </p>
  );
}
