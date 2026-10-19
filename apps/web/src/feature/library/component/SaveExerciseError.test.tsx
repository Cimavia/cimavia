import { describe, expect, it } from "vitest";
import { AttachmentFailedError } from "@/feature/library/hook/useSaveExercise";
import { ApiError } from "@/shared/lib/api";
import { renderWithProviders } from "../../../../test/render";
import { SaveExerciseError } from "./SaveExerciseError";

// Le nom du fichier et la raison passent par interpolation, que `cimode` ne rend pas : le hook
// affirme le nom (#649), on affirme ici le message choisi.
describe("SaveExerciseError", () => {
  it("dit qu'un fichier n'a pas pu être joint, plutôt que l'erreur brute d'une panne", () => {
    const outage = new ApiError(502, "Le storage n'a pas pu confirmer la réception", null);
    const { getByText, queryByText } = renderWithProviders(
      <SaveExerciseError error={new AttachmentFailedError("programme.pdf", outage)} />,
    );

    expect(getByText("library.builder.attachment.failed")).toBeInTheDocument();
    expect(queryByText(outage.message)).toBeNull();
  });

  // « Réessaie » ferait tourner le Coach en rond : l'API refuserait encore, pour la même raison.
  it("dit le refus de l'API quand elle en donne la raison", () => {
    const refused = new ApiError(409, "Le fichier envoyé ne correspond pas", null);
    const { getByText } = renderWithProviders(
      <SaveExerciseError error={new AttachmentFailedError("programme.pdf", refused)} />,
    );

    expect(getByText("library.builder.attachment.refused")).toBeInTheDocument();
  });

  it("laisse tout autre échec à la règle commune des formulaires", () => {
    const { getByText } = renderWithProviders(
      <SaveExerciseError error={new ApiError(409, "Exercice utilisé", null)} />,
    );

    expect(getByText("Exercice utilisé")).toBeInTheDocument();
  });
});
