import { expect, test } from "./support/fixtures";
import { t } from "./support/i18n";
import { PASSWORD } from "./support/seed";

test.describe("Connexion du Coach", () => {
  test("un visiteur est renvoyé au login, puis ramené à la page qu'il demandait", async ({
    page,
    seed,
  }) => {
    const coach = await seed.coach();
    const athlete = await seed.athlete();
    await seed.link(coach, athlete);

    await page.goto("/plans");

    // La garde, et non un écran vide : sans cookie, la page demandée cède la place au login, qui
    // garde en mémoire d'où l'on venait.
    await expect(page.getByRole("heading", { name: t("auth.login.title") })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("redirect")).toContain("/plans");

    await page.getByLabel(t("common.email")).fill(coach.email);
    await page.getByLabel(t("common.password")).fill(PASSWORD);
    await page.getByRole("button", { name: t("auth.login.submit") }).click();

    await expect(page.getByRole("heading", { name: t("plan.title") })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/plans");

    // Le cookie posé par la connexion vaut pour les pages suivantes : l'accueil du Coach liste
    // l'athlète que le jeu de données lui a lié.
    await page.goto("/");
    await expect(page.getByText(athlete.name).first()).toBeVisible();
  });

  test("un mauvais mot de passe laisse sur le login, avec l'erreur", async ({ page, seed }) => {
    const coach = await seed.coach();

    await page.goto("/login");
    await page.getByLabel(t("common.email")).fill(coach.email);
    await page.getByLabel(t("common.password")).fill(`${PASSWORD}-faux`);
    await page.getByRole("button", { name: t("auth.login.submit") }).click();

    await expect(page.getByText(t("auth.errors.invalidCredentials"))).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/login");
  });
});
