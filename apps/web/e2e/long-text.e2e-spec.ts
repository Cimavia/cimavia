import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { t } from "./support/i18n";
import { json, seriesOf } from "./support/seed";

/**
 * Un mot sans espace plus large que sa colonne (#584). Le cas réaliste est une URL collée ; le
 * jeton qui la termine dépasse à lui seul 360 px, sans tiret ni barre où le navigateur couperait.
 */
const link = (path: string) => `https://exemple.test/${path}?id=${"a1B2c3D4e5".repeat(12)}`;
const INSTRUCTIONS = link("consigne");
const BLOCK_INSTRUCTIONS = link("bloc");
const NOTE = link("note");
const SESSION_NOTES = link("seance");
/** Un titre d'exercice d'un seul tenant : borné en longueur, il dépasse quand même 360 px. */
const TITLE = "Tractionslesteesaugiletdedixkilosavecpausedetroissecondesenpositionhaute";
/** Le libellé d'un bloc, à sa longueur maximale (60). */
const LABEL = "Echauffementarticulairecompletepaulescoudespoignetsethanches";

/** Deux colonnes, l'aperçu à droite ; puis une seule, où une grille `auto` suit son contenu. */
const WIDTHS = [1440, 768];

/**
 * Chaque occurrence du texte tient dans sa boîte — ou y est abrégée —, chaque boîte dans l'écran,
 * et la page ne défile pas de côté. jsdom ne calcule aucune mise en page : seul un vrai navigateur
 * le dit.
 */
async function expectWrapped(page: Page, texts: readonly Locator[]) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const text of texts) {
      await expect(text.first()).toBeVisible();
      const boxes = await text.evaluateAll((elements) =>
        elements.map((element) => ({
          // L'élément fautif, nommé dans l'échec : le texte cherché se trouve à plusieurs endroits.
          element: `<${element.tagName.toLowerCase()} class="${element.className}">`,
          // Un `truncate` coupe exprès ce qui dépasse : il ne déborde pas, il abrège.
          overflow:
            getComputedStyle(element).overflowX === "visible"
              ? element.scrollWidth - element.clientWidth
              : 0,
          right: element.getBoundingClientRect().right,
        })),
      );
      for (const box of boxes) {
        expect(box.overflow, `${box.element} : le texte sort de sa boîte à ${width} px`).toBe(0);
        expect(box.right, `${box.element} sort de l'écran à ${width} px`).toBeLessThanOrEqual(
          width,
        );
      }
    }
    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(pageOverflow, `la page défile à l'horizontale à ${width} px`).toBe(0);
  }
}

test.describe("Un mot sans espace passe à la ligne (#584)", () => {
  test("dans les deux aperçus du Coach et sur la séance de l'athlète", async ({
    browser,
    context,
    page,
    seed,
  }) => {
    const coach = await seed.coach();
    const athlete = await seed.athlete();
    const athleteId = await seed.link(coach, athlete);
    const exercise = await json<{ id: string }>(
      await coach.api.post("/exercises", {
        data: {
          title: TITLE,
          instructions: [{ type: "PARAGRAPH", content: [{ text: INSTRUCTIONS }] }],
        },
      }),
      "exercice à la consigne longue",
    );
    // Un bloc numéroté d'un exercice, puis un bloc à libellé de deux : l'en-tête de bloc et celui
    // d'exercice ne rendent pas le titre au même endroit dans la composition.
    const blocks = seriesOf(exercise.id).flatMap((block) => [
      {
        ...block,
        instructions: BLOCK_INSTRUCTIONS,
        exercises: block.exercises.map((row) => ({ ...row, note: NOTE })),
      },
      {
        ...block,
        id: "blk_label",
        label: LABEL,
        exercises: ["key_a", "key_b"].map((key) => ({ ...block.exercises[0], key })),
      },
    ]);
    const session = await json<{ id: string; title: string }>(
      await coach.api.post("/sessions", {
        data: { title: "Séance aux liens", notes: SESSION_NOTES, blocks },
      }),
      "séance aux liens",
    );
    const plan = await seed.publishedPlan(coach, athleteId, session);
    await seed.authenticate(context, coach);

    // Tout l'écran, pas seulement l'aperçu : la consigne s'y lit aussi dans l'éditeur.
    await page.goto(`/library/exercises/${exercise.id}`);
    await expect(
      page.getByRole("complementary", { name: t("library.builder.previewTitle") }),
    ).toBeVisible();
    const builder = page.getByRole("main");
    await expectWrapped(page, [builder.getByText(TITLE), builder.getByText(INSTRUCTIONS)]);

    // La composition comme l'aperçu : l'une et l'autre rendent les titres et le libellé.
    await page.goto(`/library/sessions/${session.id}`);
    await expect(
      page.getByRole("complementary", { name: t("library.session.blocks.previewTitle") }),
    ).toBeVisible();
    const composer = page.getByRole("main");
    await expectWrapped(
      page,
      [TITLE, LABEL, BLOCK_INSTRUCTIONS, NOTE].map((text) => composer.getByText(text)),
    );

    const athleteContext = await browser.newContext();
    try {
      await seed.authenticate(athleteContext, athlete);
      const athletePage = await athleteContext.newPage();
      await athletePage.goto(`/sessions/${plan.sessionId}`);
      const main = athletePage.getByRole("main");
      await expectWrapped(
        athletePage,
        [TITLE, LABEL, INSTRUCTIONS, BLOCK_INSTRUCTIONS, NOTE, SESSION_NOTES].map((text) =>
          main.getByText(text),
        ),
      );
    } finally {
      await athleteContext.close();
    }
  });
});
