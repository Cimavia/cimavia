import { catalog } from "@cmv/e2e/catalog";
import fr from "../../shared/locale/fr.json" with { type: "json" };

/**
 * Le catalogue du mobile. Les flux Maestro reçoivent leurs libellés de lui, en variables : un flux
 * n'écrit aucun texte en dur.
 */
export const label = catalog("mobile", fr);
