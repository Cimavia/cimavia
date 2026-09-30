import { coachFeedbackKeys, messageKeys, myFeedbackKeys, myPlanKeys } from "@cmv/shared";
import { focusManager, onlineManager, QueryClient, useQueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { NetworkState } from "expo-network";
import { AppState, type AppStateStatus } from "react-native";
import { afterAll, describe, expect, it, vi } from "vitest";
import { storedItems } from "@/test/setup";

// `expo-network` est natif : le module de production s'y abonne au CHARGEMENT, donc l'import
// ci-dessous l'atteindrait avant même le premier test.
const { networkListeners } = vi.hoisted(() => ({
  networkListeners: [] as ((state: NetworkState) => void)[],
}));
vi.mock("expo-network", () => ({
  addNetworkStateListener: (listener: (state: NetworkState) => void) => {
    networkListeners.push(listener);
    return { remove: vi.fn() };
  },
}));

const addAppStateListener = vi.spyOn(AppState, "addEventListener");

const { QueryProvider, invalidateSignedMediaQueries, resetQueryCache } = await import(
  "@/shared/lib/query"
);

// Relevé AU CHARGEMENT, où le module s'abonne : le harnais remet les doubles à zéro avant chaque test.
const appStateListener = addAppStateListener.mock.calls[0]?.[1] as
  | ((status: AppStateStatus) => void)
  | undefined;

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

describe("invalidateSignedMediaQueries", () => {
  /**
   * #304 : restaurées du disque, ces requêtes mentent sur l'âge de leurs URLs — une URL gardée peut
   * avoir 4 min 30 de plus que la réponse qui la porte, et la table qui le savait est repartie
   * vide. Elles doivent se recharger à l'ouverture de leur écran, même « fraîches ».
   */
  it("périme le fil et les deux lectures du débrief", async () => {
    const client = new QueryClient();
    const signed = [
      messageKeys.thread("c1", null),
      myFeedbackKeys.detail("s1"),
      coachFeedbackKeys.bySession("s1"),
    ];
    for (const key of signed) client.setQueryData(key, []);

    await invalidateSignedMediaQueries(client);

    for (const key of signed) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });

  // Les autres disent vrai sur leur fraîcheur : les recharger toutes à chaque démarrage à froid
  // ferait payer à l'athlète en salle ce qu'aucune URL ne justifie.
  it("ne touche pas aux requêtes sans média signé", async () => {
    const client = new QueryClient();
    client.setQueryData(myPlanKeys.visible(), []);

    await invalidateSignedMediaQueries(client);

    expect(client.getQueryState(myPlanKeys.visible())?.isInvalidated).toBe(false);
  });
});

/**
 * Les deux ponts app ↔ TanStack Query. Sans eux, rien ne déclenche de refetch en React Native : le
 * cache persisté resservait un cycle supprimé la veille, sans le moindre signe de péremption.
 */
describe("ponts de premier plan et de réseau", () => {
  afterAll(() => {
    appStateListener?.("active");
    networkListeners[0]?.({ isConnected: true, isInternetReachable: true });
  });

  it("suit le premier plan de l'app", () => {
    if (appStateListener == null) throw new Error("aucun écouteur d'AppState posé au chargement");

    appStateListener("background");
    expect(focusManager.isFocused()).toBe(false);

    appStateListener("active");
    expect(focusManager.isFocused()).toBe(true);
  });

  /**
   * « Je ne sais pas » n'est pas « hors ligne » : déclarer l'app hors ligne pendant la sonde
   * bloquerait des requêtes qui passeraient.
   */
  it.each<[string, NetworkState, boolean]>([
    ["injoignable", { isConnected: true, isInternetReachable: false }, false],
    // Champ ABSENT tant que la sonde n'a pas abouti.
    ["indéterminé", { isConnected: true }, true],
    ["joignable", { isConnected: true, isInternetReachable: true }, true],
  ])("internet %s : en ligne = %s", (_, state, online) => {
    const listener = networkListeners[0];
    if (listener == null) throw new Error("aucun écouteur réseau posé au chargement");

    listener(state);

    expect(onlineManager.isOnline()).toBe(online);
  });
});
