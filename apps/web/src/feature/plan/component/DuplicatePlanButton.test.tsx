import { PLAN_TITLE_MAX_LENGTH } from "@cmv/shared";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DuplicatePlanButton } from "@/feature/plan/component/DuplicatePlanButton";
import { useDuplicatePlan } from "@/feature/plan/hook/usePlans";
import { renderInRoute } from "../../../../test/render";

vi.mock("@/feature/plan/hook/usePlans", () => ({ useDuplicatePlan: vi.fn() }));

const duplicate = vi.fn();
const hookWith = (isPending: boolean) =>
  vi.mocked(useDuplicatePlan).mockReturnValue({
    mutate: duplicate,
    isPending,
  } as unknown as ReturnType<typeof useDuplicatePlan>);

beforeEach(() => {
  vi.clearAllMocks();
  hookWith(false);
});

const PLAN = { id: "pln_1", title: "Bloc force" };

const mount = (props: { isUnsaved?: boolean; isBusy?: boolean; title?: string } = {}) =>
  renderInRoute(
    <DuplicatePlanButton
      plan={{ ...PLAN, title: props.title ?? PLAN.title }}
      isUnsaved={props.isUnsaved ?? false}
      isBusy={props.isBusy ?? false}
    />,
    // La copie s'ouvre sur la même route que sa source, sous un autre identifiant.
    { path: "/plans/$planId", params: { planId: "pln_1" } },
  );

describe("DuplicatePlanButton", () => {
  it("duplique le cycle sous son titre suffixé, et dit ce que fait la copie", async () => {
    const { getByText, getByTitle, user } = await mount();

    expect(getByTitle("plan.duplicate.hint")).toContainElement(
      getByText("plan.duplicate.action").closest("button"),
    );
    await user.click(getByText("plan.duplicate.action"));

    expect(useDuplicatePlan).toHaveBeenCalledWith("pln_1");
    expect(duplicate).toHaveBeenCalledWith(
      { title: "Bloc force plan.duplicate.suffix" },
      expect.anything(),
    );
  });

  it("raccourcit un titre à sa borne plutôt que de se faire refuser", async () => {
    const { getByText, user } = await mount({ title: "a".repeat(PLAN_TITLE_MAX_LENGTH) });

    await user.click(getByText("plan.duplicate.action"));

    const [{ title }] = duplicate.mock.calls[0] as [{ title: string }];
    expect(title.length).toBeLessThanOrEqual(PLAN_TITLE_MAX_LENGTH);
    expect(title.endsWith(" plan.duplicate.suffix")).toBe(true);
  });

  it("ouvre le constructeur de la copie une fois créée", async () => {
    duplicate.mockImplementation((_input, options: { onSuccess: (copy: { id: string }) => void }) =>
      options.onSuccess({ id: "pln_copie" }),
    );
    const { getByText, router, user } = await mount();

    await user.click(getByText("plan.duplicate.action"));

    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/plans/pln_copie"));
  });

  it("laisse sur l'autre cycle le coach parti entre-temps : l'écran reste monté (#5)", async () => {
    let created: (copy: { id: string }) => void = () => {};
    duplicate.mockImplementation((_input, options: { onSuccess: typeof created }) => {
      created = options.onSuccess;
    });
    // Seul `$planId` change : la route garde son écran, et le bouton reçoit l'autre cycle.
    function Switching() {
      const [plan, setPlan] = useState(PLAN);
      return (
        <>
          <DuplicatePlanButton plan={plan} isUnsaved={false} isBusy={false} />
          <button type="button" onClick={() => setPlan({ id: "pln_autre", title: "Autre" })}>
            pln_autre
          </button>
        </>
      );
    }
    const { getByText, router, user } = await renderInRoute(<Switching />, {
      path: "/plans/$planId",
      params: { planId: "pln_1" },
    });

    await user.click(getByText("plan.duplicate.action"));
    await user.click(getByText("pln_autre"));
    created({ id: "pln_copie" });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(router.state.location.pathname).toBe("/plans/pln_1");
  });

  /** La copie part de l'enregistré (#326) : elle ne copierait pas ce que l'écran montre. */
  it("se ferme sur une saisie non enregistrée, et dit pourquoi", async () => {
    const { getByText, getByTitle, user } = await mount({ isUnsaved: true });

    const button = getByText("plan.duplicate.action").closest("button");
    expect(button?.disabled).toBe(true);
    expect(getByTitle("plan.duplicate.unsaved")).toContainElement(button);
    await user.click(getByText("plan.duplicate.action"));
    expect(duplicate).not.toHaveBeenCalled();
  });

  it("se ferme pendant une écriture du builder", async () => {
    const { getByText } = await mount({ isBusy: true });

    expect(getByText("plan.duplicate.action").closest("button")?.disabled).toBe(true);
  });

  it("dit que la copie est en cours, et ne la relance pas", async () => {
    hookWith(true);
    const { getByText } = await mount();

    expect(getByText("plan.duplicate.pending").closest("button")?.disabled).toBe(true);
  });
});
