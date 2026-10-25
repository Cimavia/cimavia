import { ABOUT_BLANK } from "@cmv/shared";
import { BadRequestException, HttpException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { problemOf, statusOf } from "./problem";
import { ProblemException } from "./problem.exception";

describe("statusOf", () => {
  it("lit le statut d'une HttpException", () => {
    expect(statusOf(new NotFoundException())).toBe(404);
  });

  // Une erreur de Fastify (corps trop gros) n'est pas une HttpException : sans son statusCode, elle
  // serait prise pour un bug et rendue en 500.
  it("lit le statusCode d'une erreur de Fastify", () => {
    expect(statusOf(Object.assign(new Error("trop gros"), { statusCode: 413 }))).toBe(413);
  });

  it.each([
    new TypeError("bug"),
    null,
    "texte",
    Object.assign(new Error("x"), { statusCode: 200 }),
    Object.assign(new Error("x"), { statusCode: "413" }),
  ])("rend 500 pour ce qui n'est pas une erreur HTTP : %s", (exception) => {
    expect(statusOf(exception)).toBe(500);
  });
});

describe("problemOf", () => {
  it("rend about:blank avec le libellé HTTP pour titre et le message pour detail", () => {
    expect(problemOf(new BadRequestException("Refus"), 400, "/x")).toEqual({
      type: ABOUT_BLANK,
      title: "Bad Request",
      status: 400,
      detail: "Refus",
      instance: "/x",
    });
  });

  it("lit le message d'une réponse en objet, ou en liste", () => {
    expect(problemOf(new BadRequestException({ message: "Objet" }), 400).detail).toBe("Objet");
    expect(problemOf(new BadRequestException({ message: ["a", "b"] }), 400).detail).toBe("a, b");
    expect(problemOf(new HttpException({ autre: 1 }, 418), 418).detail).toBeUndefined();
  });

  it("porte le code, le titre et les erreurs d'un ProblemException", () => {
    const errors = [{ detail: "Requis", pointer: "#/title" }];

    expect(problemOf(new ProblemException(400, "urn:x:y", "Titre", "Détail", errors), 400)).toEqual(
      {
        type: "urn:x:y",
        title: "Titre",
        status: 400,
        detail: "Détail",
        errors,
      },
    );
  });

  it("ne reprend pas le message d'une exception imprévue", () => {
    expect(problemOf(new TypeError("secret interne"), 500)).toEqual({
      type: ABOUT_BLANK,
      title: "Internal Server Error",
      status: 500,
    });
  });

  it("blanchit le jeton d'un chemin, dans instance comme dans detail", () => {
    const url = "/me/push-tokens/ExponentPushToken-jeton?token=secret";

    const problem = problemOf(new NotFoundException(`Cannot GET ${url}`), 404, url);

    expect(JSON.stringify(problem)).not.toContain("secret");
    expect(JSON.stringify(problem)).not.toContain("ExponentPushToken-jeton");
  });
});
