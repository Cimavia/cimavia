import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import fr from "../locale/fr.json";

// i18n prêt dès le départ (règle dure) : FR par défaut ; EN = ajout d'un en.json en P7.
i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr } },
  lng: "fr",
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
});

export default i18n;
