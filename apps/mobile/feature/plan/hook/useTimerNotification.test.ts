import { act, renderHook, waitFor } from "@testing-library/react";
import * as Notifications from "expo-notifications";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type TimerAlert, useTimerNotification } from "./useTimerNotification";

/**
 * La VRAIE chaîne jusqu'à l'OS : seul `expo-notifications` est un double. Ce qui s'affirme est ce
 * qui en sort — ce qui est programmé, ce qui est annulé —, pas un `scheduleTimerEnd` espionné.
 */
const schedule = vi.mocked(Notifications.scheduleNotificationAsync);
const cancel = vi.mocked(Notifications.cancelScheduledNotificationAsync);

let sequence = 0;
const alertIn = (seconds: number, body = "Série suivante"): TimerAlert => ({
  at: Date.now() + seconds * 1000,
  title: "Tractions",
  body,
});

beforeEach(() => {
  sequence = 0;
  schedule.mockImplementation(async () => {
    sequence += 1;
    return `notif-${sequence}`;
  });
});

describe("useTimerNotification", () => {
  it("n'est pas armé quand il n'y a rien à annoncer", () => {
    const { result } = renderHook(() => useTimerNotification([]));

    expect(result.current.armed).toBe(false);
    expect(schedule).not.toHaveBeenCalled();
  });

  /**
   * TOUTES les échéances d'avance : téléphone rangé, le JS est gelé, et plus rien ne serait
   * programmé après la première.
   */
  it("programme chaque échéance d'un coup, et s'arme", async () => {
    const alerts = [alertIn(60, "Repos"), alertIn(90, "Série 2")];

    const { result } = renderHook(() => useTimerNotification(alerts));

    await waitFor(() => expect(result.current.armed).toBe(true));
    expect(schedule.mock.calls.map(([request]) => request.content.body)).toEqual([
      "Repos",
      "Série 2",
    ]);
  });

  /** Rien de programmé, rien d'armé : l'écran le DIT, un minuteur muet qu'on croit armé est pire. */
  it("reste désarmé quand l'OS n'a rien accepté", async () => {
    schedule.mockRejectedValue(new Error("notifications indisponibles"));

    const { result } = renderHook(() => useTimerNotification([alertIn(60)]));

    await waitFor(() => expect(schedule).toHaveBeenCalled());
    await act(async () => undefined);
    expect(result.current.armed).toBe(false);
  });

  /** Pause, « Passer », « + 30 s » : ce qui sonnait pour l'ancien déroulé ne doit plus sonner. */
  it("annule les échéances précédentes avant de reposer le nouveau déroulé", async () => {
    const { result, rerender } = renderHook(({ alerts }) => useTimerNotification(alerts), {
      initialProps: { alerts: [alertIn(60), alertIn(90)] },
    });
    await waitFor(() => expect(result.current.armed).toBe(true));

    rerender({ alerts: [alertIn(120)] });

    await waitFor(() => expect(schedule).toHaveBeenCalledTimes(3));
    expect(cancel.mock.calls.map(([id]) => id)).toEqual(["notif-1", "notif-2"]);
  });

  it("se désarme et annule tout quand il ne reste plus rien à annoncer", async () => {
    const { result, rerender } = renderHook(({ alerts }) => useTimerNotification(alerts), {
      initialProps: { alerts: [alertIn(60)] },
    });
    await waitFor(() => expect(result.current.armed).toBe(true));

    rerender({ alerts: [] });

    await waitFor(() => expect(result.current.armed).toBe(false));
    expect(cancel).toHaveBeenCalledWith("notif-1");
  });

  /**
   * LA COURSE que `cancelled` prévient : l'écran se ferme PENDANT que l'OS programme. Ce qui arrive
   * après coup doit être annulé aussitôt — sinon le téléphone sonnerait pour une séance quittée.
   */
  it("annule ce que l'OS rend après un démontage survenu pendant la programmation", async () => {
    let grant: (id: string) => void = () => undefined;
    schedule.mockImplementation(() => new Promise((resolve) => (grant = resolve)));
    const { unmount } = renderHook(() => useTimerNotification([alertIn(60)]));
    await waitFor(() => expect(schedule).toHaveBeenCalled());

    unmount();
    await act(async () => grant("notif-tardive"));

    await waitFor(() => expect(cancel).toHaveBeenCalledWith("notif-tardive"));
  });

  it("annule ce qui est programmé quand l'écran se ferme", async () => {
    const { result, unmount } = renderHook(() => useTimerNotification([alertIn(60)]));
    await waitFor(() => expect(result.current.armed).toBe(true));

    unmount();

    expect(cancel).toHaveBeenCalledWith("notif-1");
  });

  /**
   * Le tableau est recalculé à chaque rendu — quatre fois par seconde pendant un décompte. À
   * contenu égal, rien ne se reprogramme : c'est la clé stable.
   */
  it("ne reprogramme rien pour un tableau recréé à l'identique", async () => {
    const alerts = [alertIn(60)];
    const { result, rerender } = renderHook(({ list }) => useTimerNotification(list), {
      initialProps: { list: alerts },
    });
    await waitFor(() => expect(result.current.armed).toBe(true));

    rerender({ list: alerts.map((alert) => ({ ...alert })) });
    await act(async () => undefined);

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });
});
