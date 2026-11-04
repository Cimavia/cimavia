import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cmvColors } from "@cmv/tokens";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type LegalSource,
  legalMiddleware,
  legalPagesPlugin,
  legalTitle,
  readLegalSources,
  renderLegalPage,
} from "./legal-pages";

const source = (fragment: string): LegalSource => ({ locale: "fr", document: "privacy", fragment });

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "cmv-legal-"));
  mkdirSync(path.join(dir, "fr"));
  writeFileSync(path.join(dir, "fr", "terms.html"), "<h1>Conditions</h1><p>Texte</p>");
  writeFileSync(path.join(dir, "fr", "privacy.html"), "<h1>Confidentialité</h1>");
  // Ce qui n'est pas un fragment n'est pas publié.
  writeFileSync(path.join(dir, "fr", "brouillon.md"), "# pas publié");
  writeFileSync(path.join(dir, "LISEZMOI"), "hors langue");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("legalTitle", () => {
  it("lit le titre dans le <h1>", () => {
    expect(legalTitle(source('<h1 id="t"> Politique de confidentialité </h1>'))).toBe(
      "Politique de confidentialité",
    );
  });

  // L'onglet afficherait la balise en clair.
  it("refuse un <h1> qui porte une balise", () => {
    expect(() => legalTitle(source("<h1>Politique <em>de</em> confidentialité</h1>"))).toThrow(
      "le <h1> de legal/fr/privacy.html ne porte que du texte",
    );
  });

  // Un document sans titre est une faute d'écriture : le build doit le dire, pas publier.
  it("refuse un fragment sans <h1>", () => {
    expect(() => legalTitle(source("<p>Texte</p>"))).toThrow(
      "legal/fr/privacy.html doit commencer par son <h1>",
    );
  });

  // Le titre de l'onglet est celui de la page : un texte qui le précède, ou un ancien titre laissé
  // en commentaire, le ferait mentir.
  it.each(["<p>Préambule</p><h1>Titre</h1>", "<!-- <h1>Ancien</h1> --><h1>Titre</h1>"])(
    "refuse un fragment qui ne commence pas par son <h1> : %s",
    (fragment) => {
      expect(() => legalTitle(source(fragment))).toThrow("doit commencer par son <h1>");
    },
  );

  it("refuse un <h1> jamais fermé", () => {
    expect(() => legalTitle(source("<h1>Titre"))).toThrow("doit commencer par son <h1>");
  });
});

describe("renderLegalPage", () => {
  const page = renderLegalPage(source("\n<h1>Confidentialité</h1>\n<p>Texte</p>\n"));

  it("déclare la langue du texte et le titre de l'onglet", () => {
    expect(page).toContain('<html lang="fr">');
    expect(page).toContain("<title>Confidentialité</title>");
  });

  it("embarque le fragment tel quel", () => {
    expect(page).toContain("<h1>Confidentialité</h1>\n<p>Texte</p>");
  });

  // Règle n°3 : les couleurs viennent des tokens, jamais d'une valeur écrite dans le gabarit.
  it("tire ses couleurs de la palette", () => {
    expect(page).toContain(`background:${cmvColors.bg[0]}`);
    expect(page).toContain(`a{color:${cmvColors.accent.on}}`);
  });

  // Une page lisible à 360 px : c'est le téléphone qui l'ouvre depuis l'app.
  it("se lit à la largeur d'un téléphone", () => {
    expect(page).toContain('content="width=device-width, initial-scale=1.0"');
  });
});

describe("readLegalSources", () => {
  it("ne garde que les fragments HTML rangés sous une langue, triés", () => {
    expect(readLegalSources(dir)).toEqual([
      { locale: "fr", document: "privacy", fragment: "<h1>Confidentialité</h1>" },
      { locale: "fr", document: "terms", fragment: "<h1>Conditions</h1><p>Texte</p>" },
    ]);
  });
});

function call(url: string | undefined) {
  const res = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };
  const handle = legalMiddleware(dir) as (req: unknown, res: unknown) => void;
  handle({ url }, res);
  return res;
}

describe("legalMiddleware", () => {
  it("rend la page d'un document, sans cache", () => {
    const res = call("/fr/terms");
    expect(res.statusCode).toBe(200);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/html; charset=utf-8");
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache");
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining("<title>Conditions</title>"));
  });

  it("ignore la chaîne de requête", () => {
    expect(call("/fr/terms?from=app").statusCode).toBe(200);
  });

  // Jamais la SPA : elle chargerait l'app, que Cloudflare Access garde.
  it.each(["/fr/inconnu", "/en/terms", "/fr/terms.html", "/", undefined])(
    "répond 404 à %s",
    (url) => {
      const res = call(url);
      expect(res.statusCode).toBe(404);
      expect(res.end).toHaveBeenCalledWith();
    },
  );
});

describe("legalPagesPlugin", () => {
  // Créé dans chaque test : `dir` n'existe qu'après le `beforeEach`.
  const plugin = () => legalPagesPlugin(dir);

  it("émet chaque document à son chemin publié", () => {
    const emitFile = vi.fn();
    (plugin().generateBundle as (this: unknown) => void).call({ emitFile });
    expect(emitFile.mock.calls.map(([file]) => file.fileName)).toEqual([
      "legal/fr/privacy.html",
      "legal/fr/terms.html",
    ]);
    expect(emitFile).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "asset",
        source: expect.stringContaining("<!doctype html>"),
      }),
    );
  });

  it.each(["configureServer", "configurePreviewServer"] as const)(
    "monte le middleware sous /legal en %s",
    (hook) => {
      const use = vi.fn();
      (plugin()[hook] as (server: unknown) => void)({ middlewares: { use } });
      expect(use).toHaveBeenCalledWith("/legal", expect.any(Function));
    },
  );
});
