import { expect, loginVars, test } from "./support/fixtures";
import { label } from "./support/i18n";

test.describe("Messagerie", () => {
  test("l'Athlete lit le message de son Coach et y répond", async ({ seed, flow }) => {
    const coach = await seed.coach();
    const athlete = await seed.athlete();
    const athleteId = await seed.link(coach, athlete);
    const question = `Pret pour demain ${athlete.name} ?`;
    const conversationId = await seed.message(coach, athleteId, question);
    // Sans accent : `inputText` de Maestro ne tape que de l'ASCII sur Android.
    const reply = `Oui coach ${athlete.name}`;

    await flow("messages.yaml", {
      ...loginVars(athlete),
      MESSAGES_TAB: label("nav.messages"),
      COACH_NAME: coach.name,
      COACH_MESSAGE: question,
      COMPOSER_PLACEHOLDER: label("messages.placeholder"),
      REPLY: reply,
      SEND: label("messages.send"),
    });

    const response = await coach.api.get(`/conversations/${conversationId}/messages`);
    expect(response.ok()).toBe(true);
    expect(JSON.stringify(await response.json())).toContain(reply);
  });
});
