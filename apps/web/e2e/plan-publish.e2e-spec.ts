import { expect, test } from "./support/fixtures";
import { t } from "./support/i18n";
import { upcomingDueDate } from "./support/seed";

test.describe("Créer et diffuser un cycle", () => {
  test("le Coach crée un cycle, l'assigne, le facture et le diffuse ; le statut survit au rechargement", async ({
    context,
    page,
    seed,
  }) => {
    const coach = await seed.coach();
    const athlete = await seed.athlete();
    await seed.link(coach, athlete);
    await seed.authenticate(context, coach);
    const title = `Cycle de ${athlete.name}`;
    // Une séance se planifie depuis une séance-type de la bibliothèque (#720) : elle en prend le titre.
    const sessionTitle = (await seed.sessionType(coach, `Séance de ${athlete.name}`)).title;

    await page.goto("/plans");
    // Sans cycle, le bouton figure deux fois : dans le bandeau et dans l'état vide.
    await page
      .getByRole("button", { name: t("plan.new") })
      .first()
      .click();
    await expect(page).toHaveURL(/\/plans\/[^/]+$/);

    // L'en-tête : le titre et le destinataire, enregistrés ensemble.
    await page.getByLabel(t("plan.header.titleLabel")).fill(title);
    await page.getByLabel(t("plan.header.athlete")).selectOption({ label: athlete.name });
    await page.getByRole("button", { name: t("plan.header.submit"), exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title);

    // Une séance, le premier jour de la première semaine.
    await page
      .getByRole("button", { name: t("plan.week.addSession") })
      .first()
      .click();
    const panel = page.getByRole("complementary", { name: t("plan.session.createTitle") });
    await panel.getByLabel(t("plan.session.template")).selectOption({ label: sessionTitle });
    await panel.getByRole("button", { name: t("plan.session.submit"), exact: true }).click();
    await expect(panel).toBeHidden();
    await expect(page.getByText(sessionTitle)).toBeVisible();

    // La facturation : sans elle, la diffusion reste fermée.
    const publish = page.getByRole("button", { name: t("plan.builder.publish"), exact: true });
    await expect(publish).toBeDisabled();
    await page.getByLabel(t("invoice.billing.amount")).fill("50");
    await page.getByLabel(t("invoice.billing.dueDate")).fill(upcomingDueDate());
    await page.getByRole("button", { name: t("invoice.billing.save"), exact: true }).click();

    await expect(publish).toBeEnabled();
    await publish.click();
    const published = page.getByRole("button", { name: t("plan.builder.published"), exact: true });
    await expect(published).toBeDisabled();
    await expect(page.getByText(t("invoice.billing.issuedHint"))).toBeVisible();

    // Rechargé, l'écran repart de l'API et non du cache : le cycle est bien diffusé côté serveur.
    await page.reload();
    await expect(published).toBeDisabled();
    await expect(page.getByText(sessionTitle)).toBeVisible();

    // Et l'athlète le reçoit : la diffusion a atteint son destinataire, pas seulement l'écran.
    const received = await athlete.api.get("/me/plans");
    expect(received.ok()).toBe(true);
    expect(JSON.stringify(await received.json())).toContain(title);
  });
});
