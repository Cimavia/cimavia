import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { t } from "./support/i18n";
import { type Account, json, mondayOfThisWeek, type Seed } from "./support/seed";

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
      data: {
        title: "Voie",
        tags: ["grimpe"],
        // Les blocs pour la séance Grimpe, qui la dose encore dans l'ancien modèle (#723).
        blocks: citing(grade.id),
        suggestedMetrics: [{ source: "CUSTOM", customMetricId: grade.id }],
      },
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

/** Un choix du sélecteur d'une ligne : un niveau, ou « Hérité » sur celle d'un Coach (#608). */
type Choice = "NONE" | "READ" | "WRITE" | "INHERITED";

/** Le panneau des accès ouvert. */
const accessPanel = (page: Page) =>
  page.getByRole("complementary", { name: t("library.access.title") });

/**
 * La ligne d'un bénéficiaire — entreprise ou Coach — dans le panneau ouvert, par son nom EXACT :
 * la ligne d'un Coach dit « Coach de F », et un nom cherché comme sous-texte la confondrait avec F.
 */
function accessRow(page: Page, name: string) {
  return accessPanel(page).locator("div.rounded-cmv-md", {
    has: page.getByText(name, { exact: true }),
  });
}

/** Un choix sur la ligne d'un bénéficiaire. */
function accessLevel(page: Page, name: string, choice: Choice) {
  const label =
    choice === "INHERITED" ? t("library.access.inherited") : t(`library.access.level.${choice}`);
  return accessRow(page, name).getByRole("button", { name: label, exact: true });
}

/** Ouvre le panneau d'UNE ligne, par sa cellule Accès. */
async function openAccessOf(page: Page, title: string) {
  await page.locator("tbody tr", { hasText: title }).getByRole("button").last().click();
}

async function saveAccess(page: Page) {
  // Dans le panneau : le builder d'un cycle a son propre « Enregistrer ».
  await accessPanel(page)
    .getByRole("button", { name: t("library.access.save"), exact: true })
    .click();
  await expect(accessPanel(page)).toBeHidden();
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

    // Voie en Lecture : figée, « Fermer » seul, sans rien de ce qui ne sert qu'à éditer. Sa
    // métrique suggérée maison se nomme d'après le catalogue de C (#718).
    await m.getByRole("button", { name: "Voie", exact: true }).click();
    await expect(m.getByText(t("library.builder.readOnly", { owner: world.c.name }))).toBeVisible();
    await expect(m.getByRole("textbox", { name: t("library.builder.titleLabel") })).toBeDisabled();
    await expect(m.getByRole("button", { name: t("common.close"), exact: true })).toBeVisible();
    await expect(m.getByRole("button", { name: t("library.builder.deleteExercise") })).toBeHidden();
    await expect(m.getByRole("listitem").filter({ hasText: "Cotation" }).first()).toBeVisible();
    await expect(m.getByText(t("library.builder.attachment.none"))).toBeVisible();
    await Promise.all(
      [
        m.getByRole("button", { name: t("library.builder.metrics.edit") }),
        m.getByRole("button", { name: `${t("library.tags.remove")} grimpe` }),
        m.getByRole("textbox", { name: t("library.builder.attachment.addLink") }),
        m.getByText(t("library.builder.attachment.add")),
        m.getByText(t("common.requiredLegend")),
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
    await expect(m.getByRole("button", { name: t("library.builder.metrics.edit") })).toBeVisible();
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

  test("le sélecteur dit à qui est chaque exercice ; M en fait une variante à lui (#609)", async ({
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
    // Le propriétaire a sa colonne : il se lit sur la ligne, pas dans le bouton du titre (#653).
    await expect(m.getByRole("row", { name: /^Voie/ })).toContainText(world.c.name);

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

    // La Lecture suffit aussi à la variante (#609) : la séance s'enregistre, puis la variante,
    // à M, s'ouvre — modifiable, la cotation de C adoptée dans le catalogue de M.
    await m.getByRole("button", { name: t("library.session.cardMenu") }).click();
    await m.getByRole("button", { name: t("library.session.duplicate") }).click();
    await expect(m.getByRole("textbox", { name: t("library.builder.titleLabel") })).toHaveValue(
      `Voie ${t("library.session.variantSuffix")}`,
    );
    await expect(m.getByRole("button", { name: t("library.builder.submitEdit") })).toBeVisible();
    await expect(m.getByText(t("library.builder.readOnly", { owner: world.c.name }))).toBeHidden();
    const sessions = await json<{ title: string }[]>(
      await world.m.api.get("/sessions?scope=mine"),
      "séances de M",
    );
    expect(sessions.map((session) => session.title)).toEqual(["Séance de M"]);
    const metrics = await json<{ label: string }[]>(
      await world.m.api.get("/custom-metrics"),
      "métriques de M",
    );
    expect(metrics.map((metric) => metric.label)).toEqual(["Cotation"]);
  });

  test("C supprime un exercice qu'une séance de M cite : prévenu, il le peut ; M garde une copie figée (#609)", async ({
    seed,
    browser,
  }) => {
    const world = await sharedLibrary(seed);
    const bloc = await json<{ id: string }>(
      await world.c.api.post("/exercises", { data: { title: "Bloc", tags: ["grimpe"] } }),
      "Bloc",
    );
    await json(
      await world.c.api.patch("/exercises/access", {
        data: { ids: [bloc.id], changes: [{ organizationId: world.company.id, level: "READ" }] },
      }),
      "Bloc en Lecture pour F",
    );
    const session = await json<{ id: string }>(
      await world.m.api.post("/sessions", {
        data: { title: "Séance de M", exercises: [{ exerciseId: bloc.id }] },
      }),
      "séance de M",
    );

    const c = await pageOf(seed, browser, world.c);
    await c.goto(`/library/exercises/${bloc.id}`);
    await expect(c.getByRole("textbox", { name: t("library.builder.titleLabel") })).toHaveValue(
      "Bloc",
    );
    await c.getByRole("button", { name: t("library.builder.deleteExercise") }).click();
    await expect(c.getByText(t("library.builder.deleteKeepsCopies", { count: 1 }))).toBeVisible();
    await c.getByRole("button", { name: t("common.confirmDelete") }).click();
    await expect(c).toHaveURL(/\/library$/);

    const badge = t("library.frozen.badgeFrom", { owner: world.c.name });
    const m = await pageOf(seed, browser, world.m);
    await m.goto(`/library/sessions/${session.id}`);
    await expect(m.getByRole("button", { name: "Bloc", exact: true })).toBeVisible();
    await expect(m.getByText(badge)).toBeVisible();
    await m.goto("/library");
    await expect(m.getByRole("row", { name: /Bloc/ }).getByText(badge)).toBeVisible();
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

test.describe("Droit d'accès par Coach (#608)", () => {
  test("la ligne de M l'emporte sur F : « Aucun » le ferme, « Écriture » l'ouvre sous F en Lecture", async ({
    seed,
    browser,
  }) => {
    const world = await sharedLibrary(seed);
    const n = await seed.coach("Noe");
    await seed.join(world.company, n);
    const company = world.company.name;
    const c = await pageOf(seed, browser, world.c);

    // M et N en retrait sous F, en « Hérité » : rien n'ouvre Voie, le droit hérité est « Aucun ».
    await c.goto("/library");
    await openAccessOf(c, "Voie");
    for (const coach of [world.m, n]) {
      await expect(accessLevel(c, coach.name, "INHERITED")).toHaveAttribute("aria-pressed", "true");
      await expect(accessRow(c, coach.name)).toContainText(
        t("library.access.coachOf", { organizations: company }),
      );
    }
    await expect(accessPanel(c).getByText(world.c.name, { exact: true })).toBeHidden();

    // F en Écriture : le droit hérité suit à l'instant, avant d'enregistrer.
    await accessLevel(c, company, "WRITE").click();
    const viaF = t("library.access.via", {
      level: t("library.access.level.WRITE"),
      organization: company,
    });
    await expect(accessRow(c, world.m.name)).toContainText(viaF);
    await accessLevel(c, world.m.name, "NONE").click();
    await expect(accessRow(c, world.m.name)).not.toContainText(viaF);
    await saveAccess(c);
    await expect(c.locator("tbody tr", { hasText: "Voie" })).toContainText(
      [
        t("library.access.grant", { name: company, level: t("library.access.level.WRITE") }),
        t("library.access.grant", { name: world.m.name, level: t("library.access.level.NONE") }),
      ].join(", "),
    );

    // M ne voit plus Voie ; N, que F ouvre, la modifie.
    const m = await pageOf(seed, browser, world.m);
    await m.goto("/library");
    await expect(m.getByRole("button", { name: "Dalle", exact: true })).toBeHidden();
    await m.getByRole("button", { name: t("library.scope.shared"), exact: true }).click();
    await expect(m.getByText(t("library.access.exercise.sharedEmpty"))).toBeVisible();
    const nPage = await pageOf(seed, browser, n);
    await nPage.goto(`/library/exercises/${world.voieId}`);
    await expect(
      nPage.getByRole("textbox", { name: t("library.builder.titleLabel") }),
    ).toBeEnabled();

    // F en Lecture, M en Écriture : M modifie, N ne fait plus que lire.
    await c.reload();
    await openAccessOf(c, "Voie");
    await expect(accessLevel(c, world.m.name, "NONE")).toHaveAttribute("aria-pressed", "true");
    await accessLevel(c, company, "READ").click();
    await accessLevel(c, world.m.name, "WRITE").click();
    await saveAccess(c);

    await m.goto(`/library/exercises/${world.voieId}`);
    const title = m.getByRole("textbox", { name: t("library.builder.titleLabel") });
    await title.fill("Voie de M");
    await m.getByRole("button", { name: t("library.builder.submitEdit"), exact: true }).click();
    await expect(m.getByText(t("library.builder.saved"))).toBeVisible();
    await nPage.reload();
    await expect(
      nPage.getByText(t("library.builder.readOnly", { owner: world.c.name })),
    ).toBeVisible();

    // Le panneau de M, en lecture seule, dit son droit sans provenance : il ne le tient pas de F.
    await m.goto("/library");
    await openAccessOf(m, "Voie de M");
    await expect(accessPanel(m)).toContainText(t("library.access.level.WRITE"));
    await expect(accessPanel(m)).not.toContainText(company);
  });

  test("sur un cycle, seuls les Coachs de l'athlète se règlent ; M en Écriture le modifie", async ({
    seed,
    browser,
  }) => {
    const company = await seed.company();
    const c = await seed.coach("Cyril");
    const m = await seed.coach("Maud");
    const n = await seed.coach("Noe");
    for (const coach of [c, m, n]) await seed.join(company, coach);
    const ti = await seed.athlete("Tiago");
    const athleteId = await seed.link(c, ti);
    await seed.link(m, ti);
    const plan = await json<{ id: string }>(
      await c.api.post("/plans", {
        data: {
          athleteId,
          title: "Cycle de TI",
          startDate: mondayOfThisWeek(),
          weeks: [{ type: "TRAINING" }],
        },
      }),
      "cycle de TI",
    );

    const cPage = await pageOf(seed, browser, c);
    await cPage.goto(`/plans/${plan.id}`);
    await cPage.getByRole("button", { name: t("library.access.title"), exact: true }).click();
    // N est de F mais ne suit pas TI : il n'a pas de ligne.
    await expect(accessLevel(cPage, m.name, "INHERITED")).toHaveAttribute("aria-pressed", "true");
    await expect(accessPanel(cPage).getByText(n.name, { exact: true })).toBeHidden();
    await accessLevel(cPage, m.name, "WRITE").click();
    await saveAccess(cPage);

    const mPage = await pageOf(seed, browser, m);
    await mPage.goto(`/plans/${plan.id}`);
    await expect(
      mPage.getByText(
        t("plan.builder.sharedWrite", { owner: c.name, right: t("library.access.level.WRITE") }),
      ),
    ).toBeVisible();
    await mPage.getByLabel(t("plan.header.titleLabel")).fill("Cycle revu par M");
    await mPage.getByRole("button", { name: t("plan.header.submit"), exact: true }).click();
    await expect(mPage.getByRole("heading", { level: 1 })).toContainText("Cycle revu par M");

    // Ce que la ligne de M ouvre, elle l'ouvre à lui seul.
    const nPage = await pageOf(seed, browser, n);
    await nPage.goto(`/plans/${plan.id}`);
    await expect(nPage).toHaveURL(/\/plans$/);
  });
});
