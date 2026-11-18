import { act } from "@testing-library/react";
import { requestRecordingPermissionsAsync } from "expo-audio";
import { describe, expect, it, vi } from "vitest";
import { MediaPicker } from "@/feature/feedback/component/MediaPicker";
import { FEEDBACK_MEDIA_PROFILE } from "@/feature/feedback/constant";
import { CmvAudioRecorder } from "@/shared/component/CmvAudioRecorder";
import { press, pressButton, renderRn } from "@/test/render";

// Le vrai enregistreur, ÉPIÉ : ses props disent ce que le débrief lui confie.
vi.mock("@/shared/component/CmvAudioRecorder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/component/CmvAudioRecorder")>();
  return { ...actual, CmvAudioRecorder: vi.fn(actual.CmvAudioRecorder) };
});

/** Ce que le débrief a passé à l'enregistreur à son dernier rendu. */
function recorderProps() {
  const props = vi.mocked(CmvAudioRecorder).mock.lastCall?.[0];
  if (props == null) throw new Error("enregistreur jamais rendu");
  return props;
}

const base = {
  photosLeft: 3,
  videosLeft: 2,
  audiosLeft: 1,
  onAddMedia: vi.fn(),
  onRecordAudio: vi.fn(),
  onCaptureStart: vi.fn(),
  onRecorderError: vi.fn(),
  isUploading: false,
  progress: 0,
  retry: null,
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

  /** Au plafond, la parole continue dans une note neuve tant que le débrief a de la place (#856). */
  it("confie à l'enregistreur le plafond du débrief et ses places restantes", () => {
    renderRn(<MediaPicker {...base} audiosLeft={2} />);
    expect(recorderProps()).toMatchObject({
      maxDurationSeconds: FEEDBACK_MEDIA_PROFILE.audioMaxDurationSeconds,
      notesLeft: 2,
    });
  });

  it("dit l'arrêt au plafond jusqu'au prochain enregistrement", () => {
    const { queryByText } = renderRn(<MediaPicker {...base} />);
    expect(queryByText("messages.audio.limitReached")).toBeNull();

    act(() => recorderProps().onLimitReached?.());
    expect(queryByText("messages.audio.limitReached")).not.toBeNull();

    act(() => recorderProps().onRecordingChange?.(true));
    expect(queryByText("messages.audio.limitReached")).toBeNull();
  });

  // #858 : l'écran efface ses erreurs au début d'une capture, pas à chaque note — une note relayée
  // ne passe pas par là. La fin de capture, elle, n'efface rien non plus.
  it("prévient l'écran au début d'une capture, et seulement là", () => {
    const onCaptureStart = vi.fn();
    renderRn(<MediaPicker {...base} onCaptureStart={onCaptureStart} />);

    act(() => recorderProps().onRecordingChange?.(false));
    expect(onCaptureStart).not.toHaveBeenCalled();

    act(() => recorderProps().onRecordingChange?.(true));
    expect(onCaptureStart).toHaveBeenCalledOnce();
  });

  it("ne montre l'avancement que pendant un envoi", () => {
    const { queryByText, rerender } = renderRn(<MediaPicker {...base} progress={40} />);
    expect(queryByText("feedback.media.uploading")).toBeNull();
    rerender(<MediaPicker {...base} isUploading progress={40} />);
    expect(queryByText("feedback.media.uploading")).not.toBeNull();
  });

  /**
   * Un réessai PREND la place du pourcentage : c'est lui qui explique pourquoi la barre n'avance
   * plus. Les laisser tous les deux ferait lire « 40 % » comme un envoi qui progresse, alors que
   * c'est précisément ce qui n'arrive plus.
   */
  it("remplace l'avancement par l'avis de reprise quand une part est réessayée", () => {
    const { queryByText } = renderRn(
      <MediaPicker {...base} isUploading progress={40} retry={{ attempt: 2, maxAttempts: 6 }} />,
    );

    expect(queryByText("feedback.media.retrying")).not.toBeNull();
    expect(queryByText("feedback.media.uploading")).toBeNull();
  });

  it("ne dit le rang du lot que s'il y a un rang à dire", () => {
    const { queryByText, rerender } = renderRn(
      <MediaPicker
        {...base}
        isUploading
        step={{ index: 1, total: 1, fileName: "a.jpg", continuesBatch: false }}
      />,
    );
    // « Envoi 1 / 1 » serait du bruit : un lot d'un seul média n'a pas de rang.
    expect(queryByText("feedback.media.batchProgress")).toBeNull();
    rerender(
      <MediaPicker
        {...base}
        isUploading
        step={{ index: 2, total: 3, fileName: "a.jpg", continuesBatch: true }}
      />,
    );
    expect(queryByText("feedback.media.batchProgress")).not.toBeNull();
  });
});
