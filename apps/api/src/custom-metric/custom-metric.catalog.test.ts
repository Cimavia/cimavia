import { type ExerciseBlocks, MetricSource } from "@cmv/shared";
import { BadRequestException } from "@nestjs/common";
import type { CustomMetric as CustomMetricRow } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { PrismaService } from "../infra/prisma/prisma.service";
import type { TenantPrisma } from "../tenancy/tenancy.extension";
import { citedCustomMetrics } from "./custom-metric.mapper";
import { assertCitesCatalog, CustomMetricService } from "./service/custom-metric.service";

const row = (id: string, coachId = "c"): CustomMetricRow => ({
  id,
  coachId,
  label: `Métrique ${id}`,
  unit: null,
  valueType: "NUMBER",
  scale: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const citing = (...ids: string[]): ExerciseBlocks => [
  {
    id: "blk",
    label: null,
    structure: { type: "SERIES", setCount: 1, restBetweenSetsSeconds: null },
    metrics: ids.map((customMetricId, i) => ({
      id: `col_${i}`,
      source: MetricSource.CUSTOM,
      customMetricId,
      label: null,
      collapsed: false,
    })),
    rows: [],
  },
];

describe("citedCustomMetrics", () => {
  it("rend les définitions citées, et ignore une citation orpheline (EX-2)", () => {
    expect(citedCustomMetrics(citing("m1", "gone"), [row("m1"), row("m2")])).toEqual([
      { id: "m1", label: "Métrique m1", unit: null, valueType: "NUMBER", scale: null },
    ]);
  });
});

describe("assertCitesCatalog", () => {
  it("accepte une métrique du catalogue du propriétaire", () => {
    expect(() => assertCitesCatalog(citing("m1"), [], [row("m1")])).not.toThrow();
  });

  it("refuse une métrique hors de ce catalogue : celle du rédacteur, par exemple", () => {
    expect(() => assertCitesCatalog(citing("m-de-m"), [], [row("m1")])).toThrow(
      BadRequestException,
    );
  });

  it("laisse passer une citation déjà là, même orpheline : sinon l'exercice ne s'enregistre plus", () => {
    expect(() => assertCitesCatalog(citing("gone"), citing("gone"), [])).not.toThrow();
  });
});

describe("CustomMetricService.catalogOf", () => {
  function serviceReading(rows: CustomMetricRow[]) {
    const calls: unknown[] = [];
    const prisma = {
      customMetric: {
        findMany: (args: unknown) => {
          calls.push(args);
          return Promise.resolve(rows);
        },
      },
    } as unknown as PrismaService;
    return { service: new CustomMetricService({} as TenantPrisma, prisma), calls };
  }

  it("lit les catalogues demandés en une requête, et range chaque ligne chez son Coach", async () => {
    const { service, calls } = serviceReading([row("m1", "c"), row("m2", "d")]);
    const catalogOf = await service.catalogOf(["c", "d", "c"]);
    expect(calls).toEqual([{ where: { coachId: { in: ["c", "d"] } }, orderBy: { label: "asc" } }]);
    expect(catalogOf("c").map((metric) => metric.id)).toEqual(["m1"]);
    expect(catalogOf("d").map((metric) => metric.id)).toEqual(["m2"]);
    expect(catalogOf("x")).toEqual([]);
  });

  it("ne lit rien sans propriétaire", async () => {
    const { service, calls } = serviceReading([]);
    expect((await service.catalogOf([]))("c")).toEqual([]);
    expect(calls).toEqual([]);
  });
});
