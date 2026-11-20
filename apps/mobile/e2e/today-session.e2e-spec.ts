import { todayInParis } from "@cmv/e2e/seed";
import { loginVars, test } from "./support/fixtures";
import { label } from "./support/i18n";
import { runFlow } from "./support/maestro";

test.describe("La séance du jour", () => {
  test("l'Athlete la trouve au Planning et l'ouvre sur son exercice", async ({
    seed,
  }, testInfo) => {
    const coach = await seed.coach();
    const athlete = await seed.athlete();
    const athleteId = await seed.link(coach, athlete);
    const template = await seed.sessionType(coach, `Fractionné ${athlete.name}`);
    const plan = await seed.publishedPlan(coach, athleteId, template, todayInParis());

    await runFlow(testInfo, "today-session.yaml", {
      ...loginVars(athlete),
      SESSION_TITLE: plan.sessionTitle,
      // L'exercice que `sessionType` a créé pour la séance-type, sous ce nom.
      EXERCISE_TITLE: `.*Exercice de ${template.title}`,
      FEEDBACK_OPEN: label("feedback.open"),
    });
  });
});
