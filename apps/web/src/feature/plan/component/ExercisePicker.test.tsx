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

function setup() {
  const onPick = vi.fn();
  const view = renderWithProviders(<ExercisePicker exercises={exercises} onPick={onPick} />);
  const titles = () => view.getAllByRole("button").map((button) => button.firstChild?.textContent);
  return { ...view, onPick, titles };
}

describe("ExercisePicker", () => {
  it("titre la liste et propose tout, dans l'ordre reçu", () => {
    const { getByText, titles } = setup();

    expect(getByText("plan.session.pickerTitle")).toBeInTheDocument();
    expect(titles()).toEqual(["Échauffement", "Tractions", "Gainage"]);
  });

  it("montre les tags de chaque exercice", () => {
    expect(setup().getByRole("button", { name: /Échauffement/ })).toHaveTextContent("mobilité");
  });

  // Le panneau de planification s'ouvre sur une séance déjà composée : pas de recherche.
  it("n'a pas de recherche", () => {
    expect(setup().queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("remonte l'exercice choisi", async () => {
    const { user, getByRole, onPick } = setup();

    await user.click(getByRole("button", { name: /Gainage/ }));

    expect(onPick).toHaveBeenCalledExactlyOnceWith(exercises[2]);
  });
});
