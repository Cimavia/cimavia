import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { Route as AthletesRoute } from "@/routes/athletes";
import { Route as FeedbacksRoute } from "@/routes/feedbacks";
import { Route as ExerciseNewRoute } from "@/routes/library.exercises.new";
import { Route as SessionEditRoute } from "@/routes/library.sessions.$sessionId";
import { Route as MessagesRoute } from "@/routes/messages";
import { Route as SessionsRoute } from "@/routes/sessions.index";

/**
 * Les `validateSearch` écrits EN LIGNE dans leur route — ceux qu'une fonction exportée porte ont
 * leur propre fichier (`login.test.ts`, `invoices.test.ts`…). `renderInRoute` ne les exécute pas :
 * c'est ici qu'une url tapée à la main, ou restée dans un favori, est lue.
 */
function parse(route: { options: { validateSearch?: unknown } }, search: Record<string, unknown>) {
  return (route.options.validateSearch as (input: Record<string, unknown>) => unknown)(search);
}

describe("paramètres d'url lus en ligne", () => {
  // Une chaîne vide ou un nombre ne désignent rien : ouvrir un volet sur eux ouvrirait le vide.
  it.each([
    [
      { feedback: "f-1", session: "s-1" },
      { feedback: "f-1", session: "s-1" },
    ],
    [
      { feedback: "", session: 42 },
      { feedback: undefined, session: undefined },
    ],
    [{}, { feedback: undefined, session: undefined }],
  ])("/feedbacks lit %j comme %j", (search, expected) => {
    expect(parse(FeedbacksRoute, search)).toStrictEqual(expected);
  });

  it.each([
    [
      { athlete: "a-1", as: "coach" },
      { athlete: "a-1", as: "coach" },
    ],
    [
      { athlete: "", as: "admin" },
      { athlete: undefined, as: undefined },
    ],
    [{ athlete: 7 }, { athlete: undefined, as: undefined }],
  ])("/messages lit %j comme %j", (search, expected) => {
    expect(parse(MessagesRoute, search)).toStrictEqual(expected);
  });

  // Défaut « à venir » : ce que l'athlète vient chercher, c'est ce qu'il a à faire.
  it.each([
    [{ segment: "past" }, { segment: "past" }],
    [{ segment: "upcoming" }, { segment: "upcoming" }],
    [{ segment: "hier" }, { segment: "upcoming" }],
    [{}, { segment: "upcoming" }],
  ])("/sessions lit %j comme %j", (search, expected) => {
    expect(parse(SessionsRoute, search)).toStrictEqual(expected);
  });

  // Des clés absentes et non `title: undefined` : sinon chaque lien devrait passer ce qu'il n'a pas.
  // `session` (#303) : la séance où revenir — une chaîne vide n'en désigne aucune.
  it.each([
    [{ title: "gainage" }, { title: "gainage" }],
    [
      { title: "gainage", session: "s-1" },
      { title: "gainage", session: "s-1" },
    ],
    [{ session: "s-1" }, { session: "s-1" }],
    [{ title: 3, session: "" }, {}],
    [{ session: 1 }, {}],
    [{}, {}],
  ])("/library/exercises/new lit %j comme %j", (search, expected) => {
    expect(parse(ExerciseNewRoute, search)).toStrictEqual(expected);
  });

  // Un exercice à ajouter au retour (#303) : une chaîne vide n'en désigne aucun.
  it.each([
    [{ add: "ex-9" }, { add: "ex-9" }],
    [{ add: "" }, {}],
    [{ add: 9 }, {}],
    [{}, {}],
  ])("/library/sessions/$sessionId lit %j comme %j", (search, expected) => {
    expect(parse(SessionEditRoute, search)).toStrictEqual(expected);
  });
});

describe("/athletes", () => {
  /**
   * Fusionnée avec le tableau de bord (#113), la route survit en redirection : des favoris y
   * mènent encore. `replace` évite de piéger le bouton Retour dans une boucle.
   */
  it("renvoie au tableau de bord, sans filtre et sans laisser d'étape dans l'historique", () => {
    let thrown: unknown;
    try {
      (AthletesRoute.options.beforeLoad as () => void)();
    } catch (error) {
      thrown = error;
    }

    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as { options: unknown }).options).toMatchObject({
      to: "/",
      search: { q: undefined, filter: undefined, athlete: undefined },
      replace: true,
    });
  });
});
