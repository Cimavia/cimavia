import { type AthleteRow, InvoiceState } from "@cmv/shared";
import { router } from "expo-router";
import { createInstance } from "i18next";
import type { ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AthleteRowCard } from "@/feature/dashboard/component/AthleteRowCard";
import { press, renderRn } from "@/test/render";

const { session } = vi.hoisted(() => ({ session: { userId: "coach-1" } }));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: session.userId } } }) },
}));

// La pastille rend sa variante sans classe lisible dans le DOM (NativeWind) : on la double pour
// que l'état choisi — ce que la ligne DÉCIDE — reste observable.
vi.mock("@/shared/component", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/shared/component")>();
  return {
    ...original,
    CmvBadge: ({ label, variant }: Readonly<{ label: string; variant: string }>) => (
      <span data-variant={variant}>{label}</span>
    ),
  };
});

/**
 * `cimode` perd l'interpolation : « — » et « 0 » y rendraient la même clé nue. Les compteurs ne
 * s'affirment donc que sous une instance qui ÉCRIT ses paramètres, posée par-dessus celle du rendu.
 */
function withCounts(ui: ReactElement) {
  const i18n = createInstance();
  i18n.init({
    lng: "test",
    resources: {
      test: {
        translation: {
          dashboard: { row: { pending: "{{feedbacks}} débriefs · {{messages}} messages" } },
          athlete: { self: "{{name}} (moi)" },
        },
      },
    },
    interpolation: { escapeValue: false },
  });
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

function row(overrides: Partial<AthleteRow> = {}): AthleteRow {
  return {
    athleteId: "ath-1",
    athleteName: "Léa Martin",
    plan: null,
    unreadFeedbacks: 2,
    lastUnreadFeedbackId: "f-1",
    unreadMessages: 0,
    invoiceState: null,
    ...overrides,
  };
}

beforeEach(() => {
  session.userId = "coach-1";
});

describe("AthleteRowCard", () => {
  it("nomme l'athlète et l'identifie par ses initiales", () => {
    const { queryByText } = renderRn(<AthleteRowCard row={row()} />);

    expect(queryByText("Léa Martin")).not.toBeNull();
    expect(queryByText("LM")).not.toBeNull();
  });

  /** Auto-coaching (#14) : le coach qui se suit lui-même se reconnaît dans la liste. */
  it("marque la ligne du coach qui se suit lui-même", () => {
    session.userId = "ath-1";
    const { queryByText } = renderRn(withCounts(<AthleteRowCard row={row()} />));

    expect(queryByText("Léa Martin (moi)")).not.toBeNull();
  });

  /** `null` = liste indisponible, `0` = tout est lu : les deux ne disent pas la même chose. */
  it.each([
    [{ unreadFeedbacks: null, unreadMessages: 0 }, "— débriefs · 0 messages"],
    [{ unreadFeedbacks: 0, unreadMessages: null }, "0 débriefs · — messages"],
  ])("distingue un compteur indisponible d'un compteur à zéro (%o)", (counts, text) => {
    const { queryByText } = renderRn(withCounts(<AthleteRowCard row={row(counts)} />));

    expect(queryByText(text)).not.toBeNull();
  });

  it("ouvre la fiche de l'athlète au tap", () => {
    const { getByText } = renderRn(<AthleteRowCard row={row()} />);

    press(getByText("Léa Martin"));

    expect(router.push).toHaveBeenCalledWith("/athlete/ath-1");
  });

  it("montre l'état de la dernière facture émise", () => {
    const { container } = renderRn(
      <AthleteRowCard row={row({ invoiceState: InvoiceState.OVERDUE })} />,
    );

    const badge = container.querySelector("[data-variant]");
    expect(badge?.getAttribute("data-variant")).toBe("error");
    expect(badge?.textContent).toBe("invoice.status.overdue");
  });

  it("ne montre aucune pastille sans facture émise", () => {
    const { container } = renderRn(<AthleteRowCard row={row()} />);

    expect(container.querySelector("[data-variant]")).toBeNull();
  });
});
