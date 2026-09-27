import type { CapabilityName } from "@cmv/shared";
import { QueryClient } from "@tanstack/react-query";
import {
  type AnyRoute,
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { routeTree } from "@/routeTree.gen";
import { CmvRoleGate } from "@/shared/component";
import { NAV_ITEMS, spaceOfPath } from "@/shared/lib/nav";

/**
 * La table des gardes, lue dans l'arbre de routes RÉEL — celui que le générateur produit et que
 * `main.tsx` monte.
 *
 * Ce qu'aucune autre porte ne voit (#338) : une route livrée sans `CmvRoleGate`, ou avec la
 * capacité de l'autre rôle. `tsc` l'accepte, Biome aussi, et l'écran s'ouvre à qui n'y a pas droit.
 * C'est la mécanique de Q-1, et ce que #20 a trouvé côté mobile : des routes sans AUCUNE garde.
 *
 * La garde est remplacée par un espion qui ne rend RIEN : on lit la capacité qu'elle reçoit, et
 * aucun écran n'est monté — donc aucune requête, aucun fournisseur à poser. Une route non gardée,
 * elle, monte son écran pour de vrai ; il échoue dans la frontière d'erreur du routeur, l'espion
 * n'a rien reçu, et c'est ce vide que le test rapporte.
 */
vi.mock("@/shared/component", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/component")>()),
  CmvRoleGate: vi.fn(() => null),
}));
vi.mock("@/shared/hook/useSentryUser", () => ({ useSentryUser: vi.fn() }));

const BOTH: readonly CapabilityName[] = ["athlete", "coach"];

/**
 * Les routes volontairement SANS garde, chacune avec sa raison. Toute route absente d'ici doit
 * être gardée, par elle-même ou par un layout parent.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  __root__: "la racine enveloppe tout, écrans d'authentification compris",
  "/login": "on y arrive précisément sans session",
  "/register": "idem — et seule une inscription invitée passe l'API (#263)",
  "/forgot-password": "idem",
  "/reset-password": "idem : le jeton du lien fait office d'accès",
  "/athletes": "redirection pure vers `/` (#113), qui porte la garde — aucun écran monté",
};

function routerAt(url: string) {
  return createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [url] }),
  });
}

const routes: readonly AnyRoute[] = Object.values(routerAt("/").routesById);
const guarded = routes.filter((route) => !(route.id in EXEMPT));

/** `/sessions/$sessionId/` → `/sessions/p-1/` : une adresse que le routeur peut ouvrir. */
function urlOf(fullPath: string): string {
  return fullPath.replaceAll(/\$\w+/g, "p-1");
}

/**
 * Les capacités qu'accepte la garde montée à cette adresse — la sienne ou celle d'un layout
 * au-dessus — triées ; `null` si aucune garde n'a été montée.
 */
async function gateAt(url: string): Promise<readonly CapabilityName[] | null> {
  vi.mocked(CmvRoleGate).mockClear();
  const router = routerAt(url);
  // `load()` avant le rendu : sans lui, le premier tour rend un arbre vide, et « aucune garde »
  // serait constaté sans qu'aucune route ait été montée.
  await router.load();
  render(<RouterProvider router={router} />);

  const props = vi.mocked(CmvRoleGate).mock.calls[0]?.[0];
  if (props == null) return null;
  const { capability } = props;
  return (typeof capability === "string" ? [capability] : [...capability]).sort();
}

describe("gardes des routes", () => {
  it("n'exempte aucune route qui n'existe plus", () => {
    // Une exemption morte n'ouvre rien aujourd'hui, mais elle couvrirait en silence la prochaine
    // route créée sous ce chemin.
    const ids = new Set(routes.map((route) => route.id));

    expect(Object.keys(EXEMPT).filter((id) => !ids.has(id))).toEqual([]);
  });

  /**
   * Tranché en #338 : la garde d'une route accepte EXACTEMENT l'espace que `spaceOfPath` donne à
   * son chemin, ou les deux capacités s'il n'appartient à aucun. C'est `spaceOfPath` qui choisit la
   * barre latérale (`useActiveSpace`) : une garde qui la contredit afficherait le menu d'un rôle
   * au-dessus de l'écran de l'autre. Une route ABSENTE de cette table n'a pas de garde du tout.
   */
  it.each(
    guarded.map((route) => [route.fullPath] as const),
  )("%s est gardée pour la capacité de son espace", async (fullPath) => {
    const space = spaceOfPath(fullPath);

    expect(await gateAt(urlOf(fullPath))).toEqual(space == null ? BOTH : [space]);
  });

  // La nav ne propose jamais ce que la route refuse (`nav.ts`) — ni une adresse qui n'existe pas,
  // que le routeur servirait sans garde.
  it.each(
    NAV_ITEMS.map((item) => [item.to, item.capability] as const),
  )("l'entrée de nav %s mène à une route qui accepte %s", async (to, capability) => {
    expect(await gateAt(to)).toContain(capability);
  });
});
