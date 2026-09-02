import type { EffectCallback, ReactNode } from "react";
import { useEffect } from "react";
import { vi } from "vitest";

/**
 * Les modules NATIFS, remplacés pour tous les tests du mobile.
 *
 * Même raisonnement que l'`AsyncStorage` de `setup.ts`, étendu au reste : ces paquets appellent un
 * pont React Native qui n'existe pas dans un worker Node. Un test qui les atteindrait échouerait
 * sur l'absence du pont — un rouge qui ne dit rien du code testé. Ils sont donc coupés ICI, au
 * niveau du harnais, pour qu'aucun test ne PUISSE en dépendre par accident.
 *
 * Le point de passage est `expo-modules-core` : tout module Expo en dérive, et c'est lui qui lit
 * `globalThis.expo`, la poignée JSI que seul le runtime natif pose. Le mocker suffit à faire
 * tomber la chaîne entière — c'est le seul mock du fichier qui soit structurel, les autres ne font
 * que rendre leur module utilisable.
 *
 * Ce qui n'est PAS mocké, et volontairement : `react-native` lui-même. Il est aliasé vers
 * `react-native-web` (cf. `vitest.config.ts`), donc `View`, `Text` et `Pressable` sont les VRAIS
 * composants, avec leur vraie mécanique d'événements. Un mock les aurait remplacés par des coques
 * qui rendent tous les tests verts sans rien éprouver.
 */

/**
 * Ce fichier n'exporte RIEN : un `export` d'une valeur `vi.hoisted` est refusé dans un fichier de
 * `setupFiles`. Un test qui veut interroger un mock importe le module — `import { router } from
 * "expo-router"` lui rend l'objet mocké, `vi.mocked(useLocalSearchParams).mockReturnValue({ … })`
 * lui pose des paramètres d'URL. Le `vi.clearAllMocks()` de `setup.ts` les remet à zéro entre deux
 * tests.
 */

vi.mock("expo-modules-core", () => ({
  EventEmitter: class {},
  NativeModule: class {},
  SharedObject: class {},
  SharedRef: class {},
  NativeModulesProxy: {},
  requireNativeModule: () => ({}),
  requireOptionalNativeModule: () => null,
  CodedError: class extends Error {},
  UnavailabilityError: class extends Error {},
  Platform: { OS: "ios" },
}));

/**
 * L'icône rend un marqueur inerte plutôt qu'un glyphe. Elle reste ATTEIGNABLE par son nom —
 * `container.querySelector('[data-icon="mic-outline"]')` — parce que plusieurs boutons du mobile
 * n'ont que leur icône pour se distinguer.
 */
vi.mock("@expo/vector-icons", () => {
  const Icon = ({ name }: Readonly<{ name: string }>) => <span data-icon={name} />;
  return { Ionicons: Icon, MaterialIcons: Icon, Feather: Icon };
});

vi.mock("expo-router", () => {
  // Défini DANS la fabrique et non au module : un `export` d'une valeur `vi.hoisted` est refusé
  // dans un fichier de `setupFiles`. Un test le récupère en important `router` d'"expo-router",
  // qui lui rend cet objet-ci.
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    navigate: vi.fn(),
    dismissAll: vi.fn(),
    setParams: vi.fn(),
  };
  return {
    router,
    useRouter: () => router,
    useLocalSearchParams: vi.fn(() => ({}) as Record<string, string>),
    usePathname: () => "/",
    // Le vrai déclenche à la prise de focus ; dans un test l'écran monté EST l'écran au premier
    // plan, donc l'exécuter une fois est le comportement fidèle, pas un raccourci.
    useFocusEffect: (callback: EffectCallback) => {
      // biome-ignore lint/correctness/useExhaustiveDependencies: fidèle au vrai hook, qui ne rejoue qu'au changement de focus
      useEffect(callback, []);
    },
    Redirect: ({ href }: Readonly<{ href: string }>) => <span data-redirect={String(href)} />,
    Link: ({ children }: Readonly<{ children: ReactNode }>) => <>{children}</>,
    Stack: Object.assign(({ children }: Readonly<{ children?: ReactNode }>) => <>{children}</>, {
      Screen: () => null,
    }),
    Tabs: Object.assign(({ children }: Readonly<{ children?: ReactNode }>) => <>{children}</>, {
      Screen: () => null,
    }),
  };
});

vi.mock("expo-audio", () => ({
  useAudioPlayer: () => ({ play: vi.fn(), pause: vi.fn(), seekTo: vi.fn(), remove: vi.fn() }),
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0, isLoaded: true }),
  useAudioRecorder: () => ({
    record: vi.fn(),
    stop: vi.fn(),
    prepareToRecordAsync: vi.fn(async () => undefined),
    uri: null,
  }),
  useAudioRecorderState: () => ({ isRecording: false, durationMillis: 0 }),
  setAudioModeAsync: vi.fn(async () => undefined),
  requestRecordingPermissionsAsync: vi.fn(async () => ({ granted: true })),
  RecordingPresets: { HIGH_QUALITY: {} },
}));

vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: vi.fn(async () => ({ canceled: true, assets: null })),
  launchCameraAsync: vi.fn(async () => ({ canceled: true, assets: null })),
  requestMediaLibraryPermissionsAsync: vi.fn(async () => ({ granted: true })),
  MediaType: { Images: "images", Videos: "videos" },
}));

vi.mock("expo-file-system", () => ({
  File: class {
    exists = true;
    size = 0;
    constructor(public uri: string) {}
    bytes() {
      return new Uint8Array();
    }
  },
  FileMode: { READ: "read", WRITE: "write" },
  Paths: { cache: { uri: "file:///cache/" }, document: { uri: "file:///documents/" } },
  UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
}));

vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: vi.fn() },
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
}));

// Connecté par défaut : le hors-ligne est un état qu'un test doit demander, pas subir.
vi.mock("expo-network", () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: true }),
  addNetworkStateListener: vi.fn(() => ({ remove: vi.fn() })),
}));

vi.mock("expo-constants", () => ({
  default: { expoConfig: { scheme: "cimavia", extra: {} } },
}));

vi.mock("expo-secure-store", () => ({
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
}));

/**
 * Aucun code du mobile ne l'importe : c'est `@better-auth/expo/client` qui en dépend, et il est
 * chargé par `shared/lib/auth.ts` que tout écran finit par atteindre. Sans ce mock, la chaîne
 * redescend jusqu'à `expo-modules-core` et son pont JSI absent.
 */
vi.mock("expo-linking", () => ({
  createURL: (path: string) => `cimavia://${path}`,
  openURL: vi.fn(async () => true),
  parse: (url: string) => ({ path: url, queryParams: {} }),
  useURL: () => null,
}));

vi.mock("expo-device", () => ({ isDevice: true, deviceName: "test" }));

vi.mock("expo-notifications", () => ({
  getExpoPushTokenAsync: vi.fn(async () => ({ data: "ExponentPushToken[test]" })),
  getPermissionsAsync: vi.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: vi.fn(async () => ({ status: "granted" })),
  setNotificationHandler: vi.fn(),
  scheduleNotificationAsync: vi.fn(async () => "notif-1"),
  cancelScheduledNotificationAsync: vi.fn(async () => undefined),
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  setNotificationChannelAsync: vi.fn(async () => undefined),
  AndroidImportance: { MAX: 5 },
}));

/**
 * Les deux fournisseurs de mise en page rendent leurs enfants et rien d'autre. Ils portent des
 * marges (encoche, clavier) qui n'existent pas en jsdom : les simuler produirait des nombres
 * inventés, et aucun test n'affirme sur une marge.
 */
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: Readonly<{ children: ReactNode }>) => <>{children}</>,
  SafeAreaView: ({ children }: Readonly<{ children: ReactNode }>) => <>{children}</>,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("react-native-keyboard-controller", () => ({
  KeyboardProvider: ({ children }: Readonly<{ children: ReactNode }>) => <>{children}</>,
  KeyboardAvoidingView: ({ children }: Readonly<{ children: ReactNode }>) => <>{children}</>,
}));
