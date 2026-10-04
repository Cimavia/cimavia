import type { SessionFeedbackDto } from "@cmv/shared";
import { fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { athleteFeedbackApi } from "@/feature/feedback/api";
import { FeedbackTextSection } from "@/feature/feedback/component/FeedbackTextSection";
import { ApiError } from "@/shared/lib/api";
import { pressButton, renderRn } from "@/test/render";

// Seul l'appel est remplacé : le hook d'écriture et ce qu'il fait au cache restent les VRAIS.
vi.mock("@/feature/feedback/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/feedback/api")>();
  return { ...original, athleteFeedbackApi: { ...original.athleteFeedbackApi, upsert: vi.fn() } };
});

const upsert = vi.mocked(athleteFeedbackApi.upsert);

const feedback = (content: string | null, id = "f-1") =>
  ({
    id,
    scheduledSessionId: "s-1",
    content,
    media: [],
    messages: [],
  }) as unknown as SessionFeedbackDto;

const field = (container: HTMLElement) => {
  const textarea = container.querySelector("textarea");
  if (textarea == null) throw new Error("champ introuvable");
  return textarea;
};

const isClosed = (container: HTMLElement) =>
  container.querySelector('[aria-disabled="true"]') != null;

beforeEach(() => {
  upsert.mockImplementation(async (_, input) => feedback(input.content ?? null));
});

describe("FeedbackTextSection — le champ", () => {
  it("part vide tant qu'aucun débrief n'existe", () => {
    const { container } = renderRn(<FeedbackTextSection sessionId="s-1" feedback={null} />);

    expect(field(container).value).toBe("");
  });

  /** Débrief repris en plusieurs fois : le champ repart de ce qui est déjà enregistré. */
  it("reprend le texte déjà enregistré", () => {
    const { container } = renderRn(
      <FeedbackTextSection sessionId="s-1" feedback={feedback("Bien tenu")} />,
    );

    expect(field(container).value).toBe("Bien tenu");
  });

  it("part vide sur un débrief enregistré sans texte", () => {
    const { container } = renderRn(
      <FeedbackTextSection sessionId="s-1" feedback={feedback(null)} />,
    );

    expect(field(container).value).toBe("");
  });

  /**
   * Une requête d'arrière-plan qui rend le MÊME débrief ne doit pas effacer la frappe en cours.
   */
  it("garde la frappe quand le même débrief revient", () => {
    const { container, rerender } = renderRn(
      <FeedbackTextSection sessionId="s-1" feedback={feedback("Bien tenu")} />,
    );
    fireEvent.change(field(container), { target: { value: "Bien tenu, doigts cuits" } });

    rerender(<FeedbackTextSection sessionId="s-1" feedback={feedback("Bien tenu")} />);

    expect(field(container).value).toBe("Bien tenu, doigts cuits");
  });

  /**
   * #284 : le premier média joint CRÉE le débrief, sans texte. Son identité naît — ce qui
   * réécrivait le champ et effaçait ce que l'athlète venait de taper.
   */
  it("garde la frappe quand un premier média fait naître le débrief", () => {
    const { container, rerender } = renderRn(
      <FeedbackTextSection sessionId="s-1" feedback={null} />,
    );
    fireEvent.change(field(container), { target: { value: "Doigts cuits" } });

    rerender(<FeedbackTextSection sessionId="s-1" feedback={feedback(null)} />);

    expect(field(container).value).toBe("Doigts cuits");
    // Le texte tapé n'est pas celui du débrief créé : il reste à envoyer.
    expect(isClosed(container)).toBe(false);
  });

  it("se recale sur le débrief rechargé tant que rien n'a été tapé", () => {
    const { container, rerender } = renderRn(
      <FeedbackTextSection sessionId="s-1" feedback={null} />,
    );

    rerender(<FeedbackTextSection sessionId="s-1" feedback={feedback("Écrit sur le web")} />);

    expect(field(container).value).toBe("Écrit sur le web");
  });
});

describe("FeedbackTextSection — l'envoi", () => {
  /** « Séance faite, rien à signaler » : un premier débrief vide reste légitime. */
  it("envoie un premier débrief vide comme une absence de texte", async () => {
    const { container } = renderRn(<FeedbackTextSection sessionId="s-1" feedback={null} />);

    pressButton(container, "feedback.save");

    await waitFor(() => expect(upsert).toHaveBeenCalledWith("s-1", { content: null }));
  });

  it("joint le décompte quand la séance l'a fourni", async () => {
    const tracking = { "ex-1": { "b-1": { checked: [0] } } };
    const { container } = renderRn(
      <FeedbackTextSection sessionId="s-1" feedback={null} tracking={tracking} />,
    );
    fireEvent.change(field(container), { target: { value: "Bien tenu" } });

    pressButton(container, "feedback.save");

    await waitFor(() =>
      expect(upsert).toHaveBeenCalledWith("s-1", { content: "Bien tenu", tracking }),
    );
  });

  it("ferme l'enregistrement d'un texte inchangé", () => {
    const { container } = renderRn(
      <FeedbackTextSection sessionId="s-1" feedback={feedback("Bien tenu")} />,
    );

    expect(isClosed(container)).toBe(true);
  });

  /** Le décompte a bougé sur la séance : il y a quelque chose à envoyer, même à texte égal. */
  it("rouvre l'enregistrement quand seul le décompte a changé", () => {
    const { container } = renderRn(
      <FeedbackTextSection sessionId="s-1" feedback={feedback("Bien tenu")} trackingDirty />,
    );

    expect(isClosed(container)).toBe(false);
  });

  it("dit « enregistrement » pendant l'envoi", async () => {
    upsert.mockReturnValue(new Promise(() => undefined));
    const { container, findByText } = renderRn(
      <FeedbackTextSection sessionId="s-1" feedback={null} />,
    );

    pressButton(container, "feedback.save");

    expect(await findByText("feedback.saving")).toBeTruthy();
  });

  it("prévient l'écran de ce qui est parti, sans rien confirmer avant la relecture", async () => {
    const onSaved = vi.fn();
    const { container, queryByText } = renderRn(
      <FeedbackTextSection sessionId="s-1" feedback={null} onSaved={onSaved} />,
    );
    fireEvent.change(field(container), { target: { value: "Bien tenu" } });

    pressButton(container, "feedback.save");

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(undefined));
    // Le débrief enregistré revient par le cache ; tant que l'écran ne l'a pas relu, le champ
    // diffère encore de `feedback` (null) : la confirmation se tait plutôt que de mentir.
    expect(queryByText("feedback.saved")).toBeNull();
  });

  it("confirme l'enregistrement une fois le débrief relu à l'identique", async () => {
    const { container, findByText, rerender } = renderRn(
      <FeedbackTextSection sessionId="s-1" feedback={feedback("Bien tenu")} trackingDirty />,
    );

    pressButton(container, "feedback.save");
    await waitFor(() => expect(upsert).toHaveBeenCalled());
    rerender(<FeedbackTextSection sessionId="s-1" feedback={feedback("Bien tenu")} />);

    expect(await findByText("feedback.saved")).toBeTruthy();
  });

  it("dit le refus de l'API tel qu'elle l'a formulé", async () => {
    upsert.mockRejectedValue(new ApiError(400, "Débrief trop long", null));
    const { container, findByText } = renderRn(
      <FeedbackTextSection sessionId="s-1" feedback={null} />,
    );

    pressButton(container, "feedback.save");

    expect(await findByText("Débrief trop long")).toBeTruthy();
  });

  it("retombe sur l'erreur générique quand la panne n'a pas de message à montrer", async () => {
    upsert.mockRejectedValue(new Error("réseau coupé"));
    const { container, findByText } = renderRn(
      <FeedbackTextSection sessionId="s-1" feedback={null} />,
    );

    pressButton(container, "feedback.save");

    expect(await findByText("feedback.saveError")).toBeTruthy();
  });
});
