import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "@/feature/message/component/Composer";
import { press, renderRn } from "@/test/render";

const base = {
  onSendText: vi.fn(),
  onPickMedia: vi.fn(),
  onRecordAudio: vi.fn(),
  onMediaError: vi.fn(),
  sending: false,
  mediaBusy: false,
  step: null,
};

/** Les boutons de la barre n'ont que leur icône pour se distinguer. */
function iconButton(container: HTMLElement, name: string): Element | null {
  return container.querySelector(`[data-icon="${name}"]`)?.parentElement ?? null;
}

function type(container: HTMLElement, value: string): void {
  const field = container.querySelector("textarea, input");
  if (field == null) throw new Error("champ de saisie introuvable");
  fireEvent.change(field, { target: { value } });
}

describe("Composer", () => {
  it("n'offre l'envoi qu'une fois quelque chose écrit", () => {
    const { container } = renderRn(<Composer {...base} />);
    expect(iconButton(container, "send")).toBeNull();

    type(container, "salut");

    expect(iconButton(container, "send")).not.toBeNull();
  });

  it("ne prend pas des espaces pour un message", () => {
    const { container } = renderRn(<Composer {...base} />);
    type(container, "   ");
    expect(iconButton(container, "send")).toBeNull();
  });

  it("envoie le texte détouré, puis vide le champ", () => {
    const onSendText = vi.fn();
    const { container } = renderRn(<Composer {...base} onSendText={onSendText} />);

    type(container, "  bien joué  ");
    const send = iconButton(container, "send");
    if (send == null) throw new Error("bouton d'envoi absent");
    press(send);

    expect(onSendText).toHaveBeenCalledWith("bien joué");
    expect(container.querySelector("textarea, input")).toHaveProperty("value", "");
  });

  it("retient l'envoi tant que le précédent part encore", () => {
    const { container } = renderRn(<Composer {...base} sending />);
    type(container, "salut");
    // Le micro reprend la place du bouton d'envoi : rien à presser deux fois.
    expect(iconButton(container, "send")).toBeNull();
    expect(iconButton(container, "mic-outline")).not.toBeNull();
  });

  it("ferme la pièce jointe pendant un envoi de média", () => {
    const onPickMedia = vi.fn();
    const { container } = renderRn(<Composer {...base} mediaBusy onPickMedia={onPickMedia} />);

    const attach = iconButton(container, "add-circle-outline");
    if (attach == null) throw new Error("bouton de pièce jointe absent");
    press(attach);

    expect(onPickMedia).not.toHaveBeenCalled();
  });

  it("ne montre l'avancement que pendant un envoi de média", () => {
    const { queryByText, rerender } = renderRn(<Composer {...base} />);
    expect(queryByText("messages.media.uploading")).toBeNull();
    rerender(<Composer {...base} mediaBusy />);
    expect(queryByText("messages.media.uploading")).not.toBeNull();
  });

  it("ne dit le rang du lot que s'il y a un rang à dire", () => {
    const { queryByText, rerender } = renderRn(
      <Composer {...base} mediaBusy step={{ index: 1, total: 1, fileName: "a.jpg" }} />,
    );
    expect(queryByText("messages.media.batchProgress")).toBeNull();
    expect(queryByText("messages.media.uploading")).not.toBeNull();

    rerender(<Composer {...base} mediaBusy step={{ index: 2, total: 3, fileName: "a.jpg" }} />);

    expect(queryByText("messages.media.batchProgress")).not.toBeNull();
    expect(queryByText("messages.media.uploading")).toBeNull();
  });
});
