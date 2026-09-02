import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, type RenderResult, render, within } from "@testing-library/react";
import { createInstance, type i18n } from "i18next";
import type { ReactElement, ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

/**
 * L'instance i18next des tests : elle rend la CLÉ, jamais le français. Même raisonnement — et même
 * mode `cimode` — que `apps/web/test/i18n.ts` (#188) : un test écrit sur le texte rendu casserait
 * au premier reformulage du catalogue, un rouge sans qu'aucune régression n'ait eu lieu.
 *
 * Volontairement SANS `.use(initReactI18next)`, contrairement à `shared/lib/i18n.ts` : ce greffon
 * pose l'instance en défaut GLOBAL de react-i18next, où elle survivrait au fichier qui l'a créée.
 * Elle passe donc par `I18nextProvider`, qui la porte par le contexte et meurt avec le rendu.
 *
 * Limite connue de `cimode`, la même qu'au web : les paramètres d'interpolation sont PERDUS.
 * `t("x", { count: 3 })` rend `x`. Un décompte ne s'affirme donc pas sur sa mise en forme mais sur
 * ce qui le gouverne — un bouton fermé, une ligne absente.
 */
function createTestI18n(): i18n {
  const instance = createInstance();
  instance.init({
    lng: "cimode",
    fallbackLng: "cimode",
    resources: { cimode: { translation: {} } },
    interpolation: { escapeValue: false },
    // Sans ça, `cimode` préfixe la clé de son namespace (`translation:feedback.media.addMedia`).
    appendNamespaceToCIMode: false,
  });
  return instance;
}

type RenderRn = RenderResult & { queryClient: QueryClient };

/**
 * Monte un composant React Native dans les fournisseurs que `app/_layout.tsx` pose à la racine.
 *
 * L'arbre rendu est du DOM : `react-native` est aliasé vers `react-native-web` (cf.
 * `vitest.config.ts`), donc `View`, `Text` et `Pressable` sont les vrais composants et Testing
 * Library les interroge comme n'importe quelle page.
 *
 * `retry: false` n'est pas un confort : avec la politique par défaut, une requête qui échoue est
 * rejouée trois fois avec un délai croissant, et le test qui vérifie l'ERREUR expire avant de la
 * voir. `gcTime: 0` isole les fichiers : un cache qui survit ferait passer un test parce que le
 * précédent avait chargé la donnée — le pire des verts.
 */
export function renderRn(ui: ReactElement): RenderRn {
  const i18n = createTestI18n();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const result = render(ui, {
    wrapper: ({ children }: Readonly<{ children: ReactNode }>) => (
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </I18nextProvider>
    ),
  });

  return { ...result, queryClient };
}

/**
 * Presse une cible tactile — `Pressable`, et donc `CmvButton`.
 *
 * `fireEvent.click` et non `pointerDown`/`pointerUp` ni `mouseDown`/`mouseUp` : vérifié à la mise
 * au point du harnais, seul le `click` traverse le système de responder de `react-native-web`. Les
 * deux autres paires ne déclenchent RIEN, silencieusement — un test qui les emploie affirme sur un
 * geste qui n'a jamais eu lieu.
 */
export function press(element: Element): void {
  fireEvent.click(element);
}

/**
 * Presse le bouton portant ce libellé.
 *
 * L'index `[0]` n'est pas un tâtonnement : un `CmvButton` rend un `Pressable` qui CONTIENT son
 * `Text`, si bien que les deux nœuds ont le même `textContent` et que Testing Library les remonte
 * tous les deux, ancêtre d'abord. Presser le `Text` ne déclencherait rien — c'est le `Pressable`
 * qui porte le handler. Le jour où `CmvButton` déclarera `accessibilityRole="button"`, cette
 * fonction devient `getByRole("button", { name })` et l'index disparaît.
 */
export function pressButton(container: HTMLElement, label: string): void {
  // `getAllByText` lève quand la liste est vide, donc l'élément 0 existe forcément ici — ce que
  // `noUncheckedIndexedAccess` ne peut pas déduire.
  const [pressable] = within(container).getAllByText(label) as [HTMLElement, ...HTMLElement[]];
  press(pressable);
}
