import { describe, expect, it } from "vitest";
import { type PhraseTools, phraseId, translatePhrase, translatePhrases } from "./phrase.util";

// Un traducteur qui montre ce qu'il reçoit : la clé, puis les paramètres déjà rendus.
const tools: PhraseTools = {
  translate: (key, params) => `${key}(${JSON.stringify(params)})`,
  formatList: (items) => items.join(" + "),
};

describe("translatePhrase", () => {
  it("passe la clé et ses paramètres simples tels quels, `count` restant un nombre", () => {
    expect(translatePhrase({ key: "a.b", params: { count: 2, name: "Léa" } }, tools)).toBe(
      'a.b({"count":2,"name":"Léa"})',
    );
  });

  it("rend d'abord une phrase passée en paramètre", () => {
    const phrase = { key: "outer", params: { inner: { key: "inner", params: { n: 1 } } } };
    expect(translatePhrase(phrase, tools)).toBe('outer({"inner":"inner({\\"n\\":1})"})');
  });

  it("confie une liste de noms à la langue du lecteur", () => {
    expect(translatePhrase({ key: "flow", params: { labels: ["A1", "A2"] } }, tools)).toBe(
      'flow({"labels":"A1 + A2"})',
    );
  });
});

describe("translatePhrases", () => {
  it("met les morceaux bout à bout, sans rien entre eux", () => {
    expect(
      translatePhrases(
        [
          { key: "a", params: {} },
          { key: "b", params: {} },
        ],
        tools,
      ),
    ).toBe("a({})b({})");
  });

  it("rend une chaîne vide pour aucun morceau", () => {
    expect(translatePhrases([], tools)).toBe("");
  });
});

describe("phraseId", () => {
  it("distingue deux rangées que seul leur paramètre sépare", () => {
    const first = phraseId({ key: "block.grid.set", params: { index: 1 } });
    const second = phraseId({ key: "block.grid.set", params: { index: 2 } });

    expect(first).not.toBe(second);
    expect(phraseId({ key: "block.grid.set", params: { index: 1 } })).toBe(first);
  });
});
