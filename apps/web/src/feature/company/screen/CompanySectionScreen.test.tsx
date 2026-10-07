import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { CompanySectionScreen } from "./CompanySectionScreen";

// La coquille a ses propres tests : seul compte ici ce que l'écran y pose.
vi.mock("@/shared/component/CmvAppShell", () => ({
  CmvAppShell: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));

describe("CompanySectionScreen", () => {
  it("dit que la page des athlètes est encore vide", () => {
    const { getByRole, getByText } = render(<CompanySectionScreen section="athletes" />);

    expect(getByRole("heading", { name: "company.athletes.title" })).toBeInTheDocument();
    expect(getByText("company.athletes.empty")).toBeInTheDocument();
  });
});
