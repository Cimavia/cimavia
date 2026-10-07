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
  it.each([
    ["coaches", "company.coaches.title", "company.coaches.empty"],
    ["athletes", "company.athletes.title", "company.athletes.empty"],
  ] as const)("dit que la page %s est encore vide", (section, title, empty) => {
    const { getByRole, getByText } = render(<CompanySectionScreen section={section} />);

    expect(getByRole("heading", { name: title })).toBeInTheDocument();
    expect(getByText(empty)).toBeInTheDocument();
  });
});
