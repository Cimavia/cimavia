import {
  DocumentUsage,
  type ExerciseDocumentDto,
  RichBlockType,
  type RichDocument,
} from "@cmv/shared";
import type { ResolveImage } from "@/shared/component";
import { localDocumentUri } from "@/shared/lib/document-cache";

/**
 * Où lire chaque image de la consigne d'un exercice de séance.
 *
 * Le document ne stocke qu'un `mediaId` (règle dure n°7) : l'URL est signée et expire, la graver
 * ferait afficher des images mortes trois mois plus tard. On la retrouve à chaque lecture parmi
 * les documents d'usage INSTRUCTION — une pièce jointe n'est pas une image de consigne.
 *
 * Le FICHIER LOCAL passe devant quand il est là (#95) : il ne périme pas, ne demande pas de
 * réseau, et évite l'aller-retour au storage même en ligne. L'URL signée reste le repli — elle
 * seule existe tant que la passe de téléchargement n'a pas eu lieu.
 *
 * Les URIs se lisent UNE fois, à la construction, et seulement pour les images que la consigne
 * CITE : `localDocumentUri` interroge le disque, un document que les blocs ne référencent pas n'a
 * rien à faire lire, et une image ne relit pas le disque à chaque changement d'état de son
 * chargement. L'écran construit le résolveur à l'ouverture de la consigne.
 */
export function instructionImageResolver(
  planId: string,
  instructions: RichDocument | null,
  documents: readonly ExerciseDocumentDto[],
): ResolveImage {
  const cited = new Set(
    (instructions ?? []).flatMap((block) =>
      block.type === RichBlockType.IMAGE ? [block.mediaId] : [],
    ),
  );
  const uriById = new Map(
    documents
      .filter((document) => document.usage === DocumentUsage.INSTRUCTION && cited.has(document.id))
      .map((document) => [document.id, localDocumentUri(planId, document) ?? document.url]),
  );
  return (mediaId) => uriById.get(mediaId) ?? null;
}
