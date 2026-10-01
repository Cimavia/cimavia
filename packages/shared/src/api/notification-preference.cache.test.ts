import { describe, expect, it, vi } from "vitest";
import { type NotificationEmailPreferenceDto, NotificationType } from "../dto/notification.schema";
import type { CacheClient } from "./cache-client";
import { notificationPreferenceKeys } from "./notification.api";
import {
  type NotificationPreferenceToggle,
  preferenceToggleMutation,
  withToggledPreference,
} from "./notification-preference.cache";

/**
 * Un cache factice, qui applique les mises à jour comme TanStack Query : une fonction reçoit
 * l'ancienne valeur, tout le reste la remplace. Il note aussi ce qu'on lui a demandé de relire.
 */
function fakeCache(grid?: NotificationEmailPreferenceDto[]) {
  let data: unknown = grid;
  const invalidated: unknown[] = [];
  const cache: CacheClient = {
    getQueryData: () => data,
    setQueryData: (_queryKey, updater) => {
      data = typeof updater === "function" ? updater(data) : updater;
    },
    invalidateQueries: ({ queryKey }) => invalidated.push(queryKey),
  };
  return { cache, read: () => data, invalidated };
}

const GRID: NotificationEmailPreferenceDto[] = [
  { type: NotificationType.MESSAGE_RECEIVED, enabled: true },
  { type: NotificationType.FEEDBACK_RECEIVED, enabled: false },
];

/** On allume les débriefs : l'ensemble envoyé porte les deux types. */
const TOGGLE: NotificationPreferenceToggle = {
  type: NotificationType.FEEDBACK_RECEIVED,
  enabled: [NotificationType.MESSAGE_RECEIVED, NotificationType.FEEDBACK_RECEIVED],
};

describe("withToggledPreference", () => {
  it("bascule le type visé, et lui seul", () => {
    expect(withToggledPreference(GRID, TOGGLE.type)).toEqual([
      GRID[0],
      { ...GRID[1], enabled: true },
    ]);
  });

  it("ne touche pas la grille qu'il reçoit", () => {
    withToggledPreference(GRID, TOGGLE.type);
    expect(GRID[1]?.enabled).toBe(false);
  });

  /** Grille pas encore chargée : rien à supposer, et pas une grille vide inventée. */
  it("sans grille, n'en invente pas une", () => {
    expect(withToggledPreference(undefined, TOGGLE.type)).toBeUndefined();
  });
});

describe("preferenceToggleMutation", () => {
  it("envoie l'ensemble calculé par l'appelant, pas un recalcul depuis le cache", () => {
    const replace = vi.fn(() => Promise.resolve(GRID));

    preferenceToggleMutation(fakeCache(GRID).cache, { replace }).mutationFn(TOGGLE);

    expect(replace).toHaveBeenCalledWith({ enabled: TOGGLE.enabled });
  });

  it("pose la supposition tout de suite, et rend la grille d'avant", () => {
    const { cache, read } = fakeCache(GRID);
    const mutation = preferenceToggleMutation(cache, { replace: vi.fn() });

    const context = mutation.onMutate(TOGGLE);

    expect(read()).toEqual(withToggledPreference(GRID, TOGGLE.type));
    expect(context.previous).toBe(GRID);
  });

  it("sur un échec, remet la grille d'avant et laisse l'écran le dire", () => {
    const { cache, read } = fakeCache(GRID);
    const onError = vi.fn();
    const mutation = preferenceToggleMutation(cache, { replace: vi.fn() }, onError);
    const context = mutation.onMutate(TOGGLE);
    const error = new Error("réseau");

    mutation.onError(error, TOGGLE, context);

    expect(read()).toBe(GRID);
    expect(onError).toHaveBeenCalledWith(error);
  });

  /** Le mobile ne passe rien : l'interrupteur revient, sans message (#137). */
  it("sans onError, remet quand même la grille d'avant", () => {
    const { cache, read } = fakeCache(GRID);
    const mutation = preferenceToggleMutation(cache, { replace: vi.fn() });

    mutation.onError(new Error("réseau"), TOGGLE, mutation.onMutate(TOGGLE));

    expect(read()).toBe(GRID);
  });

  it("relit la grille une fois l'écriture terminée, quelle qu'en soit l'issue", () => {
    const { cache, invalidated } = fakeCache(GRID);

    preferenceToggleMutation(cache, { replace: vi.fn() }).onSettled();

    expect(invalidated).toEqual([notificationPreferenceKeys.all]);
  });
});
