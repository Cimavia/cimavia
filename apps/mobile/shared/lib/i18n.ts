import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import fr from "../locale/fr.json";

// Langue de l'appareil détectée ; FR par défaut (seule ressource en P1). EN = en.json en P7.
const deviceLanguage = getLocales()[0]?.languageCode ?? "fr";

i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr } },
  lng: deviceLanguage === "en" ? "en" : "fr",
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
});

export default i18n;
