import { expect, test } from "./support/fixtures";
import { t } from "./support/i18n";
import { json } from "./support/seed";

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

/**
 * Le cycle de C ouvert à F, dont M est Coach, et suivi par les deux (#610) : chacun lit le débrief à
 * son heure, et la réponse de l'un se voit chez l'autre, nommée.
 */
test.describe("Le débrief d'un cycle partagé", () => {
  test("C voit « répondu par M », et sa lecture laisse le débrief à relire chez M", async ({
    browser,
    page,
    context,
    seed,
  }) => {
    const company = await seed.company();
    const c = await seed.coach("Cyril");
    const m = await seed.coach("Maud");
    await seed.join(company, c);
    await seed.join(company, m);
    const athlete = await seed.athlete();
    const athleteId = await seed.link(c, athlete);
    await seed.link(m, athlete);
    const plan = await seed.publishedPlan(c, athleteId);
    await json(
      await c.api.patch("/plans/access", {
        data: { ids: [plan.planId], changes: [{ organizationId: company.id, level: "READ" }] },
      }),
      "cycle ouvert à F",
    );
    await seed.debrief(athlete, plan.sessionId, `Séance partagée — ${athlete.name}`);

    // M répond depuis son fil avec l'athlète, rattaché au débrief.
    const [feedback] = await json<{ id: string }[]>(await m.api.get("/feedbacks"), "boîte de M");
    const thread = await json<{ id: string }>(
      await m.api.post("/conversations", { data: { athleteId } }),
      "fil de M",
    );
    await json(
      await m.api.post(`/conversations/${thread.id}/messages`, {
        data: { type: "TEXT", content: "Lève le pied", sessionFeedbackId: feedback?.id },
      }),
      "réponse de M",
    );

    await seed.authenticate(context, c);
    await page.goto("/feedbacks");
    const itemOfC = page.getByRole("button").filter({ hasText: plan.sessionTitle });
    await expect(
      itemOfC.getByText(t("feedback.repliedBy", { name: m.name }), { exact: true }),
    ).toBeVisible();

    const markedRead = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && /\/feedbacks\/[^/]+\/read$/.test(response.url()),
    );
    await itemOfC.click();
    expect((await markedRead).ok()).toBe(true);

    // Chez M, rien n'a bougé : le débrief reste à relire, et la réponse est « la sienne ».
    const mContext = await browser.newContext();
    try {
      await seed.authenticate(mContext, m);
      const pageOfM = await mContext.newPage();
      await pageOfM.goto("/feedbacks");
      const itemOfM = pageOfM.getByRole("button").filter({ hasText: plan.sessionTitle });
      await expect(itemOfM.getByText(t("feedback.unread"), { exact: true })).toBeVisible();
      await expect(itemOfM.getByText(t("feedback.replied"), { exact: true })).toBeVisible();
    } finally {
      await mContext.close();
    }
  });
});
