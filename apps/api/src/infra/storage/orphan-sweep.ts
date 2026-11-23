import { isKeyUnder } from "./object-key";
import type { StoredObject } from "./storage.service";

/**
 * Âge sous lequel un objet n'est jamais balayé (#72) : une clé fraîchement écrite dont le
 * rattachement n'est pas encore arrivé ressemble exactement à un orphelin.
 *
 * Sept jours et non les 24 h de l'issue : un envoi se rattache dans l'heure (les URLs de parts
 * durent 1 h, et le mobile ne persiste aucune mutation en attente), donc la marge ne protège de
 * rien qu'on connaisse — mais elle ne coûte qu'une semaine de stockage, et c'est la durée de la
 * règle `AbortIncompleteMultipartUpload` (`deploy/prod/bucket-lifecycle.json`).
 */
export const ORPHAN_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export type ObjectFamily = "exercise" | "feedback" | "invoice" | "conversation";

/**
 * Le préfixe de chaque famille de clés, tel que les services le construisent (`documentKeyPrefix`,
 * `mediaKeyPrefix`, `invoiceDocumentKeyPrefix`, `messageMediaKeyPrefix`).
 *
 * Recopiés et non importés : l'infra n'importe pas les features. Le désaccord ne peut aller que
 * dans le sens sûr — un préfixe changé dans son service rend ses nouvelles clés « inconnues »,
 * signalées et jamais supprimées.
 */
const FAMILY_PREFIXES: readonly (readonly [ObjectFamily, RegExp])[] = [
  ["exercise", /^coach\/[^/]+\/exercises\/[^/]+\//],
  ["feedback", /^athlete\/[^/]+\/feedback\/[^/]+\//],
  ["invoice", /^athlete\/[^/]+\/invoice\/[^/]+\//],
  ["conversation", /^conversation\/[^/]+\//],
];

/**
 * La famille d'une clé que l'API a construite (`buildObjectKey`), ou `null` pour toute autre : un
 * objet déposé à la main, par un autre outil, ou sous une forme que l'API ne produit plus. Le
 * balayage ne supprime jamais ce qu'il ne reconnaît pas.
 */
export function familyOf(key: string): ObjectFamily | null {
  for (const [family, pattern] of FAMILY_PREFIXES) {
    const prefix = pattern.exec(key)?.[0];
    if (prefix != null && isKeyUnder(prefix, key)) return family;
  }
  return null;
}

/** Un objet de l'API, assez ancien pour être balayé s'il n'est plus cité. */
export type SweepCandidate = StoredObject & { family: ObjectFamily };

export type Triage = {
  /** Les clés que le balayage ne reconnaît pas : rapportées, jamais supprimées. */
  unknown: string[];
  /** Les objets trop récents, ou dont le storage tait la date. */
  recent: number;
  candidates: SweepCandidate[];
};

/**
 * Ce qui, dans une page du bucket, mérite qu'on interroge la base. Une date absente ne prouve pas
 * l'ancienneté : l'objet reste.
 */
export function triage(page: readonly StoredObject[], now: Date): Triage {
  const result: Triage = { unknown: [], recent: 0, candidates: [] };
  for (const object of page) {
    const family = familyOf(object.key);
    if (family == null) {
      result.unknown.push(object.key);
    } else if (
      object.lastModified == null ||
      now.getTime() - object.lastModified.getTime() < ORPHAN_GRACE_MS
    ) {
      result.recent += 1;
    } else {
      result.candidates.push({ ...object, family });
    }
  }
  return result;
}

/**
 * Par famille : combien d'orphelins, et ce qu'ils pèsent. Le poids est `null` dès qu'un seul
 * objet tait sa taille — un total partiel se lirait comme exact.
 */
export function summarizeOrphans(
  orphans: readonly SweepCandidate[],
): Partial<Record<ObjectFamily, { count: number; bytes: number | null }>> {
  const summary: Partial<Record<ObjectFamily, { count: number; bytes: number | null }>> = {};
  for (const orphan of orphans) {
    const entry = summary[orphan.family] ?? { count: 0, bytes: 0 };
    entry.count += 1;
    entry.bytes = entry.bytes == null || orphan.size == null ? null : entry.bytes + orphan.size;
    summary[orphan.family] = entry;
  }
  return summary;
}
