import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { storedItems } from "@/test/setup";

// `expo-network` est natif : le module de production s'y abonne au CHARGEMENT, donc l'import
// ci-dessous l'atteindrait avant même le premier test.
vi.mock("expo-network", () => ({
  addNetworkStateListener: () => ({ remove: vi.fn() }),
}));

const { QueryProvider, resetQueryCache } = await import("@/shared/lib/query");

const PERSIST_KEY = "cimavia-query-cache";

/**
 * Le client tel que l'application le voit — récupéré par le PROVIDER et non importé du module.
 *
 * C'est ce qui donne sa valeur au test : il prouve que `resetQueryCache` vide *le client que les
 * écrans utilisent*. Importer une instance exportée exprès pour le test laisserait passer
 * exactement le défaut qu'on craint — deux clients, dont un seul est nettoyé.
 */
function mountedClient(): QueryClient {
  let client: QueryClient | null = null;
  function Probe() {
    client = useQueryClient();
    return null;
  }
  render(
    <QueryProvider>
      <Probe />
    </QueryProvider>,
  );
  if (client == null) throw new Error("Le provider n'a pas fourni de QueryClient");
  return client;
}

describe("resetQueryCache", () => {
  /**
   * La fuite que ça ferme : le cache est persisté SEPT JOURS et frais cinq minutes, donc le compte
   * suivant sur le même appareil se voyait servir les athlètes, débriefs et factures du précédent
   * — sans même qu'un refetch parte les corriger.
   */
  it("vide le client du provider ET l'entrée disque", async () => {
    const client = mountedClient();
    client.setQueryData(["athletes", "list"], [{ athleteName: "Léa Moreau" }]);
    storedItems.set(PERSIST_KEY, '{"clientState":{"queries":[]}}');

    await resetQueryCache();

    expect(client.getQueryData(["athletes", "list"])).toBeUndefined();
    expect(storedItems.has(PERSIST_KEY)).toBe(false);
  });

  // Vider la mémoire seule laisserait l'entrée disque être relue au prochain démarrage : le cache
  // reviendrait tout seul, et la fuite avec lui.
  it("n'efface que la clé du persister", async () => {
    storedItems.set(PERSIST_KEY, "peu importe");
    storedItems.set("autre-cle", "à ne pas toucher");

    await resetQueryCache();

    expect(storedItems.has(PERSIST_KEY)).toBe(false);
    expect(storedItems.get("autre-cle")).toBe("à ne pas toucher");
  });

  it("ne se plaint pas quand il n'y a rien à effacer", async () => {
    await expect(resetQueryCache()).resolves.toBeUndefined();
  });
});
