import type { SessionDto } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { SessionCard } from "./SessionCard";

const MORE = "library.session.more";

const TITLES = ["Tractions", "Gainage", "Suspensions", "Planche"];

const session = (exerciseCount: number, notes: string | null = "Bloc force") =>
  ({
    id: "s-1",
    title: "Force max",
    notes,
    exercises: TITLES.slice(0, exerciseCount).map((title, position) => ({
      id: `se-${position}`,
      position,
      title,
    })),
  }) as unknown as SessionDto;

function setup(value: SessionDto) {
  const onSelect = vi.fn();
  return { ...renderWithProviders(<SessionCard session={value} onSelect={onSelect} />), onSelect };
}

describe("SessionCard", () => {
  it("montre le titre, les consignes et le nombre d'exercices", () => {
    const { getByRole, getByText } = setup(session(1));

    expect(getByRole("heading", { name: "Force max" })).toBeInTheDocument();
    expect(getByText("Bloc force")).toBeInTheDocument();
    expect(getByText("library.session.exerciseCount")).toBeInTheDocument();
  });

  it("montre un tiret quand la séance n'a pas de consignes", () => {
    expect(setup(session(1, null)).getByText("—")).toBeInTheDocument();
  });

  // La carte détaille les deux premiers, numérotés comme dans la séance, puis résume le reste.
  it("détaille les deux premiers exercices, numérotés, et résume les suivants", () => {
    const { getAllByRole, queryByText } = setup(session(4));

    expect(getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "1Tractions",
      "2Gainage",
      MORE,
    ]);
    expect(queryByText("Suspensions")).not.toBeInTheDocument();
  });

  it.each([0, 1, 2])("ne résume rien avec %i exercice(s) : tout tient sur la carte", (count) => {
    const { queryAllByRole, queryByText } = setup(session(count));

    expect(queryByText(MORE)).not.toBeInTheDocument();
    expect(queryAllByRole("listitem")).toHaveLength(count);
  });

  it("remonte la séance ouverte au clic", async () => {
    const value = session(2);
    const { user, getByRole, onSelect } = setup(value);

    await user.click(getByRole("button"));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(value);
  });
});
