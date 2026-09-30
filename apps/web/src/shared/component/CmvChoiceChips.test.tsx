import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CmvChoiceChips } from "./CmvChoiceChips";

const OPTIONS = [
  { value: "all", label: "Tous" },
  { value: "renfo", label: "renfo" },
] as const;

describe("CmvChoiceChips", () => {
  it("marque le choix courant et remonte celui qu'on touche", async () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <CmvChoiceChips options={OPTIONS} value="all" onChange={onChange} />,
    );

    expect(getByRole("button", { name: "Tous" })).toHaveAttribute("aria-pressed", "true");
    expect(getByRole("button", { name: "renfo" })).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(getByRole("button", { name: "renfo" }));

    expect(onChange).toHaveBeenCalledWith("renfo");
  });

  it("n'écrit un intitulé que s'il en reçoit un", () => {
    const { queryByText, rerender, getByText } = render(
      <CmvChoiceChips options={OPTIONS} value="all" onChange={() => {}} />,
    );
    expect(queryByText("Tag")).toBeNull();

    rerender(<CmvChoiceChips options={OPTIONS} value="all" onChange={() => {}} label="Tag" />);

    expect(getByText("Tag")).toBeInTheDocument();
  });
});
