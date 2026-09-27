import { readdirSync } from "node:fs";
import path from "node:path";
import type { CapabilityName } from "@cmv/shared";
import { render } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";
import { CmvCapabilityGate } from "@/shared/component";
import { TABS } from "@/shared/lib/tabs";

/**
 * La table des gardes du mobile, lue dans `app/` tel qu'expo-router le voit (#338). Même rôle que
 * `apps/web/src/routes/guards.test.tsx`, et la même leçon : c'est ici que #20 a trouvé des routes
 * hors onglets sans AUCUNE garde, et rien d'autre que ce test ne l'aurait vu depuis.
 *
 * Vit dans `test/` et non dans `app/` : expo-router embarque tout fichier de `app/` comme une
 * route, test compris (cf. `root-layout.test.tsx`).
 *
 * Deux mécanismes, deux vérifications :
 * - sous `(app)/`, la barre d'onglets garde par `redirectForPath`, qui ne connaît QUE les onglets
 *   de `TABS` — un fichier qui n'y figure pas ne serait gardé par rien ;
 * - à côté, chaque dossier porte `CmvCapabilityGate` dans son `_layout.tsx`.
 */
vi.mock("@/shared/component", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/component")>()),
  CmvCapabilityGate: vi.fn(() => null),
}));

const APP = path.resolve(import.meta.dirname, "../app");
const TAB_GROUP = "(app)";

/** Les entrées volontairement SANS garde, chacune avec sa raison. */
const EXEMPT: Readonly<Record<string, string>> = {
  "_layout.tsx": "la racine enveloppe tout, écrans d'authentification compris",
  "index.tsx": "l'aiguillage d'entrée : il décide lui-même entre connexion et premier onglet",
  "login.tsx": "on y arrive précisément sans session",
  "register.tsx": "idem — et seule une inscription invitée passe l'API (#263)",
  "forgot-password.tsx": "idem",
};

/**
 * La capacité de chaque route hors onglets, tirée du `@Roles` de l'API qu'elle appelle. Le mobile
 * n'a pas d'équivalent de `spaceOfPath` pour la déduire : la table EST la spécification, et la
 * changer ici en même temps que le layout est un geste délibéré — c'est le but.
 */
const EXPECTED: Readonly<Record<string, CapabilityName>> = {
  athlete: "coach", // `GET /athletes/:id/sheet`
  feedbacks: "coach", // `/feedbacks`
  reminders: "coach", // `/reminders` — `Reminder` est scopé `coachId` seul
  join: "athlete", // `POST /invitations/accept`
  session: "athlete", // `/me/scheduled-sessions/…`
};

const entries = readdirSync(APP, { withFileTypes: true });
const outsideTabs = entries.filter((entry) => entry.name !== TAB_GROUP && !(entry.name in EXEMPT));

/** La capacité que le `_layout.tsx` de ce dossier passe à sa garde, `null` sans garde. */
async function gateOf(folder: string): Promise<CapabilityName | null> {
  const { default: Layout } = (await import(`../app/${folder}/_layout.tsx`)) as {
    default: ComponentType;
  };
  vi.mocked(CmvCapabilityGate).mockClear();
  render(<Layout />);
  return vi.mocked(CmvCapabilityGate).mock.calls[0]?.[0].capability ?? null;
}

describe("gardes des routes mobiles", () => {
  it("ne laisse sous les onglets aucun écran que `TABS` ignore", () => {
    const tabs = new Set(TABS.map((tab) => tab.name));
    const screens = readdirSync(path.join(APP, TAB_GROUP))
      .filter((name) => name !== "_layout.tsx")
      .map((name) => name.replace(/\.tsx$/, ""));

    expect(screens.filter((name) => !tabs.has(name))).toEqual([]);
  });

  it("n'exempte aucune entrée qui n'existe plus", () => {
    const names = new Set(entries.map((entry) => entry.name));

    expect(Object.keys(EXEMPT).filter((name) => !names.has(name))).toEqual([]);
  });

  it("attend une capacité pour chaque route hors onglets, et pour aucune autre", () => {
    // Une route nouvelle sans ligne ici est une route dont personne n'a dit pour qui elle est ;
    // un fichier plat, lui, n'a pas de layout où porter une garde.
    expect(outsideTabs.map((entry) => entry.name).sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(outsideTabs.every((entry) => entry.isDirectory())).toBe(true);
  });

  it.each(Object.entries(EXPECTED))("/%s est gardée pour %s", async (folder, capability) => {
    expect(await gateOf(folder)).toBe(capability);
  });
});
