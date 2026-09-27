import { randomUUID } from "node:crypto";
import { ForbiddenException } from "@nestjs/common";

// Ce qui suit le préfixe dans une clé que NOUS avons construite : un UUID, un tiret, puis le nom
// de fichier assaini — et rien d'autre, surtout pas de `/`.
const KEY_SUFFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[\w.-]+$/;

/**
 * Clé objet d'un fichier envoyé par le client : `<prefix><uuid>-<nom assaini>`. Le préfixe porte
 * la segmentation propre à chaque domaine (athlète, séance, fil, exercice…) et se termine par `/` ;
 * l'UUID évite les collisions de noms, et le nom ne garde que des caractères sûrs.
 *
 * Construction et vérification (`assertKeyUnder`) vivent ICI ensemble : si l'une changeait de forme
 * sans l'autre, la garde deviendrait passante — ou bloquante — sans que rien d'autre n'échoue.
 */
export function buildObjectKey(prefix: string, fileName: string): string {
  const safeName = fileName.replace(/[^\w.-]+/g, "_");
  return `${prefix}${randomUUID()}-${safeName}`;
}

/**
 * Une clé objet venue du CLIENT doit être une clé que `buildObjectKey` aurait produite sous ce
 * préfixe — lequel est toujours recalculé côté serveur, jamais lu dans la requête. Le tenancy
 * guard protège la base, pas le storage : sans cette garde, un rattachement enregistrerait la clé
 * d'un autre tenant, dont il pourrait ensuite lire ou supprimer l'objet (#293).
 *
 * `startsWith` seul ne suffirait pas : `<prefix>../../ailleurs` commence bien par le préfixe. On
 * exige donc la forme EXACTE du suffixe, qui exclut tout `/`.
 */
export function assertKeyUnder(prefix: string, key: string): void {
  if (!key.startsWith(prefix) || !KEY_SUFFIX.test(key.slice(prefix.length))) {
    throw new ForbiddenException("Ce chemin de storage n'appartient pas à ce périmètre");
  }
}
