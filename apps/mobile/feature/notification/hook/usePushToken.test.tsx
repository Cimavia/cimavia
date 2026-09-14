import { NotificationType, PushPlatform } from "@cmv/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Platform } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revokeCurrentPushToken, usePushToken } from "@/feature/notification/hook/usePushToken";

const { registerMock, revokeMock } = vi.hoisted(() => ({
  registerMock: vi.fn(),
  revokeMock: vi.fn(),
}));

vi.mock("@/feature/notification/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/notification/api")>()),
  registerPushToken: registerMock,
  revokePushToken: revokeMock,
}));

/**
 * `expo-device` est mocké par le harnais avec des VALEURS (`isDevice: true`), qu'aucun test ne peut
 * reprendre. Redéclaré ici derrière un accesseur, seule façon de jouer l'émulateur — le cas que
 * `registerDevice` traite en premier.
 */
const device = vi.hoisted(() => ({ isDevice: true }));
vi.mock("expo-device", () => ({
  get isDevice() {
    return device.isDevice;
  },
  deviceName: "test",
}));

vi.mock("@/shared/lib/auth", () => ({ authClient: { useSession: vi.fn() } }));

const { authClient } = await import("@/shared/lib/auth");

const getPermissions = vi.mocked(Notifications.getPermissionsAsync);
const requestPermissions = vi.mocked(Notifications.requestPermissionsAsync);
const addResponseListener = vi.mocked(Notifications.addNotificationResponseReceivedListener);

const DENIED = { status: "denied", granted: false, canAskAgain: true };

let queryClient: QueryClient;

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function signedInAs(capabilities: Readonly<{ isCoach: boolean; isAthlete: boolean }>) {
  vi.mocked(authClient.useSession).mockReturnValue({
    data: { user: capabilities },
    isPending: false,
  } as ReturnType<typeof authClient.useSession>);
}

/** Rend le hook et attend que l'enregistrement d'appareil, lancé par l'effet, soit retombé. */
async function mountAndSettle() {
  renderHook(() => usePushToken(), { wrapper });
  await waitFor(() => expect(getPermissions).toHaveBeenCalled());
}

beforeEach(() => {
  device.isDevice = true;
  signedInAs({ isCoach: false, isAthlete: true });
  // Le harnais laisse `extra` vide ; sans `projectId`, Expo ne sait pas à quel projet rattacher
  // le token et `resolveExpoPushToken` s'arrête avant de le demander.
  Object.assign(Constants.expoConfig?.extra ?? {}, { eas: { projectId: "projet-de-test" } });
  registerMock.mockResolvedValue({
    id: "pt-1",
    token: "ExponentPushToken[test]",
    platform: PushPlatform.ANDROID,
    installationSecret: null,
  });
  revokeMock.mockResolvedValue(undefined);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

describe("permission de notification", () => {
  /**
   * Le cœur de #134, et le seul écart de cette issue qu'aucun test Android ne pouvait voir : sans
   * `allowAlert`, iOS accorde la permission SANS bannière, et le push part sans que rien ne
   * s'affiche. `timer-alert.ts` porte la même demande — les deux doivent rester jumelles.
   */
  it("demande la bannière, le son et pas de pastille sur ios", async () => {
    getPermissions.mockResolvedValueOnce(DENIED as Awaited<ReturnType<typeof getPermissions>>);

    await mountAndSettle();

    await waitFor(() =>
      expect(requestPermissions).toHaveBeenCalledWith({
        ios: { allowAlert: true, allowSound: true, allowBadge: false },
      }),
    );
  });

  // Redemander une permission déjà accordée est un no-op côté OS, mais l'appel dirait que le code
  // ne lit pas ce qu'il vient d'obtenir.
  it("ne redemande rien quand la permission est déjà accordée", async () => {
    await mountAndSettle();

    await waitFor(() => expect(registerMock).toHaveBeenCalled());
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it("n'enregistre aucun appareil quand la permission est refusée", async () => {
    getPermissions.mockResolvedValueOnce(DENIED as Awaited<ReturnType<typeof getPermissions>>);
    requestPermissions.mockResolvedValueOnce(
      DENIED as Awaited<ReturnType<typeof requestPermissions>>,
    );

    await mountAndSettle();

    await waitFor(() => expect(requestPermissions).toHaveBeenCalled());
    expect(registerMock).not.toHaveBeenCalled();
  });
});

describe("enregistrement de l'appareil", () => {
  // Un émulateur n'a pas de service de notification : lui demander la permission afficherait un
  // refus à chaque démarrage de l'app en développement.
  it("ne demande rien sur un émulateur", async () => {
    device.isDevice = false;

    renderHook(() => usePushToken(), { wrapper });

    await waitFor(() => expect(addResponseListener).toHaveBeenCalled());
    expect(getPermissions).not.toHaveBeenCalled();
  });

  it("s'arrête quand la configuration ne porte pas de projet eas", async () => {
    Object.assign(Constants.expoConfig?.extra ?? {}, { eas: {} });

    await mountAndSettle();

    await waitFor(() => expect(getPermissions).toHaveBeenCalled());
    expect(registerMock).not.toHaveBeenCalled();
  });

  /**
   * `Platform.OS` est une propriété simple de `react-native-web`, qui vaut `web` sous le harnais :
   * la branche iOS ne s'atteint qu'en la posant. Restaurée après chaque test — l'objet est un
   * singleton partagé par tous les fichiers.
   */
  it("annonce la plateforme de l'appareil", async () => {
    Object.assign(Platform, { OS: "ios" });

    await mountAndSettle();

    await waitFor(() =>
      expect(registerMock).toHaveBeenCalledWith(
        expect.objectContaining({ platform: PushPlatform.IOS }),
      ),
    );
  });

  it("joint le secret d'installation déjà rangé", async () => {
    vi.mocked(await import("expo-secure-store")).getItemAsync.mockResolvedValueOnce("secret-connu");

    await mountAndSettle();

    await waitFor(() =>
      expect(registerMock).toHaveBeenCalledWith({
        token: "ExponentPushToken[test]",
        platform: PushPlatform.ANDROID,
        installationSecret: "secret-connu",
      }),
    );
  });

  // Premier lancement : la clé ne doit pas partir à `null`, l'API la refuserait comme une preuve
  // vide au lieu de reconnaître une installation neuve.
  it("omet la clé du secret quand l'appareil n'en a pas encore", async () => {
    await mountAndSettle();

    await waitFor(() =>
      expect(registerMock).toHaveBeenCalledWith({
        token: "ExponentPushToken[test]",
        platform: PushPlatform.ANDROID,
      }),
    );
  });

  it("range le secret que l'api vient d'émettre", async () => {
    const secureStore = vi.mocked(await import("expo-secure-store"));
    registerMock.mockResolvedValue({
      id: "pt-1",
      token: "ExponentPushToken[test]",
      platform: PushPlatform.ANDROID,
      installationSecret: "secret-neuf",
    });

    await mountAndSettle();

    await waitFor(() =>
      expect(secureStore.setItemAsync).toHaveBeenCalledWith(
        "cmv.push.installation-secret",
        "secret-neuf",
      ),
    );
  });

  /**
   * `null` veut dire « garde celui que tu as », jamais « efface-le » : réécrire ici viderait la
   * preuve de possession que l'appareil détient déjà (#90).
   */
  it("n'écrase rien quand l'api ne réémet pas de secret", async () => {
    const secureStore = vi.mocked(await import("expo-secure-store"));

    await mountAndSettle();

    await waitFor(() => expect(registerMock).toHaveBeenCalled());
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
  });

  // Une panne de push ne doit pas remonter dans un écran de planning : le hook avale, l'API trace.
  it("reste silencieux quand l'enregistrement échoue", async () => {
    registerMock.mockRejectedValue(new Error("503"));

    await expect(mountAndSettle()).resolves.toBeUndefined();
  });
});

describe("toucher une notification", () => {
  function touchPush(data: unknown) {
    const handler = addResponseListener.mock.calls[0]?.[0];
    if (handler == null) throw new Error("aucun écouteur de réponse installé");
    handler({ notification: { request: { content: { data } } } } as Parameters<typeof handler>[0]);
  }

  /**
   * Le cache est PERSISTÉ et frais 5 min : arriver par un push sans invalider afficherait la
   * version d'avant l'événement qu'on vient d'annoncer.
   */
  it("mène à la destination annoncée et rafraîchit le cache", async () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await mountAndSettle();

    touchPush({ type: NotificationType.PLAN_PUBLISHED, planId: "plan-1" });

    expect(invalidate).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/planning");
  });

  /**
   * Un cycle diffusé ne mène nulle part pour un coach — le builder est web-only (#20). Le cache se
   * rafraîchit quand même : il s'est bien passé quelque chose, on ne ment pas sur l'endroit.
   */
  it("rafraîchit sans naviguer quand la destination n'existe pas", async () => {
    signedInAs({ isCoach: true, isAthlete: false });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await mountAndSettle();

    touchPush({ type: NotificationType.PLAN_PUBLISHED, planId: "plan-1" });

    expect(invalidate).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("revokeCurrentPushToken", () => {
  // Appelé AVANT `signOut()` : sans ça, le téléphone continue de recevoir les notifications du
  // compte quitté, vers le prochain utilisateur de l'appareil.
  it("révoque le token de cet appareil", async () => {
    await revokeCurrentPushToken();

    expect(revokeMock).toHaveBeenCalledWith("ExponentPushToken[test]");
  });

  // Une déconnexion ne doit jamais échouer pour un push.
  it("n'échoue pas quand la révocation part en erreur", async () => {
    revokeMock.mockRejectedValue(new Error("500"));

    await expect(revokeCurrentPushToken()).resolves.toBeUndefined();
  });

  it("ne révoque rien quand la permission a été retirée", async () => {
    getPermissions.mockResolvedValueOnce(DENIED as Awaited<ReturnType<typeof getPermissions>>);
    requestPermissions.mockResolvedValueOnce(
      DENIED as Awaited<ReturnType<typeof requestPermissions>>,
    );

    await revokeCurrentPushToken();

    expect(revokeMock).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  Object.assign(Platform, { OS: "web" });
});
