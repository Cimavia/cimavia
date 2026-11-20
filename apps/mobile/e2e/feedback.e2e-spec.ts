import { todayInParis } from "@cmv/e2e/seed";
import { expect, loginVars, test } from "./support/fixtures";
import { label } from "./support/i18n";
import { runFlow } from "./support/maestro";

test.describe("Débriefer une séance", () => {
  test("le débrief écrit sur le téléphone arrive chez le Coach", async ({ seed }, testInfo) => {
    const coach = await seed.coach();
    const athlete = await seed.athlete();
    const athleteId = await seed.link(coach, athlete);
    const plan = await seed.publishedPlan(coach, athleteId, undefined, todayInParis());
    // Sans accent : `inputText` de Maestro ne tape que de l'ASCII sur Android.
    const content = `Jambes lourdes sur la fin ${athlete.name}`;

    await runFlow(testInfo, "feedback.yaml", {
      ...loginVars(athlete),
      SESSION_TITLE: plan.sessionTitle,
      FEEDBACK_OPEN: label("feedback.open"),
      FEEDBACK_PLACEHOLDER: label("feedback.contentPlaceholder"),
      FEEDBACK_TEXT: content,
      FEEDBACK_SAVE: label("feedback.save"),
      FEEDBACK_SAVED: label("feedback.saved"),
    });

    const response = await coach.api.get(`/scheduled-sessions/${plan.sessionId}/feedback`);
    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({ content });
  });
});
