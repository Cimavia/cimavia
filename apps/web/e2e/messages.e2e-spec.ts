import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { t } from "./support/i18n";
import { type Account, json } from "./support/seed";

type Seeded = {
  company: Account;
  c: Account;
  m: Account;
  te: Account;
  ti: Account;
};

/** La phase multi-coach (#593) : C et M dans l'entreprise F, M ne suit que TI. */
async function multiCoach(seed: {
  company(label?: string): Promise<Account & { id: string }>;
  coach(label?: string): Promise<Account>;
  athlete(label?: string): Promise<Account>;
  join(company: Account, coach: Account): Promise<void>;
  link(coach: Account, athlete: Account): Promise<string>;
}): Promise<Seeded> {
  const company = await seed.company("F");
  const c = await seed.coach("Cyril");
  const m = await seed.coach("Maud");
  await seed.join(company, c);
  await seed.join(company, m);
  const te = await seed.athlete("Theo");
  const ti = await seed.athlete("Tia");
  await seed.link(c, te);
  await seed.link(c, ti);
  await seed.link(m, ti);
  return { company, c, m, te, ti };
}

/** Une ligne de candidat : son nom ET sa légende — la pastille des choisis ne porte que le nom. */
function candidate(page: Page, name: string, caption: string) {
  return page.getByRole("button").filter({ hasText: name }).filter({ hasText: caption });
}

async function userIdOf(account: Account): Promise<string> {
  const session = await json<{ user: { id: string } }>(
    await account.api.get("/api/auth/get-session"),
    "session",
  );
  return session.user.id;
}

async function openedPage(context: BrowserContext, path: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(path);
  return page;
}

test.describe("Conversations à plusieurs (#612)", () => {
  test("C réunit M, TE et TI ; chacun lit et répond à son heure", async ({
    browser,
    context,
    page,
    seed,
  }) => {
    const { company, c, m, te, ti } = await multiCoach(seed);
    await seed.authenticate(context, c);
    await page.goto("/messages");

    // E2 : C a quelqu'un à réunir, mais aucune conversation encore.
    await expect(page.getByText(t("messages.noConversations.title"))).toBeVisible();
    await page.getByRole("button", { name: t("messages.newConversation") }).click();

    // Les deux sections, celle des coachs titrée de l'entreprise commune.
    await expect(page.getByText(t("messages.new.athletes"), { exact: true })).toBeVisible();
    await expect(
      page.getByText(t("messages.new.coachesOf", { organization: company.name }), { exact: true }),
    ).toBeVisible();
    const create = page.getByRole("button", { name: t("messages.new.create"), exact: true });
    await expect(create).toBeDisabled();

    // La recherche filtre.
    await page.getByRole("searchbox").fill("tia");
    await expect(candidate(page, ti.name, t("messages.capability.athlete"))).toBeVisible();
    await expect(candidate(page, te.name, t("messages.capability.athlete"))).toBeHidden();
    await page.getByRole("searchbox").fill("");

    // Les deux avertissements se cumulent.
    await candidate(page, te.name, t("messages.capability.athlete")).click();
    await candidate(page, ti.name, t("messages.capability.athlete")).click();
    await expect(page.getByText(t("messages.new.athletesWarning"))).toBeVisible();
    await candidate(
      page,
      m.name,
      t("messages.new.ofOrganizations", { organizations: company.name }),
    ).click();
    await expect(
      page.getByText(
        t("messages.new.unfollowedWarning", { count: 1, coach: m.name, athletes: te.name }),
      ),
    ).toBeVisible();

    await expect(create).toBeEnabled();
    await create.click();

    // Le fil s'ouvre par son id, à quatre, encore vide.
    await expect(page).toHaveURL(/[?&]conversation=/);
    const conversationId = new URL(page.url()).searchParams.get("conversation");
    await expect(page.getByText(t("messages.participantCount", { count: 4 }))).toBeVisible();
    await expect(page.getByText(t("messages.empty.title"))).toBeVisible();

    await page.getByPlaceholder(t("messages.placeholder")).fill("Bonjour à tous");
    await page.getByTitle(t("messages.send")).click();
    await expect(
      page.getByText(t("messages.previewSelf", { preview: "Bonjour à tous" })),
    ).toBeVisible();

    // Mêmes participants : la même conversation se rouvre, pas une seconde.
    await page.getByRole("button", { name: t("messages.newConversation") }).click();
    for (const [name, caption] of [
      [te.name, t("messages.capability.athlete")],
      [ti.name, t("messages.capability.athlete")],
      [m.name, t("messages.new.ofOrganizations", { organizations: company.name })],
    ] as const) {
      await candidate(page, name, caption).click();
    }
    await create.click();
    await expect(page).toHaveURL(new RegExp(`conversation=${conversationId}`));
    await expect(
      page.getByText(t("messages.previewSelf", { preview: "Bonjour à tous" })),
    ).toHaveCount(1);

    // TI lit (son écran marque lu), puis répond.
    const tiContext = await browser.newContext();
    try {
      await seed.authenticate(tiContext, ti);
      const tiPage = await openedPage(tiContext, `/messages?conversation=${conversationId}`);
      await expect(tiPage.getByText("Bonjour à tous", { exact: true })).toBeVisible();
      // La bulle reçue, à plusieurs, porte son auteur.
      await expect(tiPage.getByText(c.name).first()).toBeVisible();
      await tiPage.getByPlaceholder(t("messages.placeholder")).fill("Présente demain");
      await tiPage.getByTitle(t("messages.send")).click();
      await expect(
        tiPage.getByText(t("messages.previewSelf", { preview: "Présente demain" })),
      ).toBeVisible();

      // Côté athlète, « Nouvelle conversation » propose ses coachs seuls, sans recherche.
      await tiPage.getByRole("button", { name: t("messages.newConversation") }).click();
      await expect(tiPage.getByText(t("messages.new.myCoaches"), { exact: true })).toBeVisible();
      await expect(tiPage.getByRole("searchbox")).toHaveCount(0);
      await expect(tiPage.getByRole("button").filter({ hasText: c.name }).first()).toBeVisible();
      await expect(tiPage.getByRole("button").filter({ hasText: m.name }).first()).toBeVisible();
    } finally {
      await tiContext.close();
    }

    // Chez C : l'aperçu nomme TI, et « Lu par » suit mon dernier message.
    await page.reload();
    await expect(
      page.getByText(t("messages.previewAuthor", { name: ti.name, preview: "Présente demain" })),
    ).toBeVisible();
    await expect(page.getByText(t("messages.readBy", { names: ti.name }))).toBeVisible();

    // M voit la conversation dans sa liste, sans l'avoir ouverte : non lue.
    const mContext = await browser.newContext();
    try {
      await seed.authenticate(mContext, m);
      const mPage = await openedPage(mContext, "/messages");
      const row = mPage.getByRole("button").filter({
        hasText: t("messages.previewAuthor", { name: ti.name, preview: "Présente demain" }),
      });
      await expect(row).toBeVisible();
      await expect(row.getByText("2", { exact: true })).toBeVisible();
    } finally {
      await mContext.close();
    }

    // Le fil vu par l'API : TE n'a rien lu, TI et C oui.
    const [listed] = await json<{ id: string; unreadCount: number }[]>(
      await te.api.get("/conversations"),
      "liste de TE",
    );
    expect(listed).toMatchObject({ id: conversationId, unreadCount: 2 });
  });

  test("les entrées par personne ouvrent le fil à deux, et un lien périmé n'ouvre rien", async ({
    browser,
    context,
    page,
    seed,
  }) => {
    const { c, m, te, ti } = await multiCoach(seed);
    const teId = await userIdOf(te);
    const cId = await userIdOf(c);

    // Depuis le tableau de suivi : C ouvre le fil à deux avec TE, créé au besoin.
    await seed.authenticate(context, c);
    await page.goto(`/messages?athlete=${teId}`);
    await expect(page).toHaveURL(/[?&]conversation=/);
    await expect(page.getByRole("heading", { name: te.name, exact: true })).toBeVisible();
    await expect(page.getByText(t("messages.capability.athlete"), { exact: true })).toBeVisible();

    // Depuis « Mes coachs » : TI ouvre le fil à deux avec C.
    const tiContext = await browser.newContext();
    try {
      await seed.authenticate(tiContext, ti);
      const tiPage = await openedPage(tiContext, `/messages?coach=${cId}`);
      await expect(tiPage).toHaveURL(/[?&]conversation=/);
      await expect(tiPage.getByRole("heading", { name: c.name, exact: true })).toBeVisible();
    } finally {
      await tiContext.close();
    }

    // M ne suit pas TE : le lien ne mène nulle part, plutôt qu'à un refus de l'API.
    const mContext = await browser.newContext();
    try {
      await seed.authenticate(mContext, m);
      const mPage = await openedPage(mContext, `/messages?athlete=${teId}`);
      await expect(mPage.getByText(t("messages.noConversations.title"))).toBeVisible();
      expect(new URL(mPage.url()).searchParams.get("conversation")).toBeNull();
    } finally {
      await mContext.close();
    }
  });
});
