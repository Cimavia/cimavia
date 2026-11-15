import { afterEach, describe, expect, it, vi } from "vitest";
import { entryScriptIn, servedEntryScript } from "./bundle-update";

/** L'`index.html` que produit `vite build`, à l'ordre près (cf. `apps/web/dist`). */
const BUILT = `<!doctype html>
<html lang="fr">
  <head>
    <script src="/config.js" ></script>
    <script type="module" crossorigin src="/assets/index--IblTQaU.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/rolldown-runtime-WkwZ5CU-.js">
    <link rel="stylesheet" crossorigin href="/assets/index-DNKjotbi.css">
  </head>
  <body><div id="root"></div></body>
</html>`;

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

function serve(response: Partial<Response> | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return { ok: true, redirected: false, text: async () => BUILT, ...response } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("entryScriptIn", () => {
  it("lit le script d'entrée hashé, pas le script classique de config.js qui le précède", () => {
    expect(entryScriptIn(parse(BUILT))).toBe("/assets/index--IblTQaU.js");
  });

  it("ignore un module injecté avant elle — une extension du navigateur, absente du serveur", () => {
    const page = BUILT.replace(
      "<head>",
      '<head><script type="module" src="chrome-extension://abc/inject.js"></script>',
    );

    expect(entryScriptIn(parse(page))).toBe("/assets/index--IblTQaU.js");
  });

  it("ne voit rien sur le serveur de dev : son entrée n'est pas un bundle", () => {
    expect(entryScriptIn(parse('<script type="module" src="/src/main.tsx"></script>'))).toBeNull();
  });

  it("rend null sans script d'entrée — une page qui n'est pas l'app", () => {
    expect(entryScriptIn(parse('<script src="/config.js"></script><p>Connexion</p>'))).toBeNull();
  });
});

describe("servedEntryScript", () => {
  it("relit index.html sans passer par le cache du navigateur", async () => {
    const fetchMock = serve({});

    await expect(servedEntryScript()).resolves.toBe("/assets/index--IblTQaU.js");
    expect(fetchMock).toHaveBeenCalledWith("/index.html", { cache: "no-store" });
  });

  it.each([
    ["un statut d'erreur", { ok: false }],
    ["une redirection — la connexion d'Access, pas l'app", { redirected: true }],
  ])("ne sait pas sur %s", async (_case, response) => {
    serve(response);

    await expect(servedEntryScript()).resolves.toBeNull();
  });

  it("ne sait pas quand le réseau tombe", async () => {
    serve(new TypeError("Failed to fetch"));

    await expect(servedEntryScript()).resolves.toBeNull();
  });
});
