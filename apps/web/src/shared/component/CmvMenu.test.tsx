import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { CmvMenu } from "./CmvMenu";

function setup() {
  const onDuplicate = vi.fn();
  const onRemove = vi.fn();
  const view = renderWithProviders(
    <>
      <CmvMenu
        label="Actions du bloc A"
        groups={[
          [
            { label: "Dupliquer", hint: "La copie arrive juste après A.", onSelect: onDuplicate },
            { label: "Sortir", onSelect: vi.fn(), disabled: true },
          ],
          [{ label: "Supprimer", onSelect: onRemove, danger: true }],
        ]}
      />
      <p>Ailleurs</p>
    </>,
  );
  return { ...view, onDuplicate, onRemove };
}

describe("CmvMenu", () => {
  it("s'ouvre sur ses gestes, et en joue un en se refermant", async () => {
    const { user, getByRole, queryByRole, getByText, onDuplicate } = setup();
    expect(queryByRole("menu")).not.toBeInTheDocument();

    await user.click(getByRole("button", { name: "Actions du bloc A" }));
    expect(getByRole("menu", { name: "Actions du bloc A" })).toBeInTheDocument();
    expect(getByText("La copie arrive juste après A.")).toBeInTheDocument();
    expect(getByRole("menuitem", { name: "Sortir" })).toBeDisabled();

    await user.click(getByRole("menuitem", { name: /Dupliquer/ }));
    expect(onDuplicate).toHaveBeenCalledOnce();
    expect(queryByRole("menu")).not.toBeInTheDocument();
  });

  it("les flèches passent d'un geste ouvert à l'autre, et Échap referme sur le bouton", async () => {
    const { user, getByRole, queryByRole } = setup();
    await user.click(getByRole("button", { name: "Actions du bloc A" }));
    expect(getByRole("menuitem", { name: /Dupliquer/ })).toHaveFocus();

    // « Sortir » est fermé : la flèche le saute.
    await user.keyboard("{ArrowDown}");
    expect(getByRole("menuitem", { name: "Supprimer" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(getByRole("menuitem", { name: /Dupliquer/ })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(getByRole("menuitem", { name: "Supprimer" })).toHaveFocus();
    // Une autre touche ne fait rien.
    await user.keyboard("a");
    expect(getByRole("menuitem", { name: "Supprimer" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(queryByRole("menu")).not.toBeInTheDocument();
    expect(getByRole("button", { name: "Actions du bloc A" })).toHaveFocus();
  });

  it("un clic ailleurs le referme, un second clic sur le bouton aussi", async () => {
    const { user, getByRole, queryByRole, getByText } = setup();
    const trigger = getByRole("button", { name: "Actions du bloc A" });
    await user.click(trigger);
    await user.click(getByRole("menu"));
    expect(getByRole("menu")).toBeInTheDocument();
    await user.click(getByText("Ailleurs"));
    expect(queryByRole("menu")).not.toBeInTheDocument();

    await user.click(trigger);
    await user.click(trigger);
    expect(queryByRole("menu")).not.toBeInTheDocument();
  });
});
