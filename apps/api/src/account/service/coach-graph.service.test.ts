import { ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { PrismaService } from "../../infra/prisma/prisma.service";
import { CoachGraphService } from "./coach-graph.service";

type Link = { coachId: string; athleteId: string };

/** Une base réduite aux liens `coach → athlète`, que la remontée lit niveau par niveau. */
function serviceOver(links: Link[]) {
  const prisma = {
    coachAthlete: {
      findMany: ({ where }: { where: { athleteId: { in: string[] } } }) =>
        Promise.resolve(links.filter((link) => where.athleteId.in.includes(link.athleteId))),
    },
  } as unknown as PrismaService;
  return new CoachGraphService(prisma);
}

const link = (coachId: string, athleteId: string): Link => ({ coachId, athleteId });

/**
 * La garde anti-boucle, à plusieurs liens d'un coup (#602). Le cas d'un seul lien est éprouvé en
 * e2e (#11, #599) ; ce qui est neuf ici, c'est une remontée qui part de plusieurs coachs.
 */
describe("CoachGraphService.assertNoCycle", () => {
  it("laisse passer des liens sans boucle", async () => {
    const graph = serviceOver([link("top", "c"), link("top", "m")]);

    await expect(graph.assertNoCycle(["c", "m"], ["ti"])).resolves.toBeUndefined();
  });

  // TI coache M ; F voudrait faire suivre TI par C et M : M → TI refermerait la boucle.
  it("refuse dès qu'un seul des coachs est sous l'athlète", async () => {
    const graph = serviceOver([link("ti", "m")]);

    await expect(graph.assertNoCycle(["c", "m"], ["ti"])).rejects.toBeInstanceOf(ConflictException);
  });

  // M rejoint F, dont TE coache déjà M de loin : TE → X → M.
  it("refuse dès qu'un seul des athlètes est au-dessus du coach", async () => {
    const graph = serviceOver([link("te", "x"), link("x", "m")]);

    await expect(graph.assertNoCycle(["m"], ["ti", "te"])).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("ne lit rien quand il n'y a aucun lien à créer", async () => {
    const graph = serviceOver([]);

    await expect(graph.assertNoCycle([], ["ti"])).resolves.toBeUndefined();
    await expect(graph.assertNoCycle(["c"], [])).resolves.toBeUndefined();
  });

  it("lève une erreur, et non un 409, sur une boucle déjà en base", async () => {
    const graph = serviceOver([link("a", "b"), link("b", "a")]);

    const failure = graph.assertNoCycle(["a"], ["outsider"]);

    await expect(failure).rejects.toThrow("[relation] cycle DÉJÀ présent");
    await expect(failure).rejects.not.toBeInstanceOf(ConflictException);
  });
});
