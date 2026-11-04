import { waitFor } from "@testing-library/react";
import { getNetworkStateAsync } from "expo-network";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileMessage } from "@/feature/message/component/FileMessage";
import { press, renderRn } from "@/test/render";

const openMessageFile = vi.fn();
vi.mock("@/shared/lib/message-file", () => ({
  openMessageFile: (...args: unknown[]) => openMessageFile(...args),
}));

const media = {
  url: "https://s3.test/plan.pdf",
  fileName: "plan.pdf",
  mimeType: "application/pdf",
  sizeBytes: 3 * 1024 * 1024,
  durationSeconds: null,
};
const resolveUrl = async () => "https://s3.test/plan.pdf?fresh";

function renderFile() {
  return renderRn(<FileMessage messageId="m-1" media={media} resolveUrl={resolveUrl} />);
}

/** Le bouton porte le nom du fichier : c'est ce qu'un lecteur d'écran annonce. */
function pressFile(getByLabelText: (label: string) => Element): void {
  press(getByLabelText("messages.file.open"));
}

beforeEach(() => {
  openMessageFile.mockReset();
  vi.mocked(getNetworkStateAsync).mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  });
});

describe("FileMessage", () => {
  it("dit le nom et la taille, en Mo au-delà d'un Mo", () => {
    const { getByText } = renderFile();
    expect(getByText("plan.pdf")).toBeTruthy();
    expect(getByText("common.fileSize.megabytes")).toBeTruthy();
  });

  it("ouvre CE message, avec la connectivité du moment et de quoi re-signer", async () => {
    openMessageFile.mockResolvedValue("opened");
    const { getByLabelText, queryByText } = renderFile();

    pressFile(getByLabelText);

    await waitFor(() =>
      expect(openMessageFile).toHaveBeenCalledWith("m-1", media, true, resolveUrl),
    );
    expect(queryByText("messages.file.openError")).toBeNull();
  });

  it.each([
    ["hors réseau", async () => ({ isConnected: false, isInternetReachable: false }), false],
    // Inconnue, elle laisse tenter : c'est le téléchargement qui dira l'échec.
    [
      "illisible",
      async () => {
        throw new Error("module");
      },
      true,
    ],
  ])("lit la connectivité au tap, %s", async (_case, state, online) => {
    vi.mocked(getNetworkStateAsync).mockImplementation(state as never);
    openMessageFile.mockResolvedValue("opened");
    const { getByLabelText } = renderFile();

    pressFile(getByLabelText);

    await waitFor(() =>
      expect(openMessageFile).toHaveBeenCalledWith("m-1", media, online, resolveUrl),
    );
  });

  it.each([
    ["offline", "messages.file.offline"],
    ["failed", "messages.file.openError"],
  ])("dit l'échec « %s » sous la bulle", async (outcome, key) => {
    openMessageFile.mockResolvedValue(outcome);
    const { getByLabelText, findByText } = renderFile();

    pressFile(getByLabelText);

    expect(await findByText(key)).toBeTruthy();
  });

  it("efface l'échec quand l'ouverture suivante réussit", async () => {
    openMessageFile.mockResolvedValueOnce("failed").mockResolvedValueOnce("opened");
    const { getByLabelText, findByText, queryByText } = renderFile();

    pressFile(getByLabelText);
    await findByText("messages.file.openError");
    pressFile(getByLabelText);

    await waitFor(() => expect(queryByText("messages.file.openError")).toBeNull());
  });
});
