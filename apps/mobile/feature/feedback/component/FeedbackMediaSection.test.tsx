import { MediaType, type SessionFeedbackDto } from "@cmv/shared";
import { waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackMediaSection } from "@/feature/feedback/component/FeedbackMediaSection";
import {
  pickFeedbackAssets,
  useAddFeedbackAudio,
  useAddFeedbackMedia,
  useDeleteFeedbackMedia,
} from "@/feature/feedback/hook/useFeedbackMedia";
import { MediaRejectedError } from "@/feature/feedback/util/media.util";
import { CmvButton, type RecordedAudio } from "@/shared/component";
import { ApiError } from "@/shared/lib/api";
import { press, pressButton, renderRn } from "@/test/render";

/**
 * Les trois hooks sont remplacés : leur transport (permission, compression, URL signée, upload) a
 * ses propres tests dans `useFeedbackMedia.test.tsx`. Ce qui s'éprouve ICI est ce que la section
 * ajoute par-dessus — la préséance des messages d'erreur, le récapitulatif d'un lot partiel, et ce
 * qu'elle transmet au `MediaPicker`.
 */
vi.mock("@/feature/feedback/hook/useFeedbackMedia", () => ({
  pickFeedbackAssets: vi.fn(),
  useAddFeedbackMedia: vi.fn(),
  useAddFeedbackAudio: vi.fn(),
  useDeleteFeedbackMedia: vi.fn(),
}));

const addAssets = vi.fn();

beforeEach(() => {
  addAssets.mockResolvedValue([]);
  vi.mocked(useAddFeedbackMedia).mockReturnValue({
    addAssets,
    isUploading: false,
    step: null,
    progress: 0,
  } as unknown as ReturnType<typeof useAddFeedbackMedia>);
  vi.mocked(useAddFeedbackAudio).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    error: null,
    progress: 0,
  } as unknown as ReturnType<typeof useAddFeedbackAudio>);
  vi.mocked(useDeleteFeedbackMedia).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useDeleteFeedbackMedia>);
});

/**
 * Seul `CmvAudioRecorder` est remplacé, par un bouton qui rend un audio tout fait. Le vrai a
 * besoin d'un micro : `useAudioRecorderState` ne peut pas basculer en enregistrement sous un
 * runtime sans pont natif, donc `onRecorded` serait hors d'atteinte. Ce qui s'éprouve ici est ce
 * que la SECTION fait d'une note vocale rendue, pas la façon dont le micro la produit.
 */
vi.mock("@/shared/component", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CmvAudioRecorder: ({ onRecorded }: { onRecorded: (audio: RecordedAudio) => void }) => (
    <CmvButton
      label="enregistrer"
      onPress={() => onRecorded({ uri: "file:///note.m4a", durationSeconds: 3 })}
    />
  ),
}));

/** Un débrief sans média : les quotas partent alors du maximum. */
const emptyFeedback = { id: "fb-1", media: [] } as unknown as SessionFeedbackDto;

/** Deux photos rattachées — de quoi vérifier que c'est bien LA tuile pressée qui part. */
const twoPhotos = {
  id: "fb-1",
  media: [
    { id: "p-1", type: MediaType.IMAGE, url: "https://x/1.jpg", durationSeconds: null },
    { id: "p-2", type: MediaType.IMAGE, url: "https://x/2.jpg", durationSeconds: null },
  ],
} as unknown as SessionFeedbackDto;

/** Un débrief dont les 20 photos et les 10 vidéos sont prises. */
const fullFeedback = {
  id: "fb-1",
  media: [
    ...Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, type: MediaType.IMAGE })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `v${i}`, type: MediaType.VIDEO })),
  ],
} as unknown as SessionFeedbackDto;

describe("FeedbackMediaSection", () => {
  it("dit le refus de la galerie sans rien envoyer", async () => {
    vi.mocked(pickFeedbackAssets).mockRejectedValue(
      new MediaRejectedError("feedback.media.permission"),
    );
    const { container, findByText } = renderRn(
      <FeedbackMediaSection sessionId="ss-1" feedback={emptyFeedback} />,
    );

    pressButton(container, "feedback.media.addMedia");

    expect(await findByText("feedback.media.permission")).toBeTruthy();
    expect(addAssets).not.toHaveBeenCalled();
  });

  it("retombe sur le message générique quand le refus n'est pas métier", async () => {
    vi.mocked(pickFeedbackAssets).mockRejectedValue(new Error("boom"));
    const { container, findByText } = renderRn(
      <FeedbackMediaSection sessionId="ss-1" feedback={emptyFeedback} />,
    );

    pressButton(container, "feedback.media.addMedia");

    expect(await findByText("feedback.media.uploadError")).toBeTruthy();
  });

  it("ne dit RIEN quand la sélection est annulée — ce n'est pas une erreur", async () => {
    vi.mocked(pickFeedbackAssets).mockResolvedValue([]);
    const { container, queryByText } = renderRn(
      <FeedbackMediaSection sessionId="ss-1" feedback={emptyFeedback} />,
    );

    pressButton(container, "feedback.media.addMedia");

    await waitFor(() => {
      expect(vi.mocked(pickFeedbackAssets)).toHaveBeenCalled();
    });
    expect(queryByText("feedback.media.uploadError")).toBeNull();
    expect(addAssets).not.toHaveBeenCalled();
  });

  it("liste média par média ce qui n'a pas été joint", async () => {
    vi.mocked(pickFeedbackAssets).mockResolvedValue([{ uri: "file:///a.jpg" }] as never);
    addAssets.mockResolvedValue([
      {
        id: "0",
        fileName: "trop-lourde.mp4",
        reason: { key: "feedback.media.videoTooBig", params: {} },
      },
      { id: "1", fileName: null, reason: { message: "le serveur a refusé ce fichier" } },
    ]);
    const { container, findByText } = renderRn(
      <FeedbackMediaSection sessionId="ss-1" feedback={emptyFeedback} />,
    );

    pressButton(container, "feedback.media.addMedia");

    expect(await findByText(/trop-lourde\.mp4/)).toBeTruthy();
    // Un média sans nom garde sa ligne : c'est le libellé qui manque, pas le refus.
    expect(await findByText(/le serveur a refusé ce fichier/)).toBeTruthy();
  });

  it("borne le lot aux places restantes, tous types confondus", async () => {
    vi.mocked(pickFeedbackAssets).mockResolvedValue([]);
    const { container } = renderRn(
      <FeedbackMediaSection sessionId="ss-1" feedback={emptyFeedback} />,
    );

    pressButton(container, "feedback.media.addMedia");

    // 20 photos + 10 vidéos : la galerie ne doit pas laisser en choisir davantage.
    await waitFor(() => {
      expect(vi.mocked(pickFeedbackAssets)).toHaveBeenCalledWith(30);
    });
  });

  it("ferme l'ajout quand les quotas photo et vidéo sont épuisés", () => {
    const { container } = renderRn(
      <FeedbackMediaSection sessionId="ss-1" feedback={fullFeedback} />,
    );

    pressButton(container, "feedback.media.addMedia");

    expect(vi.mocked(pickFeedbackAssets)).not.toHaveBeenCalled();
  });

  it("garde le message de l'API quand la panne est technique", () => {
    vi.mocked(useAddFeedbackAudio).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      error: new ApiError(500, "le serveur a refusé ce fichier", null),
      progress: 0,
    } as unknown as ReturnType<typeof useAddFeedbackAudio>);

    const { queryByText } = renderRn(
      <FeedbackMediaSection sessionId="ss-1" feedback={emptyFeedback} />,
    );

    // Un refus métier porte sa clé i18n ; une panne technique garde le message du serveur.
    expect(queryByText("le serveur a refusé ce fichier")).not.toBeNull();
  });

  it("dit la clé du refus quand l'échec vient d'une règle métier", () => {
    vi.mocked(useDeleteFeedbackMedia).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      error: new MediaRejectedError("feedback.media.videoTooBig"),
    } as unknown as ReturnType<typeof useDeleteFeedbackMedia>);

    const { queryByText } = renderRn(
      <FeedbackMediaSection sessionId="ss-1" feedback={emptyFeedback} />,
    );

    expect(queryByText("feedback.media.videoTooBig")).not.toBeNull();
  });

  it("rattache la note vocale que l'enregistreur lui rend", () => {
    const mutate = vi.fn();
    vi.mocked(useAddFeedbackAudio).mockReturnValue({
      mutate,
      isPending: false,
      error: null,
      progress: 0,
    } as unknown as ReturnType<typeof useAddFeedbackAudio>);
    const { container } = renderRn(
      <FeedbackMediaSection sessionId="ss-1" feedback={emptyFeedback} />,
    );

    pressButton(container, "enregistrer");

    expect(mutate).toHaveBeenCalledWith({ uri: "file:///note.m4a", durationSeconds: 3 });
  });

  it("efface le refus de la galerie quand la note vocale, elle, passe", async () => {
    const mutate = vi.fn();
    vi.mocked(useAddFeedbackAudio).mockReturnValue({
      mutate,
      isPending: false,
      error: null,
      progress: 0,
    } as unknown as ReturnType<typeof useAddFeedbackAudio>);
    vi.mocked(pickFeedbackAssets).mockRejectedValue(
      new MediaRejectedError("feedback.media.permission"),
    );
    const { container, findByText, queryByText } = renderRn(
      <FeedbackMediaSection sessionId="ss-1" feedback={emptyFeedback} />,
    );
    pressButton(container, "feedback.media.addMedia");
    expect(await findByText("feedback.media.permission")).toBeTruthy();

    pressButton(container, "enregistrer");

    // Le refus portait sur la GALERIE : le laisser affiché ferait croire que la note vocale a
    // échoué, alors qu'elle est rattachée.
    expect(mutate).toHaveBeenCalledOnce();
    expect(queryByText("feedback.media.permission")).toBeNull();
  });

  it("retire le média que l'athlète désigne, et lui seul", () => {
    const mutate = vi.fn();
    vi.mocked(useDeleteFeedbackMedia).mockReturnValue({
      mutate,
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof useDeleteFeedbackMedia>);
    const { container } = renderRn(<FeedbackMediaSection sessionId="ss-1" feedback={twoPhotos} />);

    // Deux tuiles, donc deux boutons « retirer » : c'est celui de la SECONDE qu'on presse.
    const removes = within(container).getAllByText("feedback.media.remove");
    press(removes[1] as Element);

    expect(mutate).toHaveBeenCalledWith("p-2");
  });

  it("part du maximum quand aucun débrief n'existe encore", async () => {
    vi.mocked(pickFeedbackAssets).mockResolvedValue([]);
    const { container } = renderRn(<FeedbackMediaSection sessionId="ss-1" feedback={null} />);

    pressButton(container, "feedback.media.addMedia");

    await waitFor(() => {
      expect(vi.mocked(pickFeedbackAssets)).toHaveBeenCalledWith(30);
    });
  });
});

/**
 * Ces quatre-là sont passées à `sendMediaBatch` (@cmv/shared) et jamais appelées par la section
 * elle-même : c'est le lot qui les invoque, sur chaque média qu'il écarte. Elles décident du
 * LIBELLÉ que l'athlète lit, et c'est exactement là qu'un défaut a déjà été trouvé — mobile et web
 * ne nomment pas toujours pareil (`photoTooBig` contre `imageTooBig`). On les récupère telles
 * qu'elles ont été transmises, puis on les appelle.
 */
describe("FeedbackMediaSection — ce que la section dicte au lot", () => {
  async function batchOptions() {
    vi.mocked(pickFeedbackAssets).mockResolvedValue([{ uri: "file:///a.jpg" }] as never);
    const { container } = renderRn(
      <FeedbackMediaSection sessionId="ss-1" feedback={emptyFeedback} />,
    );
    pressButton(container, "feedback.media.addMedia");
    await waitFor(() => {
      expect(addAssets).toHaveBeenCalled();
    });
    return addAssets.mock.calls[0]?.[0] as {
      nameOf: (asset: { fileName?: string | null }) => string | null;
      rejectedReason: (rejection: { kind: MediaType }) => { key: string };
      failureReason: (error: unknown) => { key?: string; message?: string };
    };
  }

  it("nomme un média par son nom de fichier, et `null` quand il n'en a pas", async () => {
    const { nameOf } = await batchOptions();
    expect(nameOf({ fileName: "photo.jpg" })).toBe("photo.jpg");
    // `null` et non `""` : le libellé est INDISPONIBLE, ce n'est pas un nom vide (règle dure n°5).
    expect(nameOf({ fileName: null })).toBeNull();
  });

  it("distingue le quota vidéo du quota photo dans le refus", async () => {
    const { rejectedReason } = await batchOptions();
    expect(rejectedReason({ kind: MediaType.VIDEO }).key).toBe("feedback.media.noSlotVideo");
    expect(rejectedReason({ kind: MediaType.IMAGE }).key).toBe("feedback.media.noSlotImage");
  });

  it("garde le message du serveur pour un échec, la clé pour un refus métier", async () => {
    const { failureReason } = await batchOptions();
    expect(failureReason(new MediaRejectedError("feedback.media.videoTooBig")).key).toBe(
      "feedback.media.videoTooBig",
    );
    expect(failureReason(new ApiError(500, "trop lourd pour le serveur", null)).message).toBe(
      "trop lourd pour le serveur",
    );
    // Une panne muette retombe sur le message générique plutôt que sur une ligne vide.
    expect(failureReason(new Error("boom")).key).toBe("feedback.media.uploadError");
  });
});
