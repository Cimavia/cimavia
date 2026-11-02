import { afterEach, describe, expect, it, vi } from "vitest";
import { readStoredJson, removeStored, writeStoredJson } from "./local-storage";

const KEY = "cimavia-test";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

const refuse = (method: "getItem" | "setItem" | "removeItem") =>
  vi.spyOn(Storage.prototype, method).mockImplementation(() => {
    throw new Error("SecurityError");
  });

describe("local-storage", () => {
  it("écrit, relit, puis efface", () => {
    writeStoredJson(KEY, { mode: "side" });
    expect(readStoredJson(KEY)).toEqual({ mode: "side" });

    removeStored(KEY);
    expect(readStoredJson(KEY)).toBeNull();
  });

  it("rend null sur un JSON abîmé", () => {
    window.localStorage.setItem(KEY, "{mode:");

    expect(readStoredJson(KEY)).toBeNull();
  });

  // Navigation privée, quota plein : aucune des trois ne lève.
  it("ne lève jamais quand le stockage refuse", () => {
    refuse("getItem");
    refuse("setItem");
    refuse("removeItem");

    expect(readStoredJson(KEY)).toBeNull();
    expect(() => writeStoredJson(KEY, 1)).not.toThrow();
    expect(() => removeStored(KEY)).not.toThrow();
  });
});
