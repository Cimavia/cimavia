import {
  CAPABILITY_NAMES,
  type Capabilities,
  type CapabilityName,
  hasCapability,
  type TrainingCapability,
} from "../capability";

/** Les avertissements à montrer avant de supprimer un compte, un par capacité concernée. */
export type ErasureNotices = {
  gone: readonly CapabilityName[];
  kept: readonly TrainingCapability[];
};

/**
 * Ce qu'annonce l'écran de suppression (#256), selon ce que le compte exerce : un compte à double
 * capacité lit les deux côtés, puisque l'effacement les emporte tous les deux.
 *
 * L'Entreprise n'a rien dans `kept` : elle n'émet pas de facture et ne possède pas d'exercice.
 */
export function erasureNotices(capabilities: Capabilities): ErasureNotices {
  const gone = CAPABILITY_NAMES.filter((name) => hasCapability(capabilities, name));
  return { gone, kept: gone.filter((name) => name !== "company") };
}
