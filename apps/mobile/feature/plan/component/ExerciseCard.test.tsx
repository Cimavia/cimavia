import type { ScheduledSessionExerciseDto } from "@cmv/shared";
import { DocumentType, DocumentUsage } from "@cmv/shared";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pressButton, renderRn } from "../../../test/render";

let reachable: boolean | null = true;
vi.mock("expo-network", () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: reachable }),
  addNetworkStateListener: vi.fn(() => ({ remove: vi.fn() })),
}));

const openDocument = vi.fn<() => Promise<string>>(async () => "opened");
vi.mock("@/feature/plan/lib/open-document", () => ({
  openDocument: (...args: unknown[]) => openDocument(...(args as [])),
}));

const { ExerciseCard } = await import("./ExerciseCard");

function exercise(): ScheduledSessionExerciseDto {
  return {
    id: "ex-1",
    sourceExerciseId: null,
    title: "Tractions lestées",
    description: null,
    instructions: null,
    tracking: null,
    tags: [],
    note: null,
    blocks: [],
    customMetrics: [],
    baseline: [],
    adjustments: [],
    position: 0,
    documents: [
      {
        id: "doc-1",
        type: DocumentType.FILE,
        usage: DocumentUsage.ATTACHMENT,
        url: "https://storage.test/signed",
        fileName: "progression.pdf",
        mimeType: "application/pdf",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}

function renderCard() {
  return renderRn(
    <ExerciseCard
      exercise={exercise()}
      planId="plan-1"
      index={0}
      customMetrics={[]}
      tracking={null}
      onToggleUnit={vi.fn()}
      onRounds={vi.fn()}
      onRun={vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  reachable = true;
  openDocument.mockResolvedValue("opened");
});

describe("ExerciseCard — pièces jointes", () => {
  it("ouvre la pièce jointe avec le cycle et l'état du réseau", async () => {
    const { container } = renderCard();

    pressButton(container, "progression.pdf");

    await waitFor(() => expect(openDocument).toHaveBeenCalledTimes(1));
    expect(openDocument).toHaveBeenCalledWith(
      "plan-1",
      expect.objectContaining({ id: "doc-1" }),
      true,
    );
  });

  it("ne dit rien quand la pièce jointe s'ouvre", async () => {
    const { container } = renderCard();

    pressButton(container, "progression.pdf");

    await waitFor(() => expect(openDocument).toHaveBeenCalled());
    expect(screen.queryByText("plan.session.documentOffline")).toBeNull();
    expect(screen.queryByText("plan.session.documentUnavailable")).toBeNull();
  });

  /**
   * Le repli explicite de l'issue : un document jamais descendu, tapé sans réseau, doit DIRE
   * pourquoi il ne s'ouvre pas — pas échouer en silence.
   */
  it("explique le hors-réseau sous la pièce jointe concernée", async () => {
    reachable = false;
    openDocument.mockResolvedValue("offline");
    const { container } = renderCard();

    pressButton(container, "progression.pdf");

    expect(await screen.findByText("plan.session.documentOffline")).toBeTruthy();
  });

  it("distingue une ouverture refusée d'une absence de réseau", async () => {
    openDocument.mockResolvedValue("failed");
    const { container } = renderCard();

    pressButton(container, "progression.pdf");

    expect(await screen.findByText("plan.session.documentUnavailable")).toBeTruthy();
    expect(screen.queryByText("plan.session.documentOffline")).toBeNull();
  });

  /**
   * L'échec ne doit pas SURVIVRE à une ouverture réussie : l'athlète qui retrouve du réseau et
   * retape doit voir le message disparaître, sans quoi il croirait l'échec toujours vrai.
   */
  it("efface le message quand une nouvelle tentative aboutit", async () => {
    openDocument.mockResolvedValue("offline");
    const { container } = renderCard();

    pressButton(container, "progression.pdf");
    expect(await screen.findByText("plan.session.documentOffline")).toBeTruthy();

    openDocument.mockResolvedValue("opened");
    pressButton(container, "progression.pdf");

    await waitFor(() => expect(screen.queryByText("plan.session.documentOffline")).toBeNull());
  });
});
