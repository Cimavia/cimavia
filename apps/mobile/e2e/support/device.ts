import { execFile, spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createConnection, createServer, type Socket } from "node:net";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import {
  ANDROID_DIR,
  API_PORT,
  APK,
  APP_ID,
  BUILD_STAMP,
  DEVICE_API_URL,
  MOBILE_DIR,
  PARKED_ANDROID_DIR,
  TIME_ZONE,
} from "./env";

/** Le port du serveur adb, celui que `adb` et Maestro cherchent sur `localhost`. */
const ADB_PORT = 5037;

/** `adb` du SDK quand `ANDROID_HOME` le dit, celui du `PATH` sinon (le runner de la CI). */
function adbPath(): string {
  const home = process.env.ANDROID_HOME;
  const fromSdk = home == null ? null : join(home, "platform-tools", "adb");
  return fromSdk != null && existsSync(fromSdk) ? fromSdk : "adb";
}

const execFileAsync = promisify(execFile);

/**
 * TOUT appel est asynchrone, et c'est une contrainte : le relais adb (`relayAdbServer`) vit dans le
 * process de Playwright. Un appel synchrone y gèlerait la boucle d'événements, et `adb` attendrait
 * pour toujours une réponse que le relais ne pourrait plus lui faire passer.
 */
export async function adb(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(adbPath(), args, { encoding: "utf8" });
  return stdout.trim();
}

/** Une commande longue, sa sortie dans celle de la suite : le build se suit en direct. */
function run(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { ...options, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`${command} ${args.join(" ")} : sortie ${code ?? "sur signal"}`)),
    );
  });
}

/**
 * Relaie `localhost:5037` vers un serveur adb distant, quand `CMV_ADB_SERVER` le nomme (`hôte:port`).
 *
 * Le cas de WSL2 en NAT : l'émulateur tourne sous Windows, et son serveur adb n'écoute que sur le
 * `localhost` de Windows, que WSL ne voit pas. `adb` sait viser un autre serveur
 * (`ADB_SERVER_SOCKET`), Maestro non : il le cherche sur `localhost:5037`. Le relais le lui donne,
 * le temps de la suite — sans lui, aucun process de la suite ne joint l'appareil.
 *
 * Les `adb` des deux côtés doivent être de la même version (`adb version`, SDK à jour des deux) :
 * un client qui ne reconnaît pas le serveur l'ARRÊTE pour démarrer le sien, et la suite échoue
 * ensuite sur « 0 appareil », loin de la cause.
 *
 * `null` quand rien n'est à relayer : la CI et un poste Linux ont leur serveur adb sur place.
 */
export function relayAdbServer(): Promise<AdbRelay | null> {
  const target = process.env.CMV_ADB_SERVER;
  if (target == null || target === "") return Promise.resolve(null);
  const [host, port] = target.split(":");
  if (host == null || host === "" || port == null || !/^\d+$/.test(port)) {
    throw new Error(`CMV_ADB_SERVER illisible : « ${target} », « hôte:port » était attendu.`);
  }

  const sockets = new Set<Socket>();
  const relay = createServer((client) => {
    const upstream = createConnection(Number(port), host);
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    }
    client.pipe(upstream).pipe(client);
    client.on("error", () => upstream.destroy());
    upstream.on("error", () => client.destroy());
  });
  // Les connexions encore ouvertes sont COUPÉES : `close` attend sinon qu'elles finissent d'elles-
  // mêmes, et des clients d'adb partis sans fermer la leur l'ont fait attendre pour toujours — la
  // suite, ses quatre parcours verts, ne rendait plus la main.
  const close = () =>
    new Promise<void>((resolvePromise) => {
      relay.close(() => resolvePromise());
      for (const socket of sockets) socket.destroy();
    });
  return new Promise((resolvePromise, reject) => {
    relay.once("error", (error: NodeJS.ErrnoException) =>
      reject(
        error.code === "EADDRINUSE"
          ? new Error(
              `Le port ${ADB_PORT} est déjà pris : un serveur adb local tourne (\`adb kill-server\`), ` +
                "et le relais vers CMV_ADB_SERVER ne peut pas s'y poser.",
            )
          : error,
      ),
    );
    relay.listen(ADB_PORT, "127.0.0.1", () => resolvePromise({ close }));
  });
}

/** Le relais ouvert, et de quoi le fermer — connexions comprises. */
export type AdbRelay = { close: () => Promise<void> };

/**
 * Un appareil, et un seul — sauf `ANDROID_SERIAL`, que `adb` et Maestro lisent tous deux. Deux
 * appareils sans choix, c'est une installation et des flux qui pourraient viser deux téléphones.
 */
export async function assertOneDevice(): Promise<void> {
  if (process.env.ANDROID_SERIAL) return;
  const devices = (await adb("devices"))
    .split("\n")
    .slice(1)
    .filter((line) => line.endsWith("\tdevice"));
  if (devices.length !== 1) {
    throw new Error(
      `${devices.length} appareil(s) Android prêt(s), il en faut un seul. Démarrer l'émulateur, ` +
        "ou nommer l'appareil par ANDROID_SERIAL.",
    );
  }
}

/**
 * Règle l'appareil sur le fuseau des parcours, et rend de quoi remettre le sien. La séance « du
 * jour » est datée à Paris par le seed, et l'app la cherche dans le jour de l'appareil : un
 * émulateur à l'heure GMT — celui de la CI, ou un AVD neuf — ferait échouer le parcours la nuit,
 * sur un écran vide qui n'expliquerait rien.
 *
 * Sans root : `cmd alarm` règle le fuseau, la détection automatique coupée pour qu'il le reste.
 */
export async function pinTimeZone(): Promise<() => Promise<void>> {
  // Un AVD neuf n'a aucun fuseau enregistré : il tourne alors à GMT, et c'est GMT qui est remis.
  const previousZone = (await adb("shell", "getprop", "persist.sys.timezone")) || "GMT";
  const previousAuto = await adb("shell", "cmd", "time_zone_detector", "is_auto_detection_enabled");
  const restore = async () => {
    await adb("shell", "cmd", "alarm", "set-timezone", previousZone);
    await adb("shell", "cmd", "time_zone_detector", "set_auto_detection_enabled", previousAuto);
  };
  try {
    await adb("shell", "cmd", "time_zone_detector", "set_auto_detection_enabled", "false");
    await adb("shell", "cmd", "alarm", "set-timezone", TIME_ZONE);
  } catch (error) {
    // La détection coupée, le fuseau refusé : l'appelant n'aura pas de quoi la rallumer.
    await restore().catch(() => undefined);
    throw error;
  }
  return restore;
}

/**
 * La build release de la variante `e2e` : prebuild, puis Gradle. `EXPO_NO_DOTENV` écarte les `.env`
 * du poste — l'URL de l'API, le DSN Sentry : la build ne voit que ce qui est posé ici.
 *
 * Le prebuild `--clean` régénère `android/`, celui du DEV CLIENT : un `expo run:android` ne refait
 * pas son prebuild, et bâtirait ensuite un dev client à l'identifiant e2e, sans Firebase. Il est
 * donc mis de côté le temps de la build, puis remis ; l'APK sort d'`android/` avant.
 */
export async function buildApk(): Promise<void> {
  restoreParkedAndroid();
  const parked = existsSync(ANDROID_DIR);
  mkdirSync(dirname(PARKED_ANDROID_DIR), { recursive: true });
  if (parked) renameSync(ANDROID_DIR, PARKED_ANDROID_DIR);
  try {
    await buildE2eAndroid();
  } finally {
    rmSync(ANDROID_DIR, { recursive: true, force: true });
    if (parked) renameSync(PARKED_ANDROID_DIR, ANDROID_DIR);
  }
}

/**
 * Une build interrompue (Ctrl-C, process tué) n'a pas remis l'`android/` du dev client : il l'est
 * ici, à la build suivante. Celui en place est celui de la build e2e, que rien ne garde.
 */
function restoreParkedAndroid(): void {
  if (!existsSync(PARKED_ANDROID_DIR)) return;
  console.warn(
    `android/ du dev client remis depuis ${PARKED_ANDROID_DIR} (build e2e interrompue).`,
  );
  rmSync(ANDROID_DIR, { recursive: true, force: true });
  renameSync(PARKED_ANDROID_DIR, ANDROID_DIR);
}

async function buildE2eAndroid(): Promise<void> {
  const env = {
    ...process.env,
    APP_VARIANT: "e2e",
    EXPO_NO_DOTENV: "1",
    EXPO_PUBLIC_API_URL: DEVICE_API_URL,
    // Aucun parcours n'ouvre le web : l'URL n'est là que pour la garde de `app.config.ts`.
    EXPO_PUBLIC_WEB_URL: "http://localhost:4310",
    EXPO_PUBLIC_SENTRY_DSN: "",
    // Le plugin Sentry enverrait les sourcemaps de la release, sans jeton pour le faire.
    SENTRY_DISABLE_AUTO_UPLOAD: "true",
    NODE_ENV: "production",
  };
  await run(
    "pnpm",
    ["exec", "expo", "prebuild", "--platform", "android", "--clean", "--no-install"],
    { cwd: MOBILE_DIR, env },
  );
  // x86_64 seulement : l'émulateur, ici comme en CI. Toutes les ABI doubleraient le temps de build.
  await run(
    "./gradlew",
    ["assembleRelease", "-PreactNativeArchitectures=x86_64", "--console=plain"],
    { cwd: ANDROID_DIR, env },
  );
  copyFileSync(join(ANDROID_DIR, "app/build/outputs/apk/release/app-release.apk"), APK);
  writeFileSync(BUILD_STAMP, DEVICE_API_URL);
}

/**
 * Installe l'APK. Une APK construite pour un autre port — un autre worktree — est refusée : elle
 * viserait une API qui n'est pas celle-ci.
 */
export async function installApk(): Promise<void> {
  if (!existsSync(APK) || !existsSync(BUILD_STAMP)) {
    throw new Error(`Aucune build e2e (${APK}) : relancer sans CMV_E2E_SKIP_BUILD.`);
  }
  const builtFor = readFileSync(BUILD_STAMP, "utf8");
  if (builtFor !== DEVICE_API_URL) {
    throw new Error(
      `La build e2e vise ${builtFor}, cette suite ${DEVICE_API_URL} : relancer sans CMV_E2E_SKIP_BUILD.`,
    );
  }
  await adb("install", "-r", APK);
}

/** Retire la build e2e : elle n'a rien à faire sur l'appareil après la suite. */
export async function uninstallApk(): Promise<void> {
  await adb("uninstall", APP_ID);
}

/** Relie le `localhost` de l'appareil à l'API de test, et rend de quoi défaire le lien. */
export async function reverseApiPort(): Promise<() => Promise<void>> {
  await adb("reverse", `tcp:${API_PORT}`, `tcp:${API_PORT}`);
  return async () => {
    await adb("reverse", "--remove", `tcp:${API_PORT}`);
  };
}
