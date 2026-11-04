import { z } from "zod";

/**
 * Un identifiant que le CLIENT tire et que la base garde tel quel : la clé d'un exercice de bloc, celle
 * de son remplaçant, l'`id` d'une colonne ou d'une ligne de grille. Les clients tirent des UUID (36
 * caractères), la reprise en blocs aussi (`gen_random_uuid()`) ; 64 laisse de la marge sans laisser
 * passer une clé de 900 Ko, réémise à chaque lecture de la séance (#354).
 *
 * Les identifiants du SERVEUR (`exerciseId`, l'`id` d'un bloc) n'en ont pas besoin : une valeur
 * inconnue échoue à la recherche, elle n'est jamais écrite.
 */
export const CLIENT_KEY_MAX_LENGTH = 64;
export const clientKeySchema = z.string().min(1).max(CLIENT_KEY_MAX_LENGTH);
