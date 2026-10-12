import { expect, test } from "./support/fixtures";
import { t } from "./support/i18n";

test.describe("Lire un débrief", () => {
  test("le débrief envoyé par l'athlète arrive chez le Coach, qui l'ouvre et le marque lu", async ({
    context,
    page,
    seed,
  }) => {
    const coach = await seed.coach();
    const athlete = await seed.athlete();
    const athleteId = await seed.link(coach, athlete);
    const plan = await seed.publishedPlan(coach, athleteId);
    const content = `Bonne séance, épaule un peu sensible — ${athlete.name}`;
    await seed.debrief(athlete, plan.sessionId, content);
    await seed.authenticate(context, coach);

    await page.goto("/feedbacks");

    const item = page.getByRole("button").filter({ hasText: plan.sessionTitle });
    await expect(item.getByText(t("feedback.unread"), { exact: true })).toBeVisible();

    // Ouvrir vaut lecture : on attend que l'API l'ait enregistrée, pas seulement que l'écran l'ait
    // demandée.
    const markedRead = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && /\/feedbacks\/[^/]+\/read$/.test(response.url()),
    );
    await item.click();
    expect((await markedRead).ok()).toBe(true);

    // Le texte de l'athlète, en entier dans le panneau de lecture (la liste n'en montre qu'un
    // aperçu) — et l'url le désigne : un lien partagé rouvre le même débrief.
    await expect(page.getByRole("paragraph").filter({ hasText: content })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("feedback")).not.toBeNull();

    // Revenu sur la boîte SANS débrief ouvert — rien ne peut le marquer lu une seconde fois —, la
    // ligne est toujours là, et plus « à relire ».
    await page.goto("/feedbacks");
    await expect(item).toBeVisible();
    await expect(item.getByText(t("feedback.unread"), { exact: true })).toBeHidden();
  });
});
