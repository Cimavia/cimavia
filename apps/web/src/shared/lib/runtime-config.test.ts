import { afterEach, describe, expect, it } from "vitest";
import { missingRuntimeConfig, requireApiUrl, runtimeConfig } from "./runtime-config";

const initial = window.__CMV_CONFIG__;

afterEach(() => {
  window.__CMV_CONFIG__ = initial;
});

describe("runtimeConfig", () => {
  it("lit ce que config.js a posé", () => {
    window.__CMV_CONFIG__ = {
      apiUrl: "https://api-preview.example.com",
      tier: "preview",
      sentryDsn: "https://clef@o0.ingest.sentry.io/1",
    };

    expect(runtimeConfig()).toEqual({
      apiUrl: "https://api-preview.example.com",
      tier: "preview",
      sentryDsn: "https://clef@o0.ingest.sentry.io/1",
    });
  });

  /**
   * Le cas d'un `config.js` jamais servi — un 404, ou le script retiré d'`index.html` : rien n'est
   * posé, et rien n'est inventé à la place.
   */
  it("rend tout à null quand config.js n'a rien posé", () => {
    window.__CMV_CONFIG__ = undefined;

    expect(runtimeConfig()).toEqual({ apiUrl: null, tier: null, sentryDsn: null });
  });

  /**
   * Le cas RÉEL d'un conteneur : une variable définie sans valeur (`CMV_API_URL=`) donne `""`, pas
   * une absence. Une variable NON définie, elle, ne va pas jusqu'ici — nginx refuse de démarrer.
   */
  it("traite une valeur vide comme une absence", () => {
    window.__CMV_CONFIG__ = { apiUrl: "", tier: "", sentryDsn: "" };

    expect(runtimeConfig()).toEqual({ apiUrl: null, tier: null, sentryDsn: null });
  });

  it.each([
    ["un chemin relatif", "/api"],
    ["un autre protocole", "javascript:alert(1)"],
    ["une chaîne qui n'est pas une URL", "api-preview.example.com"],
    ["un type inattendu", 3000],
  ])("refuse %s comme URL d'API", (_, apiUrl) => {
    window.__CMV_CONFIG__ = { apiUrl, tier: "preview", sentryDsn: "" };

    expect(runtimeConfig().apiUrl).toBeNull();
  });

  it("refuse un tier inconnu plutôt que de le ramener à development", () => {
    window.__CMV_CONFIG__ = { apiUrl: "http://localhost:3000", tier: "staging", sentryDsn: "" };

    expect(runtimeConfig().tier).toBeNull();
  });
});

describe("missingRuntimeConfig", () => {
  it("ne signale rien quand l'app peut démarrer, DSN absent compris", () => {
    expect(
      missingRuntimeConfig({
        apiUrl: "http://localhost:3000",
        tier: "development",
        sentryDsn: null,
      }),
    ).toEqual([]);
  });

  it("nomme chaque variable manquante, sous le nom que l'exploitant pose", () => {
    expect(missingRuntimeConfig({ apiUrl: null, tier: null, sentryDsn: null })).toEqual([
      "CMV_API_URL",
      "CMV_APP_ENV",
    ]);
  });
});

describe("requireApiUrl", () => {
  it("rend l'URL de l'API", () => {
    window.__CMV_CONFIG__ = { apiUrl: "https://api.example.com", tier: "production" };

    expect(requireApiUrl()).toBe("https://api.example.com");
  });

  it("lève plutôt que d'inventer une URL", () => {
    window.__CMV_CONFIG__ = { apiUrl: "", tier: "production" };

    expect(() => requireApiUrl()).toThrow("CMV_API_URL");
  });
});
