import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Sous `react-native-web`, le plugin se croit dans un navigateur et ne touche pas au stockage.
vi.mock("react-native", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-native")>()),
  Platform: { OS: "ios", select: () => undefined },
}));

const COOKIE_KEY = "cimavia_cookie";
const SESSION_KEY = "cimavia_session_data";

const stored = new Map<string, string>();
const storage = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => {
    stored.set(key, value);
  },
  getItemAsync: async (key: string) => stored.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    stored.set(key, value);
  },
};

function clientWith(customFetchImpl: () => Promise<Response>) {
  return createAuthClient({
    baseURL: "https://api.cimavia.test",
    plugins: [expoClient({ scheme: "cimavia-test", storagePrefix: "cimavia", storage })],
    fetchOptions: { customFetchImpl },
  });
}

beforeEach(() => {
  stored.clear();
  stored.set(COOKIE_KEY, JSON.stringify({ "better-auth.session_token": { value: "mort" } }));
  stored.set(SESSION_KEY, JSON.stringify({ user: { id: "parti" }, session: { id: "s" } }));
});

/**
 * Ce sur quoi repose l'après-suppression (#796) : le plugin Expo vide le stockage AVANT d'appeler le
 * réseau, et n'expose aucune autre façon de le faire. Une montée de Better Auth qui inverserait les
 * deux laisserait le cookie d'un compte supprimé sur le téléphone.
 */
describe("signOut du plugin Expo", () => {
  it("vide le cookie et la session même sans réseau", async () => {
    const client = clientWith(() => Promise.reject(new TypeError("Network request failed")));

    await client.signOut().catch(() => undefined);

    expect(stored.get(COOKIE_KEY)).toBe("{}");
    expect(stored.get(SESSION_KEY)).toBe("{}");
    expect(await client.getCookie()).toBe("");
  });

  it("vide le cookie et la session quand l'API refuse", async () => {
    const client = clientWith(async () => new Response("{}", { status: 401 }));

    await client.signOut();

    expect(stored.get(COOKIE_KEY)).toBe("{}");
    expect(stored.get(SESSION_KEY)).toBe("{}");
  });
});
