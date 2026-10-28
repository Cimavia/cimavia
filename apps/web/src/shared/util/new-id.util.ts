/**
 * Un identifiant neuf, tiré dans le navigateur : bloc, clé d'exercice, colonne ou ligne de grille.
 * Le serveur régénère ceux des blocs ; les autres voyagent tels quels.
 */
export const newId = () => crypto.randomUUID();
