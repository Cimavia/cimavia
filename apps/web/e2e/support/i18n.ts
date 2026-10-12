import { createInstance } from "i18next";
import fr from "../../src/shared/locale/fr.json" with { type: "json" };

/**
 * Le traducteur des parcours : le VRAI catalogue, là où les tests de rendu rendent la clé
 * (`test/i18n.ts`). Le navigateur affiche du français, et un sélecteur se cherche dans ce qu'il
 * affiche. Le passer par sa clé garde le test vert quand une formulation change, et le fait
 * échouer quand la clé disparaît — ce que la même phrase écrite en dur ferait à l'envers.
 */
const i18n = createInstance();
void i18n.init({
  resources: { fr: { translation: fr } },
  lng: "fr",
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
  initAsync: false,
});

export const t = i18n.t.bind(i18n);
