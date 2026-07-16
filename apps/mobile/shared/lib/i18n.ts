import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import fr from "../locale/fr.json";

/**
 * i18n prêt dès le départ (règle dure) : FR seule ressource en MVP, EN = ajout d'en.json en P7.
 *
 * On force `lng: "fr"` plutôt que de suivre la langue de l'appareil : sans ressource `en`, un
 * téléphone en anglais afficherait des libellés français ET des dates anglaises (les formateurs
 * Intl lisent `i18n.language`). La détection via expo-localization revient avec en.json.
 */
i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr } },
  lng: "fr",
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
});

export default i18n;
