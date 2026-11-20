import { createInstance } from "i18next";
import fr from "../../shared/locale/fr.json" with { type: "json" };

/**
 * Le traducteur des parcours : le VRAI catalogue du mobile, comme sur le web (#627). Les flux
 * Maestro reçoivent leurs libellés de lui, en variables : une reformulation ne casse rien, une clé
 * supprimée fait échouer le parcours — ce que la même phrase écrite dans le YAML ferait à l'envers.
 */
const i18n = createInstance();
void i18n.init({
  resources: { fr: { translation: fr } },
  lng: "fr",
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
  initAsync: false,
});

/**
 * Un libellé du catalogue, qui DOIT exister : i18next rend la clé elle-même quand elle manque, et
 * Maestro chercherait alors à l'écran `auth.login.submit` — un échec qui accuserait l'app.
 */
export function label(key: string, options?: Record<string, unknown>): string {
  if (!i18n.exists(key)) throw new Error(`Clé absente du catalogue mobile : ${key}`);
  return i18n.t(key, options ?? {});
}
