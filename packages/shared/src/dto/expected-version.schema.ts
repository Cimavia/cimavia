import { z } from "zod";

/**
 * La version de l'élément sur laquelle la saisie a COMMENCÉ (#440, étendu en #604) : l'API refuse
 * en 409 `STALE_WRITE` une écriture dont l'élément a changé depuis — la dernière sauvegarde
 * n'efface plus l'autre en silence.
 *
 * Requise, et jamais `null` : l'élément existe déjà, il n'y a pas d'upsert (la fiche athlète, qui en
 * a un, garde son `null` = « aucune fiche vue »). Un client qui l'oublierait retomberait dans
 * l'écrasement silencieux que cette garde ferme.
 */
export const expectedVersionSchema = z.iso.datetime();
