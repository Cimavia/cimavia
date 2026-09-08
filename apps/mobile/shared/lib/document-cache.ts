import { DocumentType, type ExerciseDocumentDto } from "@cmv/shared";
import { Directory, File, Paths } from "expo-file-system";

/**
 * Les documents des cycles diffusés, gardés sur l'appareil pour rester lisibles sans réseau (#95).
 *
 * POURQUOI un magasin de fichiers. Le cache de requêtes conserve le déroulé d'une séance, mais les
 * documents n'y sont que des URLs signées cinq minutes : hors réseau elles ne valent rien, et une
 * URL vieille d'une semaine ressortie du cache persisté ne vaut pas davantage. Seul l'octet posé
 * sur le disque survit aux deux.
 *
 * `Paths.document` et NON `Paths.cache` : l'OS vide le cache sous pression mémoire, ce qu'il ferait
 * précisément quand l'athlète en a besoin — en salle, app rouverte après des jours. Le prix assumé
 * est que ces fichiers entrent dans la sauvegarde iCloud de l'appareil.
 *
 * Rangement `<planId>/<documentId>.<ext>` : la purge d'un cycle est alors la suppression d'un
 * répertoire, sans index à tenir à jour — donc sans index à désynchroniser.
 *
 * Tout y est défensif : un magasin de documents est un CONFORT. Un disque plein, un répertoire
 * disparu ou un téléchargement refusé doivent dégrader la lecture vers l'URL signée, jamais faire
 * tomber l'écran.
 */

const ROOT_DIRECTORY_NAME = "plan-documents";

/**
 * L'ÉPOQUE du magasin : incrémentée à chaque purge totale, donc à chaque changement de compte.
 *
 * Une passe de téléchargement dure — quarante séances tirées l'une après l'autre — et rien
 * n'empêchait l'athlète de se déconnecter au milieu. Elle continuait alors sur sa lancée, écrivant
 * les séances du compte QUITTÉ dans un cache que `resetAccountData` venait de vider, et des
 * fichiers dans un magasin qu'il venait d'effacer. C'est la fuite entre comptes que le journal
 * décrit déjà pour le cache de requêtes, réintroduite par la porte de derrière. Comparer l'époque
 * la referme sans que la passe ait à connaître l'authentification.
 */
let generation = 0;

export function storeGeneration(): number {
  return generation;
}

// Bornée et filtrée : `fileName` vient du coach, et sert ici à composer un chemin.
const EXTENSION_PATTERN = /^[a-z0-9]{1,8}$/;

function rootDirectory(): Directory {
  return new Directory(Paths.document, ROOT_DIRECTORY_NAME);
}

function planDirectory(planId: string): Directory {
  return new Directory(rootDirectory(), planId);
}

/**
 * L'extension est reprise du nom d'origine : sans elle, l'application tierce à qui on tend le PDF
 * n'a plus que le type MIME pour deviner ce qu'elle ouvre, et certaines s'y refusent.
 */
function extensionOf(fileName: string | null): string {
  const candidate = fileName?.split(".").pop()?.toLowerCase();
  if (candidate == null || candidate === fileName?.toLowerCase()) return "";
  return EXTENSION_PATTERN.test(candidate) ? `.${candidate}` : "";
}

function documentFile(planId: string, document: ExerciseDocumentDto): File {
  return new File(planDirectory(planId), `${document.id}${extensionOf(document.fileName)}`);
}

/** Un lien externe n'a pas d'octets à nous : il s'ouvre chez son hôte, réseau ou pas. */
function isDownloadable(document: ExerciseDocumentDto): boolean {
  return document.type === DocumentType.FILE;
}

/**
 * Le fichier local d'un document, ou `null` s'il n'est pas sur l'appareil.
 *
 * `null` dit « pas ici », jamais « pas de document » : l'appelant retombe sur l'URL signée quand
 * il a du réseau, et n'annonce l'indisponibilité que lorsqu'il n'en a pas.
 */
export function localDocumentUri(planId: string, document: ExerciseDocumentDto): string | null {
  if (!isDownloadable(document)) return null;
  try {
    const file = documentFile(planId, document);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

/**
 * Descend un document s'il n'est pas déjà là. Rend `true` quand le fichier est présent à la
 * sortie — qu'on vienne de le tirer ou qu'il y fût déjà.
 *
 * L'URL signée expire en cinq minutes : elle doit être FRAÎCHE à l'appel, ce dont l'orchestrateur
 * répond en la lisant juste avant.
 */
export async function cacheDocument(
  planId: string,
  document: ExerciseDocumentDto,
): Promise<boolean> {
  if (!isDownloadable(document)) return false;
  try {
    const file = documentFile(planId, document);
    if (file.exists) return true;

    const directory = planDirectory(planId);
    if (!directory.exists) directory.create({ intermediates: true, idempotent: true });

    await File.downloadFileAsync(document.url, file);
    return true;
  } catch {
    // Réseau coupé en route, disque plein, 403 sur une signature périmée : on réessaiera à la
    // passe suivante. Rien à dire à l'athlète ici — c'est la LECTURE qui saura si ça manque.
    return false;
  }
}

/**
 * Ne garde que les cycles listés et supprime les autres.
 *
 * Une seule opération pour deux bornes de purge : un cycle terminé sort des cycles visibles, une
 * relation rompue les fait tous sortir. Exprimer ce qui RESTE plutôt que ce qui part évite d'avoir
 * à énumérer les causes de disparition — celle qu'on oublierait laisserait des fichiers à vie.
 */
export function purgePlansExcept(keptPlanIds: readonly string[]): void {
  try {
    const root = rootDirectory();
    if (!root.exists) return;

    const kept = new Set(keptPlanIds);
    for (const entry of root.list()) {
      const planId = entry.uri.replace(/\/$/, "").split("/").pop();
      if (planId != null && !kept.has(planId)) entry.delete();
    }
  } catch {
    // Purge ratée = de l'espace disque en trop, pas une donnée fausse. La passe suivante reprendra.
  }
}

/**
 * Efface tout le magasin — appelé au changement de compte.
 *
 * Le raisonnement est celui de `resetQueryCache`, appliqué à des octets plutôt qu'à du JSON :
 * laisser les PDF du coach précédent sur l'appareil du compte suivant serait la même fuite, en
 * plus lisible.
 */
export function purgeAllDocuments(): void {
  // AVANT la suppression : ce qui compte est qu'aucune passe en vol ne se croie plus légitime,
  // même si l'effacement lui-même échoue.
  generation += 1;
  try {
    const root = rootDirectory();
    if (root.exists) root.delete();
  } catch {
    // Idem : rien à rattraper ici, et rien qui vaille de faire échouer une déconnexion.
  }
}
