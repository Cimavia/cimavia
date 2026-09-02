import { MediaType } from "../dto/feedback.schema";

/**
 * La FAMILLE d'un média, lue sur son type MIME — photo, vidéo ou note vocale.
 *
 * À ne pas confondre avec `isAllowedFeedbackImageMime` & co, qui disent si un format précis est
 * ACCEPTÉ. Cette fonction-ci répond à une autre question, posée plus tôt : sur quel quota ce
 * fichier va-t-il compter, et par quelle préparation doit-il passer ? Un `image/heic` a bien la
 * famille IMAGE — il consomme une place de photo — même s'il sera refusé au format ensuite.
 *
 * Les deux ne peuvent pas être confondues sans conséquence : classer avec la liste blanche ferait
 * qu'un format non géré ne consommerait aucune place, mais serait aussi préparé comme un type
 * qu'il n'est pas.
 *
 * `null` = « je ne sais pas », et jamais un type par défaut (règle nullable) : au rendu de refuser
 * le fichier avec sa vraie raison plutôt que de l'imputer à un quota au hasard.
 */
export function mediaKindOfMime(mimeType: string | null | undefined): MediaType | null {
  if (mimeType == null) return null;
  if (mimeType.startsWith("image/")) return MediaType.IMAGE;
  if (mimeType.startsWith("video/")) return MediaType.VIDEO;
  if (mimeType.startsWith("audio/")) return MediaType.AUDIO;
  return null;
}
