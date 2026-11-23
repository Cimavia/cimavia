import { describe, expect, it, vi } from "vitest";
import {
  explainSweepFailure,
  formatSweepReport,
  parseSweepArgs,
  runSweep,
  SWEEP_USAGE,
} from "./orphan-sweep.report";
import { emptySweepReport, type SweepReport } from "./orphan-sweep.service";

const OLD = new Date("2026-01-01T00:00:00Z");

function reportWith(overrides: Partial<SweepReport> = {}): SweepReport {
  return { ...emptySweepReport(), scanned: 10, recent: 3, referenced: 5, ...overrides };
}

const orphan = (key: string, size: number | null, family: "exercise" | "conversation") => ({
  key,
  lastModified: OLD,
  size,
  family,
});

describe("parseSweepArgs", () => {
  // La première exécution rapporte : supprimer ne vient que d'un drapeau explicite.
  it("simule par défaut, sur tout le bucket", () => {
    expect(parseSweepArgs([])).toEqual({ remove: false });
  });

  it("lit --delete et --prefix, dans n'importe quel ordre", () => {
    expect(parseSweepArgs(["--prefix", "conversation/", "--delete"])).toEqual({
      remove: true,
      prefix: "conversation/",
    });
  });

  it.each([
    ["un drapeau inconnu", ["--dry-run"]],
    ["--delete mal orthographié", ["--delete=true"]],
    ["un préfixe manquant", ["--prefix"]],
    ["un préfixe vide", ["--prefix", ""]],
    // Sans ce refus, `--delete` devenait le préfixe : une simulation sur zéro objet, en silence.
    ["un drapeau pris pour préfixe", ["--prefix", "--delete", "conversation/"]],
  ])("refuse %s", (_, argv) => {
    expect(() => parseSweepArgs(argv)).toThrow(SWEEP_USAGE);
  });
});

describe("formatSweepReport", () => {
  it("en simulation, le dit et liste les clés qui partiraient", () => {
    const lines = formatSweepReport(
      reportWith({
        orphans: [
          orphan("coach/c/exercises/e/a.pdf", 1500, "exercise"),
          orphan("x", 2, "exercise"),
        ],
      }),
      { remove: false },
    );

    expect(lines[0]).toContain("SIMULATION");
    expect(lines).toContain("Objets lus : 10 (tout le bucket)");
    expect(lines).toContain("Orphelins : 2");
    expect(lines).toContain("  documents d'exercice : 2 (1 502 octets)");
    expect(lines.slice(-3)).toEqual([
      "Clés qui seraient supprimées :",
      "  coach/c/exercises/e/a.pdf",
      "  x",
    ]);
  });

  // Une suppression laisse sa trace : ce qui est parti, et ce qui a résisté.
  it("en suppression, nomme les clés parties et celles en échec", () => {
    const lines = formatSweepReport(
      reportWith({
        orphans: [orphan("k", 1, "conversation"), orphan("j", 1, "conversation")],
        deleted: ["k"],
        failed: ["j"],
      }),
      { remove: true, prefix: "conversation/" },
    );

    expect(lines[0]).toContain("SUPPRESSION");
    expect(lines).toContain("Objets lus : 10 (préfixe conversation/)");
    expect(lines.slice(-5)).toEqual([
      "Supprimés : 1 · échecs : 1",
      "Clés supprimées :",
      "  k",
      "Clés en échec, restées au bucket (relancer le balayage) :",
      "  j",
    ]);
    expect(lines).not.toContain("Clés qui seraient supprimées :");
  });

  // Un poids partiel se lirait comme exact.
  it("dit un poids inconnu plutôt qu'un total partiel", () => {
    const lines = formatSweepReport(
      reportWith({ orphans: [orphan("a", 10, "conversation"), orphan("b", null, "conversation")] }),
      { remove: false },
    );

    expect(lines).toContain("  médias de messagerie : 2 (poids inconnu)");
  });

  it("liste les clés de forme inconnue, dans les deux modes", () => {
    for (const remove of [false, true]) {
      const lines = formatSweepReport(reportWith({ unknown: ["backups/x.sql"] }), { remove });
      expect(lines.slice(-2)).toEqual(["Clés de forme inconnue (laissées) :", "  backups/x.sql"]);
    }
  });

  it("n'ajoute aucune liste quand il n'y a rien à montrer", () => {
    expect(formatSweepReport(reportWith(), { remove: false }).at(-1)).toBe("Orphelins : 0");
    expect(formatSweepReport(reportWith(), { remove: true }).at(-1)).toBe(
      "Supprimés : 0 · échecs : 0",
    );
  });
});

describe("explainSweepFailure", () => {
  it("explique le refus de lister, attendu sous la clé d'API", () => {
    const denied = Object.assign(new Error("Access Denied."), { name: "AccessDenied" });

    expect(explainSweepFailure(denied)).toContain("identité root");
  });

  it("rend l'usage seul pour des arguments mal formés", () => {
    let refusal: unknown;
    try {
      parseSweepArgs(["--prefix"]);
    } catch (error) {
      refusal = error;
    }

    expect(explainSweepFailure(refusal)).toBe(SWEEP_USAGE);
  });

  it.each([
    ["une autre erreur", new Error("connect ECONNREFUSED")],
    ["ce qui n'est pas une erreur", "AccessDenied"],
  ])("ne prétend rien expliquer pour %s", (_, error) => {
    expect(explainSweepFailure(error)).toBeNull();
  });
});

describe("runSweep", () => {
  const NOW = new Date("2026-11-23T12:00:00Z");

  it("balaye avec les arguments de la commande, puis imprime le rapport", async () => {
    const sweep = vi.fn(async (_options: object, report: SweepReport) => {
      report.scanned = 4;
      return report;
    });
    const print = vi.fn();

    await runSweep({ sweep }, { remove: true, prefix: "conversation/" }, NOW, print);

    expect(sweep.mock.calls[0]?.[0]).toEqual({ now: NOW, remove: true, prefix: "conversation/" });
    expect(print).toHaveBeenCalledTimes(1);
    expect(print.mock.calls[0]?.[0]).toContain("Objets lus : 4 (préfixe conversation/)");
  });

  // Un `--delete` interrompu a peut-être déjà supprimé : l'opérateur doit voir quoi.
  it("imprime ce qui a été fait avant une panne, puis laisse remonter l'erreur", async () => {
    const outage = new Error("connexion perdue");
    const sweep = vi.fn(async (_options: object, report: SweepReport) => {
      report.scanned = 1000;
      report.deleted.push("k");
      throw outage;
    });
    const print = vi.fn();

    await expect(runSweep({ sweep }, { remove: true }, NOW, print)).rejects.toBe(outage);
    expect(print.mock.calls[0]?.[0]).toContain("Clés supprimées :\n  k");
    expect(print.mock.calls[1]?.[0]).toContain("INTERROMPU");
  });

  // Refusé dès la première page (la clé d'API) : rien n'a été lu, pas de rapport vide.
  it("n'imprime rien sur un échec avant la première page", async () => {
    const denied = Object.assign(new Error("denied"), { name: "AccessDenied" });
    const sweep = vi.fn().mockRejectedValue(denied);
    const print = vi.fn();

    await expect(runSweep({ sweep }, { remove: false }, NOW, print)).rejects.toBe(denied);
    expect(print).not.toHaveBeenCalled();
  });
});
