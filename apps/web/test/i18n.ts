import { createInstance, type i18n } from "i18next";

/**
 * L'instance i18next des tests : elle rend la CLÉ, jamais le français.
 *
 * Même raisonnement que `fakeT` (`test/translator.ts`, #58), porté cette fois à un composant
 * monté : on affirme sur `library.builder.custom.title` et pas sur « Nouvelle cotation ». Un test
 * écrit sur le texte rendu casserait au premier reformulage du catalogue — un rouge sans qu'aucune
 * régression n'ait eu lieu, la meilleure façon d'apprendre à ignorer une suite.
 *
 * `cimode` est le mode prévu par i18next pour ça : `t()` renvoie la clé telle quelle, y compris
 * pour une clé absente de `fr.json`. C'est un angle mort assumé — `check:i18n` est ce qui garde
 * l'existence des clés, et le faire garder DEUX FOIS par des tests de composants les rendrait
 * solidaires du catalogue sans rien vérifier de plus.
 *
 * Limite connue, et c'est le prix de `cimode` : les paramètres d'interpolation sont PERDUS —
 * `t("x.y", { count: 3 })` rend `x.y`, là où le `fakeT` de `test/translator.ts` les concatène à la
 * clé. Un décompte affiché uniquement par interpolation n'est donc pas observable dans le texte
 * rendu ; il s'affirme sur ce qui le gouverne — un bouton fermé, un badge absent — plutôt que sur
 * sa mise en forme.
 *
 * Volontairement SANS `.use(initReactI18next)`, contrairement à `src/shared/lib/i18n.ts` : ce
 * greffon pose l'instance en défaut GLOBAL de react-i18next. Elle survivrait alors au fichier de
 * test qui l'a créée, et la langue réglée par l'un décrirait l'écran d'un autre. L'instance passe
 * donc par `I18nextProvider` (cf. `test/render.tsx`), qui la porte par le contexte React et meurt
 * avec le rendu.
 */
export function createTestI18n(): i18n {
  const instance = createInstance();
  instance.init({
    lng: "cimode",
    fallbackLng: "cimode",
    resources: { cimode: { translation: {} } },
    interpolation: { escapeValue: false },
    // Sans ça, `cimode` préfixe la clé de son namespace (`translation:common.save`) et toutes les
    // assertions porteraient un préfixe qui n'apprend rien.
    appendNamespaceToCIMode: false,
  });
  return instance;
}
