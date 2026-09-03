/**
 * Ce qu'il faut pour répondre à un débrief, et ce qui s'en déduit.
 *
 * La réponse est un **message rattaché** (`Message.sessionFeedbackId`), pas une entité à part —
 * elle hérite ainsi des médias, des non-lus, du push et du throttle sans un octet de plus
 * (tranché en #190).
 *
 * Le fil arrive RÉSOLU et le rafraîchissement arrive en `onSent` : c'est ce qui permet au même
 * contrat de servir les deux bouts de la relation, qui ne résolvent ni le même fil (le coach vise
 * un athlète, l'athlète a son coach) ni le même cache (la boîte de réception du coach, le débrief
 * de l'athlète). Les faire deviner obligerait à connaître les deux capacités là où on écrit.
 *
 * Ce module vit dans `@cmv/shared` parce que les deux apps le tenaient à l'identique : le web et
 * le mobile n'ont pas la même barre d'envoi — sélection de galerie contre input fichier,
 * enregistreur natif contre `MediaRecorder` — mais ils répondent à la même question, et une copie
 * de chaque côté les aurait fait diverger au premier cas ajouté.
 */

/** La cible d'une réponse, et le fil où elle part. */
export type FeedbackReplyTarget = {
  /** `null` tant que le débrief n'est pas chargé : on ne rattache pas à un id qu'on n'a pas. */
  feedbackId: string | null;
  /** Le fil DÉJÀ résolu par la surface qui répond. `undefined` tant qu'il ne l'est pas. */
  conversationId: string | undefined;
};

/** Ce que la surface fournit en plus de la cible : l'état du fil, et quoi recharger après envoi. */
export type FeedbackReplyInput = FeedbackReplyTarget & {
  isThreadError: boolean;
  onSent: () => void;
};

/** Le rattachement à poser sur le message. `undefined` = rien à citer, donc rien à rattacher. */
export type FeedbackReplyAttachment = { sessionFeedbackId: string } | undefined;

/**
 * Le rattachement à poser sur le message envoyé.
 *
 * `undefined` et non `{ sessionFeedbackId: null }` : il se répand tel quel dans l'entrée d'envoi,
 * où une clé posée à `null` dirait « détache », pas « ne touche à rien ».
 */
export function feedbackReplyAttachment(feedbackId: string | null): FeedbackReplyAttachment {
  return feedbackId == null ? undefined : { sessionFeedbackId: feedbackId };
}

/**
 * Ce que les deux apps DÉCIDENT à l'identique : peut-on écrire, le fil est-il en panne, et l'envoi
 * de texte.
 *
 * `ready` exige les DEUX : sans débrief on ne sait pas quoi citer, sans fil la réponse n'aboutit
 * nulle part. Un seul des deux suffirait à laisser écrire un texte que l'envoi perdrait.
 *
 * **`mediaBusy` et `step` ne sont volontairement PAS ici**, alors que les deux apps les rendent
 * mot pour mot pareil. Deux raisons. La première est de cohésion : ce sont des clés MÉDIA, et les
 * grouper avec `sendFiles`/`progress` d'un côté, `pickAndSend`/`audioError` de l'autre, garde la
 * surface média d'une app en un seul endroit. La seconde est mesurée : les faire passer par ici
 * oblige à nommer l'envoi de texte en variable locale, ce qui allonge l'assemblage identique des
 * deux hooks de 9 à 12 lignes — au-dessus du seuil de duplication de dix. On échangerait deux
 * lignes de recopie contre trois de plus.
 */
export function feedbackReplySurface(
  input: FeedbackReplyInput,
  sending: boolean,
  sendText: (content: string) => void,
): { ready: boolean; hasThreadError: boolean; sending: boolean; sendText: (c: string) => void } {
  return {
    ready: input.feedbackId != null && input.conversationId != null,
    /** La résolution du fil a échoué — distinct d'un échec d'envoi, et il faut le dire aussi. */
    hasThreadError: input.isThreadError,
    sending,
    sendText,
  };
}
