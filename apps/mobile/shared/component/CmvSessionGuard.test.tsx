import { act, fireEvent, screen } from "@testing-library/react";
import { type ReactElement, useState } from "react";
import { Text, TextInput } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CmvCapabilityGate } from "@/shared/component/CmvCapabilityGate";
import { useExercisedCapability } from "@/shared/hook/useExercisedCapability";
import { type SessionDeparture, useSessionDeparture } from "@/shared/hook/useSessionGuard";
import { authClient } from "@/shared/lib/auth";
import { renderRn } from "@/test/render";
import { CmvSessionGuard } from "./CmvSessionGuard";

vi.mock("@/shared/lib/auth", () => ({ authClient: { useSession: vi.fn() } }));
vi.mock("@/shared/lib/account-reset", () => ({ resetAccountData: vi.fn(async () => undefined) }));

const VEIL = "auth.reauth.title";
const LEA = { id: "lea", email: "lea@cmv.test", isAthlete: true, isCoach: false };
const TOM = { id: "tom", email: "tom@cmv.test", isAthlete: true, isCoach: false };

const signedInAs = (user: typeof LEA) => ({ user });

let mounts = 0;
let departure: SessionDeparture;

/** Un écran athlète et sa saisie : c'est elle que la garde est là pour sauver. */
function FeedbackDraft() {
  const [mountedOnce] = useState(() => {
    mounts += 1;
    return true;
  });
  departure = useSessionDeparture();
  return mountedOnce ? <TextInput testID="brouillon" /> : null;
}

/** Un élément NEUF à chaque appel : React ne rerend pas un élément identique au précédent. */
const tree = (): ReactElement => (
  <CmvSessionGuard>
    <CmvCapabilityGate capability="athlete">
      <FeedbackDraft />
      <Text>écran</Text>
    </CmvCapabilityGate>
  </CmvSessionGuard>
);

function sessionIs(data: unknown, isPending = false): void {
  vi.mocked(authClient.useSession).mockReturnValue({ data, isPending } as never);
}

function setup() {
  const view = renderRn(tree());
  const update = (data: unknown, isPending = false) => {
    sessionIs(data, isPending);
    view.rerender(tree());
  };
  const redirect = () =>
    view.container.querySelector("[data-redirect]")?.getAttribute("data-redirect") ?? null;
  return { ...view, update, redirect };
}

const draft = () => screen.getByTestId("brouillon") as HTMLInputElement;

beforeEach(() => {
  mounts = 0;
  sessionIs(signedInAs(LEA));
});

describe("CmvSessionGuard — la perte", () => {
  it("ne dit rien tant que la session est là", () => {
    setup();

    expect(screen.queryByText(VEIL)).toBeNull();
    expect(screen.getByText("écran")).toBeTruthy();
  });

  it("garde l'écran et sa saisie sous la fenêtre quand la session tombe", () => {
    const { update, redirect } = setup();
    fireEvent.change(draft(), { target: { value: "Bonne séance" } });

    update(null);

    expect(screen.getByText(VEIL)).toBeTruthy();
    expect(redirect()).toBeNull();
    expect(draft().value).toBe("Bonne séance");
    expect(mounts).toBe(1);
  });

  // `isPending` repasse à vrai pendant la relecture d'une session vide : la garde démontait.
  it("ne démonte pas l'écran pendant une relecture de la session perdue", () => {
    const { update } = setup();
    update(null);

    update(null, true);

    expect(screen.getByText("écran")).toBeTruthy();
    expect(mounts).toBe(1);
  });

  it("retire la fenêtre au retour du même compte, sans remonter l'écran", () => {
    const { update } = setup();
    update(null);

    update(signedInAs(LEA));

    expect(screen.queryByText(VEIL)).toBeNull();
    expect(mounts).toBe(1);
  });

  it("tient la fenêtre quand un autre compte a pris la session", () => {
    const { update, redirect } = setup();

    update(signedInAs(TOM));

    expect(screen.getByText(VEIL)).toBeTruthy();
    expect(screen.getByText("lea@cmv.test")).toBeTruthy();
    expect(redirect()).toBeNull();
  });

  // Le portail captif d'une salle répond en 200 : ça ne vaut ni perte ni renvoi.
  it("ne demande rien sur une réponse illisible, et garde les droits du compte", () => {
    const { update, redirect } = setup();

    update("<html></html>");

    expect(screen.queryByText(VEIL)).toBeNull();
    expect(redirect()).toBeNull();
    expect(screen.getByText("écran")).toBeTruthy();
  });

  // Une capacité ajoutée depuis le profil doit encore valoir au moment de la perte.
  it("retient les capacités du moment, pas celles de l'ouverture", () => {
    const coachAthlete = { ...LEA, isAthlete: true, isCoach: true };
    const { update, redirect } = setup();
    update(signedInAs(coachAthlete));

    update(null);

    expect(redirect()).toBeNull();
    expect(screen.getByText("écran")).toBeTruthy();
  });

  // Une clé de requête qui change sous l'écran le viderait : le compte retenu décide encore.
  it("garde la capacité exercée pendant la perte", () => {
    const athlete = { ...LEA, isCoach: true, role: "ATHLETE" };
    let exercised: string | null = null;
    function Probe() {
      exercised = useExercisedCapability();
      return null;
    }
    sessionIs(signedInAs(athlete));
    const view = renderRn(
      <CmvSessionGuard>
        <Probe />
      </CmvSessionGuard>,
    );

    sessionIs(null);
    view.rerender(
      <CmvSessionGuard>
        <Probe />
      </CmvSessionGuard>,
    );

    expect(exercised).toBe("athlete");
  });

  it("renvoie vers la connexion quand aucun écran n'a jamais été ouvert", () => {
    sessionIs(null);

    const { redirect } = setup();

    expect(redirect()).toBe("/login");
    expect(screen.queryByText(VEIL)).toBeNull();
  });
});

describe("CmvSessionGuard — le départ annoncé", () => {
  it("ne prend pas une déconnexion pour une perte, et ne démonte rien", () => {
    const { update, redirect } = setup();

    act(() => departure.begin());
    update(null);

    expect(screen.queryByText(VEIL)).toBeNull();
    expect(redirect()).toBeNull();
    expect(screen.getByText("écran")).toBeTruthy();
  });

  it("oublie le compte une fois parti", () => {
    const { update, redirect } = setup();
    act(() => departure.begin());
    update(null);

    act(() => departure.complete());

    expect(screen.queryByText(VEIL)).toBeNull();
    expect(redirect()).toBe("/login");
  });

  it("montre la perte si le départ échoue et que la session est tombée entre-temps", () => {
    const { update } = setup();
    act(() => departure.begin());
    update(null);

    act(() => departure.cancel());

    expect(screen.getByText(VEIL)).toBeTruthy();
  });

  it("n'a rien à dire si le départ échoue et que la session est toujours là", () => {
    setup();
    act(() => departure.begin());

    act(() => departure.cancel());

    expect(screen.queryByText(VEIL)).toBeNull();
  });
});
