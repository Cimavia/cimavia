import type { ExerciseDto } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { ExercisePicker } from "./ExercisePicker";

const exercise = (id: string, title: string, tags: string[] = []) =>
  ({ id, title, tags }) as unknown as ExerciseDto;

const exercises = [
  exercise("ex-1", "Échauffement", ["mobilité"]),
  exercise("ex-2", "Tractions"),
  exercise("ex-3", "Gainage"),
];

function setup(searchable?: boolean) {
  const onPick = vi.fn();
  const view = renderWithProviders(
    <ExercisePicker
      exercises={exercises}
      onPick={onPick}
      labelPrefix="plan.session"
      {...(searchable == null ? {} : { searchable })}
    />,
  );
  const titles = () => view.getAllByRole("button").map((button) => button.firstChild?.textContent);
  return { ...view, onPick, titles };
}

describe("ExercisePicker", () => {
  it("titre la liste dans l'espace de clés de son écran, et propose tout", () => {
    const { getByText, titles } = setup();

    expect(getByText("plan.session.pickerTitle")).toBeInTheDocument();
    expect(titles()).toEqual(["Échauffement", "Tractions", "Gainage"]);
  });

  it("montre les tags de chaque exercice", () => {
    expect(setup().getByRole("button", { name: /Échauffement/ })).toHaveTextContent("mobilité");
  });

  // Le panneau de planification s'ouvre sur une séance déjà composée : pas de recherche par défaut.
  it("n'a pas de recherche par défaut", () => {
    expect(setup().queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it.each(["echauf", "ÉCHAUF"])("trouve le titre en tapant « %s »", async (typed) => {
    const { user, getByRole, titles } = setup(true);

    await user.type(getByRole("searchbox", { name: "library.searchLabel" }), typed);

    expect(titles()).toEqual(["Échauffement"]);
  });

  it("repropose tout quand la recherche est vidée", async () => {
    const { user, getByRole, titles } = setup(true);
    const search = getByRole("searchbox", { name: "library.searchLabel" });

    await user.type(search, "trac");
    expect(titles()).toEqual(["Tractions"]);
    await user.clear(search);

    expect(titles()).toEqual(["Échauffement", "Tractions", "Gainage"]);
  });

  it("remonte l'exercice choisi", async () => {
    const { user, getByRole, onPick } = setup();

    await user.click(getByRole("button", { name: /Gainage/ }));

    expect(onPick).toHaveBeenCalledExactlyOnceWith(exercises[2]);
  });
});
