import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { servedEntryScript } from "@/shared/lib/bundle-update";
import {
  BUNDLE_CHECK_INTERVAL_MS,
  BundleUpdateContext,
  useBundleUpdate,
  useIsBundleUpdateAvailable,
} from "./useBundleUpdate";

vi.mock("@/shared/lib/bundle-update", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/bundle-update")>()),
  servedEntryScript: vi.fn(),
}));

const RUNNING = "/assets/index-ancien.js";
const NEXT = "/assets/index-neuf.js";

let visibility: DocumentVisibilityState = "visible";

/** Le serveur sert désormais `entry` ; `null`, il ne répond pas. */
function serve(entry: string | null) {
  vi.mocked(servedEntryScript).mockResolvedValue(entry);
}

/** L'onglet passe au premier plan, ou en sort. */
async function showTab(state: DocumentVisibilityState = "visible") {
  visibility = state;
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(servedEntryScript).mockReset();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  document.body.innerHTML = `<script type="module" src="${RUNNING}"></script>`;
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

/** Monte la détection et laisse sa première lecture — celle du chargement — aboutir. */
async function mount() {
  const view = renderHook(() => useBundleUpdate());
  await act(async () => {});
  return view;
}

describe("useBundleUpdate", () => {
  it("vérifie dès le chargement : un onglet restauré depuis le cache monte avec le bundle d'hier", async () => {
    serve(NEXT);

    const { result } = await mount();

    expect(result.current).toBe(true);
  });

  it("voit le nouveau bundle au retour sur l'onglet", async () => {
    serve(RUNNING);
    const { result } = await mount();
    expect(result.current).toBe(false);

    serve(NEXT);
    await showTab();

    expect(result.current).toBe(true);
  });

  it("ne dit rien tant que le serveur sert le bundle de la page", async () => {
    serve(RUNNING);
    const { result } = await mount();

    await showTab();
    await wait(BUNDLE_CHECK_INTERVAL_MS);

    expect(result.current).toBe(false);
    expect(servedEntryScript).toHaveBeenCalledTimes(3);
  });

  it("vérifie aussi à intervalle, pour un onglet resté au premier plan", async () => {
    serve(RUNNING);
    const { result } = await mount();
    serve(NEXT);

    await wait(BUNDLE_CHECK_INTERVAL_MS - 1);
    expect(servedEntryScript).toHaveBeenCalledOnce();

    await wait(1);
    expect(result.current).toBe(true);
  });

  it("ne lit rien pour un onglet caché : son retour vérifiera", async () => {
    visibility = "hidden";
    serve(NEXT);
    const { result } = await mount();

    await showTab("hidden");
    await wait(BUNDLE_CHECK_INTERVAL_MS);

    expect(servedEntryScript).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it("prend une lecture ratée pour « je ne sais pas », et vérifie encore ensuite", async () => {
    serve(null);
    const { result } = await mount();

    await showTab();
    expect(result.current).toBe(false);

    serve(NEXT);
    await showTab();
    expect(result.current).toBe(true);
  });

  it("s'arrête une fois la nouvelle version vue : la page ne rajeunira pas sans recharger", async () => {
    serve(NEXT);
    const { result } = await mount();

    serve(RUNNING);
    await showTab();
    await wait(BUNDLE_CHECK_INTERVAL_MS);

    expect(result.current).toBe(true);
    expect(servedEntryScript).toHaveBeenCalledOnce();
  });

  it("ne vérifie rien sans bundle dans la page — le serveur de dev : rien à quoi comparer", async () => {
    document.body.innerHTML = '<script type="module" src="/src/main.tsx"></script>';
    serve(NEXT);
    const { result } = await mount();

    await showTab();

    expect(servedEntryScript).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });
});

describe("useIsBundleUpdateAvailable", () => {
  function Probe() {
    return <p>{String(useIsBundleUpdateAvailable())}</p>;
  }

  it("lit ce que la route racine a vu", () => {
    render(
      <BundleUpdateContext value={true}>
        <Probe />
      </BundleUpdateContext>,
    );

    expect(screen.getByText("true")).toBeInTheDocument();
  });

  it("vaut false hors de la racine — un écran monté seul dans un test", () => {
    render(<Probe />);

    expect(screen.getByText("false")).toBeInTheDocument();
  });
});
