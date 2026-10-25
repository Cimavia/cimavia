import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { shouldReportQueryError } from "./report-query-error.util";

const written = (status: number) => new ApiError(status, "Refus", null, true);
const unwritten = (status: number) => new ApiError(status, `Erreur ${status}`, null, false);

describe("shouldReportQueryError", () => {
  describe("en ligne", () => {
    it.each([
      400, 403, 404, 409, 422, 500, 503,
    ])("ne reprend pas le %i que l'API a écrit : elle l'a déjà capturé (#697)", (status) => {
      expect(shouldReportQueryError(written(status), true)).toBe(false);
    });

    it.each([
      200, 404, 502, 503,
    ])("signale le %i que l'API n'a pas écrit (proxy, portail captif, corps illisible)", (status) => {
      expect(shouldReportQueryError(unwritten(status), true)).toBe(true);
    });

    it("signale une panne réseau alors que l'appareil se croit en ligne", () => {
      expect(shouldReportQueryError(new TypeError("Failed to fetch"), true)).toBe(true);
    });

    it("signale un bug du client : une exception dans un queryFn ou un select", () => {
      expect(shouldReportQueryError(new Error("x is undefined"), true)).toBe(true);
    });

    it("signale une valeur levée qui n'est pas une Error", () => {
      expect(shouldReportQueryError("boom", true)).toBe(true);
      expect(shouldReportQueryError(null, true)).toBe(true);
    });

    it("ne signale jamais un 401, écrit par l'API ou non : la session perdue est traitée à part", () => {
      expect(shouldReportQueryError(written(401), true)).toBe(false);
      expect(shouldReportQueryError(unwritten(401), true)).toBe(false);
    });
  });

  describe("hors-ligne", () => {
    it.each([
      ["une panne réseau", new TypeError("Network request failed")],
      ["une réponse que l'API n'a pas écrite", unwritten(502)],
      ["une réponse que l'API a écrite", written(500)],
      ["une exception du client", new Error("x is undefined")],
    ])("ne signale rien : %s", (_cas, error) => {
      expect(shouldReportQueryError(error, false)).toBe(false);
    });
  });
});
