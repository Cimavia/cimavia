import { requestRecordingPermissionsAsync } from "expo-audio";
import { describe, expect, it, vi } from "vitest";
import { MediaPicker } from "@/feature/feedback/component/MediaPicker";
import { press, pressButton, renderRn } from "@/test/render";

const base = {
  photosLeft: 3,
  videosLeft: 2,
  audiosLeft: 1,
  onAddMedia: vi.fn(),
  onRecordAudio: vi.fn(),
  onRecorderError: vi.fn(),
  isUploading: false,
  progress: 0,
  step: null,
};

/** Le micro de `CmvAudioRecorder` au repos : c'est son icône qui l'identifie, il n'a pas de texte. */
function micButton(container: HTMLElement): Element {
  const icon = container.querySelector('[data-icon="mic-outline"]');
  if (icon?.parentElement == null) throw new Error("micro introuvable");
  return icon.parentElement;
}

describe("MediaPicker", () => {
  it("ferme l'ajout quand photos ET vidéos sont toutes prises", () => {
    const onAddMedia = vi.fn();
    const { container } = renderRn(
      <MediaPicker {...base} photosLeft={0} videosLeft={0} onAddMedia={onAddMedia} />,
    );
    pressButton(container, "feedback.media.addMedia");
    expect(onAddMedia).not.toHaveBeenCalled();
  });

  it("laisse ajouter tant qu'une place reste, fût-elle d'un seul des deux types", () => {
    const onAddMedia = vi.fn();
    const { container } = renderRn(
      <MediaPicker {...base} photosLeft={0} videosLeft={1} onAddMedia={onAddMedia} />,
    );
    pressButton(container, "feedback.media.addMedia");
    expect(onAddMedia).toHaveBeenCalledOnce();
  });

  it("ferme l'ajout pendant un envoi, même s'il reste des places", () => {
    const onAddMedia = vi.fn();
    const { container } = renderRn(<MediaPicker {...base} isUploading onAddMedia={onAddMedia} />);
    pressButton(container, "feedback.media.addMedia");
    expect(onAddMedia).not.toHaveBeenCalled();
  });

  it("ferme l'enregistreur quand le quota audio est épuisé", () => {
    const { container } = renderRn(<MediaPicker {...base} audiosLeft={0} />);
    press(micButton(container));
    expect(requestRecordingPermissionsAsync).not.toHaveBeenCalled();
  });

  it("ouvre l'enregistreur tant qu'une note vocale reste", () => {
    const { container } = renderRn(<MediaPicker {...base} audiosLeft={1} />);
    press(micButton(container));
    expect(requestRecordingPermissionsAsync).toHaveBeenCalledOnce();
  });

  it("ne montre l'avancement que pendant un envoi", () => {
    const { queryByText, rerender } = renderRn(<MediaPicker {...base} progress={40} />);
    expect(queryByText("feedback.media.uploading")).toBeNull();
    rerender(<MediaPicker {...base} isUploading progress={40} />);
    expect(queryByText("feedback.media.uploading")).not.toBeNull();
  });

  it("ne dit le rang du lot que s'il y a un rang à dire", () => {
    const { queryByText, rerender } = renderRn(
      <MediaPicker {...base} isUploading step={{ index: 1, total: 1, fileName: "a.jpg" }} />,
    );
    // « Envoi 1 / 1 » serait du bruit : un lot d'un seul média n'a pas de rang.
    expect(queryByText("feedback.media.batchProgress")).toBeNull();
    rerender(
      <MediaPicker {...base} isUploading step={{ index: 2, total: 3, fileName: "a.jpg" }} />,
    );
    expect(queryByText("feedback.media.batchProgress")).not.toBeNull();
  });
});
