import { describe, expect, it } from "vitest";
import {
  BUNDLE_BUDGET,
  budgetOverruns,
  bundleBudgetPlugin,
  type EmittedChunk,
  measureBundle,
} from "./bundle-budget";

const chunk = (fileName: string, bytes: number, imports: string[] = [], isEntry = false) =>
  ({ fileName, bytes, isEntry, imports }) satisfies EmittedChunk;

describe("measureBundle", () => {
  it("compte au premier affichage l'entrée et ses imports statiques, de proche en proche", () => {
    const measured = measureBundle([
      chunk("index.js", 100, ["crash.js"], true),
      chunk("crash.js", 20, ["helper.js"]),
      chunk("helper.js", 3),
      chunk("editor.js", 400, ["helper.js"]),
    ]);

    expect(measured).toEqual({ initial: 123, total: 523 });
  });

  it("ne compte qu'une fois un chunk importé deux fois, ou par un cycle", () => {
    const measured = measureBundle([
      chunk("index.js", 10, ["a.js", "b.js"], true),
      chunk("a.js", 5, ["b.js"]),
      chunk("b.js", 7, ["a.js"]),
    ]);

    expect(measured).toEqual({ initial: 22, total: 22 });
  });

  it("ignore un import qu'aucun chunk émis ne porte", () => {
    expect(measureBundle([chunk("index.js", 10, ["absent.js"], true)])).toEqual({
      initial: 10,
      total: 10,
    });
  });
});

describe("budgetOverruns", () => {
  const budget = { initial: 2000, total: 5000 };

  it("ne dit rien au budget pile, sur chaque clé", () => {
    expect(budgetOverruns({ initial: 2000, total: 5000 }, budget)).toEqual([]);
  });

  it("nomme chaque budget dépassé, ne serait-ce que d'un octet", () => {
    expect(budgetOverruns({ initial: 2001, total: 5000 }, budget)).toEqual([
      "bundle initial : 2001 octets pour un budget de 2000 (+1)",
    ]);
    expect(budgetOverruns({ initial: 2000, total: 5001 }, budget)).toEqual([
      "bundle total : 5001 octets pour un budget de 5000 (+1)",
    ]);
    expect(budgetOverruns({ initial: 2500, total: 6000 }, budget)).toHaveLength(2);
  });

  it("juge par défaut contre le budget du dépôt", () => {
    expect(budgetOverruns({ ...BUNDLE_BUDGET })).toEqual([]);
  });
});

describe("bundleBudgetPlugin", () => {
  // Le crochet tel que Vite l'appelle, réduit à ce qu'il lit : le contexte pour échouer, le bundle.
  type WriteBundle = (
    this: { error: (message: string) => never },
    options: unknown,
    bundle: Record<string, unknown>,
  ) => void;
  const writeBundle = bundleBudgetPlugin().writeBundle as unknown as WriteBundle;
  const context = {
    error: (message: string): never => {
      throw new Error(message);
    },
  };
  const output = (fileName: string, bytes: number, isEntry = false) => ({
    type: "chunk",
    fileName,
    code: "x".repeat(bytes),
    isEntry,
    imports: [],
  });

  it("laisse passer un bundle au budget, assets non comptés", () => {
    const bundle = {
      "index.js": output("index.js", BUNDLE_BUDGET.initial, true),
      "index.css": { type: "asset", fileName: "index.css", source: "x".repeat(10_000_000) },
    };

    expect(() => writeBundle.call(context, {}, bundle)).not.toThrow();
  });

  it("fait échouer le build d'un octet de trop, et nomme le budget dépassé", () => {
    const bundle = { "index.js": output("index.js", BUNDLE_BUDGET.initial + 1, true) };

    expect(() => writeBundle.call(context, {}, bundle)).toThrow(
      `bundle initial : ${BUNDLE_BUDGET.initial + 1} octets pour un budget de ${BUNDLE_BUDGET.initial} (+1)`,
    );
  });
});
