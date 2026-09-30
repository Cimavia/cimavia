import * as Notifications from "expo-notifications";
import { Platform, Vibration } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelTimerEnd, scheduleTimerEnd, vibrateTimerDone } from "./timer-alert";

const NOW = 1_000_000;
const ORIGINAL_OS = Platform.OS;

const schedule = vi.mocked(Notifications.scheduleNotificationAsync);
const getPermissions = vi.mocked(Notifications.getPermissionsAsync);
const requestPermissions = vi.mocked(Notifications.requestPermissionsAsync);
const setChannel = vi.mocked(Notifications.setNotificationChannelAsync);
const cancel = vi.mocked(Notifications.cancelScheduledNotificationAsync);

type Permission = Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>;
const permission = (granted: boolean, canAskAgain = true) =>
  ({ status: granted ? "granted" : "denied", granted, canAskAgain }) as Permission;

/**
 * `Platform.OS` est une propriété simple de `react-native-web`, qui vaut `web` sous le harnais :
 * on la pose, comme `usePushToken.test.tsx`, et on la rend après chaque cas.
 */
function onPlatform(os: typeof Platform.OS): void {
  Object.assign(Platform, { OS: os });
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  onPlatform("ios");
  getPermissions.mockResolvedValue(permission(true));
  requestPermissions.mockResolvedValue(permission(true));
  schedule.mockResolvedValue("notif-1");
});

afterEach(() => {
  onPlatform(ORIGINAL_OS);
  vi.restoreAllMocks();
});

describe("scheduleTimerEnd — l'échéance", () => {
  /** iOS refuse un intervalle nul : sous une seconde, il n'y a rien à programmer. */
  it("rend null sous une seconde, sans rien demander à l'OS", async () => {
    await expect(scheduleTimerEnd(NOW + 400, "Repos", "Série 2")).resolves.toBeNull();

    expect(getPermissions).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it("programme une seule notification, à la seconde entière la plus proche", async () => {
    await expect(scheduleTimerEnd(NOW + 89_600, "Repos", "Série 2")).resolves.toBe("notif-1");

    expect(schedule).toHaveBeenCalledWith({
      content: {
        title: "Repos",
        body: "Série 2",
        sound: true,
        /** C'est lui qui perce un Focus et l'écran verrouillé : sans lui, la série est passée. */
        interruptionLevel: "timeSensitive",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 90,
        repeats: false,
      },
    });
  });
});

describe("scheduleTimerEnd — la permission", () => {
  it("ne redemande rien quand elle est accordée", async () => {
    await scheduleTimerEnd(NOW + 60_000, "Repos", "Série 2");

    expect(requestPermissions).not.toHaveBeenCalled();
  });

  /**
   * Jumeau du cas verrouillé dans `usePushToken.test.tsx` — les deux doivent rester alignés. Sans
   * `allowAlert`, iOS accorde la permission SANS bannière : la notification part, rien ne s'affiche.
   */
  it("la demande avec la bannière et le son, sans badge, quand elle manque", async () => {
    getPermissions.mockResolvedValue(permission(false));

    await expect(scheduleTimerEnd(NOW + 60_000, "Repos", "Série 2")).resolves.toBe("notif-1");

    expect(requestPermissions).toHaveBeenCalledWith({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
  });

  it("rend null quand l'athlète la refuse", async () => {
    getPermissions.mockResolvedValue(permission(false));
    requestPermissions.mockResolvedValue(permission(false));

    await expect(scheduleTimerEnd(NOW + 60_000, "Repos", "Série 2")).resolves.toBeNull();
    expect(schedule).not.toHaveBeenCalled();
  });

  /** L'OS ne montrerait plus la demande : la reposer serait un geste sans effet. */
  it("rend null sans redemander quand l'OS ne le permet plus", async () => {
    getPermissions.mockResolvedValue(permission(false, false));

    await expect(scheduleTimerEnd(NOW + 60_000, "Repos", "Série 2")).resolves.toBeNull();
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });
});

describe("scheduleTimerEnd — Android", () => {
  /** Sans canal, Android 8+ n'affiche RIEN et ne le dit pas. */
  it("crée le canal des minuteurs et y range la notification", async () => {
    onPlatform("android");

    await scheduleTimerEnd(NOW + 60_000, "Repos", "Série 2");

    expect(setChannel).toHaveBeenCalledWith(
      "cimavia-timer",
      expect.objectContaining({ importance: Notifications.AndroidImportance.HIGH }),
    );
    expect(schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({ channelId: "cimavia-timer" }),
      }),
    );
  });

  it("ne crée aucun canal ailleurs", async () => {
    await scheduleTimerEnd(NOW + 60_000, "Repos", "Série 2");

    expect(setChannel).not.toHaveBeenCalled();
    expect(schedule.mock.calls[0]?.[0].trigger).not.toHaveProperty("channelId");
  });
});

describe("scheduleTimerEnd — l'OS refuse", () => {
  /** L'appelant DIT à l'athlète que le minuteur ne sonnera pas : il faut un `null`, pas un rejet. */
  it("rend null plutôt que de lever", async () => {
    schedule.mockRejectedValue(new Error("notifications indisponibles"));

    await expect(scheduleTimerEnd(NOW + 60_000, "Repos", "Série 2")).resolves.toBeNull();
  });
});

describe("cancelTimerEnd", () => {
  it("annule la notification désignée", async () => {
    await cancelTimerEnd("notif-1");

    expect(cancel).toHaveBeenCalledWith("notif-1");
  });

  /** Déjà tirée ou déjà annulée : il n'y a rien à défaire, et rien ne doit remonter. */
  it("n'échoue jamais", async () => {
    cancel.mockRejectedValueOnce(new Error("introuvable"));

    await expect(cancelTimerEnd("notif-1")).resolves.toBeUndefined();
  });
});

describe("vibrateTimerDone", () => {
  it("fait vibrer trois fois", () => {
    const vibrate = vi.spyOn(Vibration, "vibrate").mockImplementation(() => undefined);

    vibrateTimerDone();

    expect(vibrate).toHaveBeenCalledWith([0, 220, 120, 220, 120, 220]);
  });
});
