import { expect, test } from "./support/fixtures";
import { t } from "./support/i18n";

test.describe("Facturer", () => {
  test("la facture née de la diffusion se marque payée, et le reste au rechargement", async ({
    context,
    page,
    seed,
  }) => {
    const coach = await seed.coach();
    const athlete = await seed.athlete();
    const athleteId = await seed.link(coach, athlete);
    await seed.publishedPlan(coach, athleteId);
    await seed.authenticate(context, coach);

    await page.goto("/invoices");

    // Les factures se rangent par athlète : sa ligne se déplie sur son historique.
    await page.getByRole("button", { name: athlete.name }).click();
    // La ligne de l'athlète, dépliée, résume elle aussi le montant : la facture est le bouton qui
    // n'est pas un dépliant.
    const invoice = page.locator("button:not([aria-expanded])").filter({ hasText: "50,00" });
    await expect(invoice.getByText(t("invoice.status.pending"), { exact: true })).toBeVisible();
    await invoice.click();

    await page.getByRole("button", { name: t("invoice.markPaid"), exact: true }).click();

    // Réglée, la facture ne propose plus que de revenir en arrière.
    await expect(
      page.getByRole("button", { name: t("invoice.reopen"), exact: true }),
    ).toBeVisible();
    await expect(invoice.getByText(t("invoice.status.paid"), { exact: true })).toBeVisible();

    // L'athlète déplié vit dans l'url : rechargée, la page rouvre son historique toute seule.
    await page.reload();
    await expect(invoice.getByText(t("invoice.status.paid"), { exact: true })).toBeVisible();
  });
});
