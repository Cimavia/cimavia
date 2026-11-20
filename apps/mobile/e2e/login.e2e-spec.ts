import { loginVars, test } from "./support/fixtures";
import { label } from "./support/i18n";

test.describe("Connexion de l'Athlete", () => {
  test("un visiteur tombe sur la connexion, s'y trompe, puis entre ; la session survit à une relance", async ({
    seed,
    flow,
  }) => {
    const coach = await seed.coach();
    const athlete = await seed.athlete();
    // Un cycle diffusé : c'est son titre, au Planning, qui dit que l'Athlete est entré.
    const plan = await seed.publishedPlan(coach, await seed.link(coach, athlete));

    await flow("login.yaml", {
      ...loginVars(athlete),
      WRONG_PASSWORD: "mauvais-mot-de-passe",
      LOGIN_TITLE: label("auth.login.title"),
      LOGIN_ERROR: label("auth.errors.invalidCredentials"),
      PLAN_TITLE: plan.title,
    });
  });
});
