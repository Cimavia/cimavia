/**
 * La Lecture d'un formulaire, par le CSS (#606). Le formulaire est un `fieldset` qui porte
 * `CMV_EDIT.group` : désactivé, il fige déjà chaque champ et chaque bouton, et ce qui ne sert qu'à
 * éditer — ajouter, retirer, déplacer — n'a plus qu'à disparaître. Rien à faire descendre de
 * composant en composant : chacun marque ses commandes, le `fieldset` décide.
 *
 * Un groupe NOMMÉ : un `group` anonyme d'un composant intérieur répondrait à la place du formulaire.
 *
 * La frontière : ce qui doit rester cliquable en Lecture vit HORS du `fieldset` et suit encore le
 * `readOnly` de l'écran — l'en-tête d'une carte de composition, qui se déplie pour qu'on la lise.
 */
export const CMV_EDIT = {
  /**
   * Le formulaire. En Lecture, les textes d'aide des champs vides se taisent : ils invitent à
   * saisir ce qui ne se saisit pas.
   */
  group: "group/edit [&:disabled_::placeholder]:text-transparent",
  /** Ce qui ne sert qu'à éditer : masqué quand le formulaire est en Lecture. */
  only: "group-disabled/edit:hidden",
  /** Un champ vide : masqué en Lecture, où son texte d'aide inviterait à le remplir. */
  emptyField: "group-disabled/edit:placeholder-shown:hidden",
  /** Ce qui ne se dit qu'en Lecture, à la place de ce qui est masqué. */
  readOnly: "hidden group-disabled/edit:block",
} as const;
