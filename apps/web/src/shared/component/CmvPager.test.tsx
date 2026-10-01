import { pageOf } from "@cmv/shared";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CmvPager } from "./CmvPager";

const ITEMS = Array.from({ length: 12 }, (_, index) => index);

describe("CmvPager", () => {
  it("dit la plage affichée et offre un bouton par page", () => {
    const { getByText, getAllByRole } = render(
      <CmvPager page={pageOf(ITEMS, 2)} rangeLabel="6–10 sur 12" onPage={() => {}} />,
    );

    expect(getByText("6–10 sur 12")).toBeInTheDocument();
    expect(getAllByRole("button").map((button) => button.textContent)).toEqual(["1", "2", "3"]);
  });

  it("distingue la page courante des autres", () => {
    const { getByRole } = render(
      <CmvPager page={pageOf(ITEMS, 2)} rangeLabel="6–10 sur 12" onPage={() => {}} />,
    );

    expect(getByRole("button", { name: "2" }).className).not.toBe(
      getByRole("button", { name: "1" }).className,
    );
  });

  it("rend la page choisie à la table", async () => {
    const onPage = vi.fn();
    const { getByRole } = render(
      <CmvPager page={pageOf(ITEMS, 1)} rangeLabel="1–5 sur 12" onPage={onPage} />,
    );

    await userEvent.click(getByRole("button", { name: "3" }));

    expect(onPage).toHaveBeenCalledWith(3);
  });

  /** Une pagination qui ne pagine rien est du bruit : ni compteur ni boutons. */
  it("ne rend rien sur une seule page", () => {
    const { container } = render(
      <CmvPager page={pageOf(ITEMS.slice(0, 3), 1)} rangeLabel="1–3 sur 3" onPage={() => {}} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
