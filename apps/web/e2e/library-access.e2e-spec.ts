import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { t } from "./support/i18n";
import { type Account, json, type Seed } from "./support/seed";

/** Un bloc d'une série, dont la seule colonne est une métrique maison de son propriétaire. */
const citing = (customMetricId: string) => [
  {
    id: "blk_grade",
    label: null,
    structure: { type: "SERIES", setCount: 1, restBetweenSetsSeconds: null },
    metrics: [{ id: "col_grade", source: "CUSTOM", customMetricId, label: null, collapsed: false }],
    rows: [{ id: "r1", values: { col_grade: "6b" } }],
  },
];

/**
 * L'entreprise F, ses Coachs C et M. C possède Voie — cotée sur SA métrique « Cotation » —, Dalle,
 * et la séance Grimpe qui compose Voie. Rien n'est encore partagé.
 */
async function sharedLibrary(seed: Seed) {
  const company = await seed.company();
  const c = await seed.coach("Cyril");
  const m = await seed.coach("Maud");
  await seed.join(company, c);
  await seed.join(company, m);

  const grade = await json<{ id: string }>(
    await c.api.post("/custom-metrics", {
      data: { label: "Cotation", unit: null, valueType: "SCALE", scale: ["6a", "6b"] },
    }),
    "métrique de C",
  );
  const voie = await json<{ id: string }>(
    await c.api.post("/exercises", {
      data: { title: "Voie", tags: ["grimpe"], blocks: citing(grade.id) },
    }),
    "Voie",
  );
  const dalle = await json<{ id: string }>(
    await c.api.post("/exercises", { data: { title: "Dalle" } }),
    "Dalle",
  );
  const grimpe = await json<{ id: string }>(
    await c.api.post("/sessions", {
      data: { title: "Grimpe", exercises: [{ exerciseId: voie.id }] },
    }),
    "Grimpe",
  );
  return { company, c, m, voieId: voie.id, dalleId: dalle.id, grimpeId: grimpe.id };
}

/** Les navigateurs ouverts par `pageOf`, que Playwright ne ferme pas de lui-même. */
const contexts: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
});

/**
 * Un navigateur à soi par Coach : deux sessions qui se croisent sur les mêmes éléments. Il hérite
 * de la config (`baseURL`, langue, fuseau), comme celui de la fixture `page`.
 */
async function pageOf(seed: Seed, browser: Browser, account: Account): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  await seed.authenticate(context, account);
  return context.newPage();
}

/** Le droit d'une entreprise dans le panneau des accès ouvert. */
function accessLevel(page: Page, organizationName: string, level: "READ" | "WRITE") {
  const button = page.getByRole("button", {
    name: t(`library.access.level.${level}`),
    exact: true,
  });
  // La plus petite boîte qui porte le nom ET le choix : la ligne de cette entreprise.
  return page
    .getByRole("complementary", { name: t("library.access.title") })
    .locator("div", { hasText: organizationName, has: button })
    .last()
    .locator(button);
}

/** Ouvre le panneau d'UNE ligne, par sa cellule Accès. */
async function openAccessOf(page: Page, title: string) {
  await page.locator("tbody tr", { hasText: title }).getByRole("button").last().click();
}

async function saveAccess(page: Page) {
  await page.getByRole("button", { name: t("library.access.save"), exact: true }).click();
  await expect(page.getByRole("complementary", { name: t("library.access.title") })).toBeHidden();
}

test.describe("Bibliothèque partagée (#606)", () => {
  test("C ouvre ses éléments à F depuis le tableau ; M les lit ou les modifie selon le droit", async ({
    seed,
    browser,
  }) => {
    const world = await sharedLibrary(seed);
    const c = await pageOf(seed, browser, world.c);

    await c.goto("/library");
    await expect(c.getByRole("columnheader", { name: t("library.table.owner") })).toBeVisible();
    // La date porte l'année : une bibliothèque dure plus d'un an.
    await expect(c.locator("tbody tr", { hasText: "Voie" })).toContainText(/20\d\d/);

    // En lot : Voie et Dalle en Lecture.
    await c.getByRole("checkbox", { name: t("library.table.select", { title: "Voie" }) }).check();
    await c.getByRole("checkbox", { name: t("library.table.select", { title: "Dalle" }) }).check();
    await c.getByRole("button", { name: t("library.table.editAccess", { count: 2 }) }).click();
    await accessLevel(c, world.company.name, "READ").click();
    await c
      .getByRole("button", { name: t("library.access.exercise.applyTo", { count: 2 }) })
      .click();
    await expect(c.getByRole("complementary", { name: t("library.access.title") })).toBeHidden();

    // Dalle seule passe en Écriture ; la séance Grimpe s'ouvre en Lecture.
    await openAccessOf(c, "Dalle");
    await accessLevel(c, world.company.name, "WRITE").click();
    await saveAccess(c);
    await c.getByRole("tab", { name: new RegExp(`^${t("library.tabs.sessions")}`) }).click();
    await openAccessOf(c, "Grimpe");
    await accessLevel(c, world.company.name, "READ").click();
    await saveAccess(c);

    const m = await pageOf(seed, browser, world.m);
    await m.goto("/library");
    await m.getByRole("button", { name: t("library.scope.shared"), exact: true }).click();
    await expect(m.locator("tbody tr", { hasText: "Voie" })).toContainText(world.c.name);
    await expect(m.locator("tbody tr", { hasText: "Dalle" })).toContainText(world.c.name);

    // Voie en Lecture : figée, « Fermer » seul, sans rien de ce qui ne sert qu'à éditer. Sa grille
    // reste, et la colonne maison se nomme d'après le catalogue de C.
    await m.getByRole("button", { name: "Voie", exact: true }).click();
    await expect(m.getByText(t("library.builder.readOnly", { owner: world.c.name }))).toBeVisible();
    await expect(m.getByRole("textbox", { name: t("library.builder.titleLabel") })).toBeDisabled();
    await expect(m.getByRole("button", { name: t("common.close"), exact: true })).toBeVisible();
    await expect(m.getByRole("button", { name: t("library.builder.deleteExercise") })).toBeHidden();
    await expect(m.getByRole("columnheader", { name: /Cotation/ })).toBeVisible();
    await expect(m.getByText(t("library.builder.attachment.none"))).toBeVisible();
    await Promise.all(
      [
        m.getByRole("button", { name: t("library.builder.addBlock") }),
        m.getByRole("button", { name: t("library.builder.removeBlock") }),
        m.getByRole("button", { name: t("library.builder.metrics.edit") }),
        m.getByRole("button", { name: `${t("library.tags.remove")} grimpe` }),
        m.getByRole("textbox", { name: t("library.builder.attachment.addLink") }),
        m.getByText(t("library.builder.attachment.add")),
        m.getByText(t("common.requiredLegend")),
        m.getByRole("columnheader", { name: t("library.builder.grid.rowActions") }),
      ].map((control) => expect(control).toBeHidden()),
    );
    // La consigne finit de charger, et ne s'édite pas.
    await expect(m.getByText(t("common.loading"))).toBeHidden();
    await expect(m.locator("[contenteditable]")).toHaveAttribute("contenteditable", "false");
    await m.getByRole("button", { name: t("common.close"), exact: true }).click();
    await expect(m).toHaveURL(/\/library$/);

    // Dalle en Écriture : se modifie, sans suppression.
    await m.goto(`/library/exercises/${world.dalleId}`);
    const title = m.getByRole("textbox", { name: t("library.builder.titleLabel") });
    await expect(title).toBeEnabled();
    await expect(m.getByRole("button", { name: t("library.builder.addBlock") })).toBeVisible();
    await expect(m.getByRole("button", { name: t("library.builder.deleteExercise") })).toBeHidden();
    await title.fill("Dalle lente");
    await m.getByRole("button", { name: t("library.builder.submitEdit"), exact: true }).click();
    await expect(m.getByText(t("library.builder.saved"))).toBeVisible();

    // Grimpe en Lecture : la carte se déplie encore, sa grille sans commande d'édition.
    await m.goto(`/library/sessions/${world.grimpeId}`);
    await expect(m.getByText(t("library.session.readOnly", { owner: world.c.name }))).toBeVisible();
    await expect(m.getByRole("button", { name: t("library.session.cardMenu") })).toBeHidden();
    await expect(m.getByRole("button", { name: t("library.session.pickerTitle") })).toBeHidden();
    const card = m.getByRole("button", { name: "Voie", exact: true });
    await card.click();
    await expect(card).toHaveAttribute("aria-expanded", "true");
    await expect(m.getByRole("columnheader", { name: /Cotation/ })).toBeVisible();
    await expect(m.getByRole("button", { name: t("library.builder.grid.removeRow") })).toBeHidden();
  });

  test("le sélecteur dit à qui est chaque exercice ; la variante reste au propriétaire", async ({
    seed,
    browser,
  }) => {
    const world = await sharedLibrary(seed);
    await json(
      await world.c.api.patch("/exercises/access", {
        data: {
          ids: [world.voieId],
          changes: [{ organizationId: world.company.id, level: "READ" }],
        },
      }),
      "Voie en Lecture pour F",
    );
    await json(await world.m.api.post("/exercises", { data: { title: "Gainage" } }), "Gainage");

    const m = await pageOf(seed, browser, world.m);
    await m.goto("/library/sessions/new");
    await m.getByRole("textbox", { name: t("library.session.titleLabel") }).fill("Séance de M");
    await m.getByRole("button", { name: t("library.session.pickerTitle") }).click();
    await expect(m.getByRole("button", { name: /^Voie/ })).toContainText(world.c.name);

    // Sans « Les miens », « Partagés » reste — verrouillée, elle ne s'éteint pas.
    const shared = m.getByRole("button", { name: t("library.picker.shared"), exact: true });
    await m.getByRole("button", { name: t("library.scope.mine"), exact: true }).click();
    await expect(shared).toHaveAttribute("aria-disabled", "true");
    await expect(m.getByRole("button", { name: /^Gainage/ })).toBeHidden();
    // Ce qui manque parmi les partagés n'est pas à M de le créer.
    await m.getByRole("searchbox").fill("zzz");
    await expect(m.getByText(t("library.noMatch.title", { search: "zzz" }))).toBeVisible();
    await expect(
      m.getByRole("button", { name: t("library.noMatch.create", { search: "zzz" }) }),
    ).toBeHidden();
    await m.getByRole("searchbox").fill("");

    // La Lecture suffit à composer, avec la cotation de C.
    await m.getByRole("button", { name: /^Voie/ }).click();
    await expect(m.getByText("1 série, 6b")).toBeVisible();

    // La variante est refusée AVANT d'enregistrer : la séance ne naît pas pour un geste voué au 403.
    await m.getByRole("button", { name: t("library.session.cardMenu") }).click();
    await m.getByRole("button", { name: t("library.session.duplicate") }).click();
    await expect(
      m.getByText(t("library.session.variantOwnerOnly", { owner: world.c.name })),
    ).toBeVisible();
    await expect(m.getByRole("button", { name: t("library.session.duplicate") })).toBeHidden();
    expect(await json(await world.m.api.get("/sessions?scope=mine"), "séances de M")).toEqual([]);

    // C, propriétaire, la crée depuis sa propre séance.
    const c = await pageOf(seed, browser, world.c);
    await c.goto(`/library/sessions/${world.grimpeId}`);
    await c.getByRole("button", { name: t("library.session.cardMenu") }).click();
    await c.getByRole("button", { name: t("library.session.duplicate") }).click();
    await expect(c.getByRole("textbox", { name: t("library.builder.titleLabel") })).toHaveValue(
      `Voie ${t("library.session.variantSuffix")}`,
    );
  });

  test("une suppression qui trouve l'exercice changé ouvre le bandeau ; rechargé, il se supprime", async ({
    seed,
    browser,
  }) => {
    const world = await sharedLibrary(seed);
    const c = await pageOf(seed, browser, world.c);
    await c.goto(`/library/exercises/${world.dalleId}`);
    const title = c.getByRole("textbox", { name: t("library.builder.titleLabel") });
    await expect(title).toHaveValue("Dalle");

    // Une écriture d'ailleurs, après l'ouverture de l'écran.
    const shown = await json<{ updatedAt: string }>(
      await world.c.api.get(`/exercises/${world.dalleId}`),
      "Dalle affichée",
    );
    await json(
      await world.c.api.patch(`/exercises/${world.dalleId}`, {
        data: { expectedUpdatedAt: shown.updatedAt, title: "Dalle modifiée ailleurs" },
      }),
      "écriture concurrente",
    );

    const remove = async () => {
      await c.getByRole("button", { name: t("library.builder.deleteExercise") }).click();
      await c.getByRole("button", { name: t("common.confirmDelete") }).click();
    };
    await remove();
    await expect(c.getByText(t("library.builder.staleDelete"))).toBeVisible();
    // Dit une fois : le bandeau, pas un second message sous les actions.
    await expect(c.getByText(t("common.staleWrite"))).toBeHidden();

    await c.getByRole("button", { name: t("common.staleReload") }).click();
    await expect(title).toHaveValue("Dalle modifiée ailleurs");
    await remove();
    await expect(c).toHaveURL(/\/library$/);
    await expect(c.getByRole("button", { name: "Voie", exact: true })).toBeVisible();
    await expect(c.getByRole("button", { name: /Dalle/ })).toBeHidden();
  });

  test("sans entreprise, rien ne se partage : ni propriétaire, ni filtre, ni bascule", async ({
    seed,
    browser,
  }) => {
    const x = await seed.coach("Xavier");
    await json(await x.api.post("/exercises", { data: { title: "Pompes" } }), "Pompes");
    const page = await pageOf(seed, browser, x);

    await page.goto("/library");
    await expect(page.getByRole("button", { name: "Pompes", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: t("library.table.owner") })).toBeHidden();
    await expect(
      page.getByRole("button", { name: t("library.scope.shared"), exact: true }),
    ).toBeHidden();

    await page.goto("/library/sessions/new");
    await page.getByRole("button", { name: t("library.session.pickerTitle") }).click();
    await expect(page.getByRole("button", { name: /^Pompes/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: t("library.picker.shared"), exact: true }),
    ).toBeHidden();
  });
});
