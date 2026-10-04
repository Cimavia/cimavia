import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  type RefusedFields,
  RefusedFieldsContext,
  useRefusedFields,
  useReportRefused,
} from "@/shared/hook/useRefusedFields";

function Field({ refused }: Readonly<{ refused: boolean }>) {
  useReportRefused(refused);
  return null;
}

/** Un écran et ses champs, nommés, dont on lit le registre après chaque rendu. */
type Fields = Readonly<Record<string, boolean>>;

function setup(fields: Fields) {
  const seen: { current: RefusedFields | null } = { current: null };

  function Screen({ refused }: Readonly<{ refused: Fields }>) {
    const registry = useRefusedFields();
    seen.current = registry;
    return (
      <RefusedFieldsContext value={registry.report}>
        {Object.entries(refused).map(([name, isRefused]) => (
          <Field key={name} refused={isRefused} />
        ))}
      </RefusedFieldsContext>
    );
  }

  const view = render(<Screen refused={fields} />);
  return {
    hasRefused: () => seen.current?.hasRefused,
    rerender: (next: Fields) => view.rerender(<Screen refused={next} />),
  };
}

describe("useRefusedFields", () => {
  it("ne signale rien tant qu'aucun champ ne refuse", () => {
    const screen = setup({ repos: false, charge: false });

    expect(screen.hasRefused()).toBe(false);
  });

  it("signale un champ refusé, et le lève quand la saisie redevient lisible", () => {
    const screen = setup({ repos: true, charge: false });
    expect(screen.hasRefused()).toBe(true);

    screen.rerender({ repos: false, charge: false });

    expect(screen.hasRefused()).toBe(false);
  });

  it("reste signalé tant qu'un SEUL champ refuse encore", () => {
    const screen = setup({ repos: true, charge: true });

    screen.rerender({ repos: false, charge: true });

    expect(screen.hasRefused()).toBe(true);
  });

  it("lève le signal d'un champ qui disparaît, pour ne rien laisser fermé derrière lui", () => {
    const screen = setup({ repos: false, charge: true });

    screen.rerender({ repos: false });

    expect(screen.hasRefused()).toBe(false);
  });

  it("ne déclare rien hors d'un écran qui tient le registre", () => {
    // Le champ reste utilisable seul : il garde son erreur, sans personne à prévenir.
    expect(() => render(<Field refused />)).not.toThrow();
  });

  it("compte un champ une fois, même déclaré deux fois", () => {
    const seen: { current: RefusedFields | null } = { current: null };
    function Probe() {
      seen.current = useRefusedFields();
      return null;
    }
    render(<Probe />);

    act(() => seen.current?.report("champ", true));
    act(() => seen.current?.report("champ", true));
    act(() => seen.current?.report("champ", false));

    expect(seen.current?.hasRefused).toBe(false);
  });
});
