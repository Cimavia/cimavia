import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { OBJECT_KEY_COLUMNS, referencedObjectKeys } from "./object-references";

type Db = Parameters<typeof referencedObjectKeys>[0];

/** Chaque table rend les lignes données, quelle que soit la requête. */
function dbWith(rows: Partial<Record<string, Record<string, string | null>[]>> = {}) {
  const table = (name: string) => ({ findMany: vi.fn().mockResolvedValue(rows[name] ?? []) });
  return {
    exerciseDocument: table("exerciseDocument"),
    scheduledSessionExerciseDocument: table("scheduledSessionExerciseDocument"),
    feedbackMedia: table("feedbackMedia"),
    message: table("message"),
    invoice: table("invoice"),
    pendingObjectDeletion: table("pendingObjectDeletion"),
  };
}

/** Les colonnes du schéma qui portent une clé d'objet : par convention, celles en `…Path`. */
function schemaPathColumns(): string[] {
  return Prisma.dmmf.datamodel.models.flatMap((model) =>
    model.fields
      .filter((field) => field.kind === "scalar" && field.name.endsWith("Path"))
      .map((field) => `${model.name}.${field.name}`),
  );
}

/**
 * LA garde du balayage (#72) : une colonne de clé absente de l'inventaire ferait supprimer des
 * objets encore cités. Le schéma est la source, pas la mémoire de qui ajoute la colonne.
 */
describe("OBJECT_KEY_COLUMNS", () => {
  it("couvre chaque colonne en …Path du schéma, plus la file des objets à retirer", () => {
    expect(Object.keys(OBJECT_KEY_COLUMNS).sort()).toEqual(
      [...schemaPathColumns(), "PendingObjectDeletion.key"].sort(),
    );
  });

  // Le filet du filet : si la convention de nommage disparaissait, le test ci-dessus passerait vide.
  it("trouve au schéma les cinq colonnes connues au #72", () => {
    expect(schemaPathColumns()).toHaveLength(5);
  });

  it("ne cite que des colonnes qui existent au schéma", () => {
    const fields = new Set(
      Prisma.dmmf.datamodel.models.flatMap((model) =>
        model.fields.map((field) => `${model.name}.${field.name}`),
      ),
    );
    for (const column of Object.keys(OBJECT_KEY_COLUMNS)) expect(fields).toContain(column);
  });
});

describe("referencedObjectKeys", () => {
  it("réunit les clés citées par n'importe quelle colonne", async () => {
    const db = dbWith({
      exerciseDocument: [{ storagePath: "a" }],
      scheduledSessionExerciseDocument: [{ storagePath: "b" }],
      feedbackMedia: [{ storagePath: "c" }],
      message: [{ storagePath: "d" }],
      invoice: [{ documentPath: "e" }],
      pendingObjectDeletion: [{ key: "f" }],
    });

    await expect(
      referencedObjectKeys(db as unknown as Db, ["a", "b", "c", "d", "e", "f", "g"]),
    ).resolves.toEqual(new Set(["a", "b", "c", "d", "e", "f"]));
  });

  it("interroge chaque colonne sur les clés données, et sur elles seules", async () => {
    const db = dbWith();

    await referencedObjectKeys(db as unknown as Db, ["a", "b"]);

    for (const table of [
      db.exerciseDocument,
      db.scheduledSessionExerciseDocument,
      db.feedbackMedia,
      db.message,
    ]) {
      expect(table.findMany).toHaveBeenCalledWith({
        where: { storagePath: { in: ["a", "b"] } },
        select: { storagePath: true },
      });
    }
    expect(db.invoice.findMany).toHaveBeenCalledWith({
      where: { documentPath: { in: ["a", "b"] } },
      select: { documentPath: true },
    });
    expect(db.pendingObjectDeletion.findMany).toHaveBeenCalledWith({
      where: { key: { in: ["a", "b"] } },
      select: { key: true },
    });
  });

  it("ignore un chemin vide, que le type des colonnes autorise", async () => {
    const db = dbWith({ message: [{ storagePath: null }], invoice: [{ documentPath: null }] });

    await expect(referencedObjectKeys(db as unknown as Db, ["a"])).resolves.toEqual(new Set());
  });

  it("n'interroge rien sans clé", async () => {
    const db = dbWith();

    await expect(referencedObjectKeys(db as unknown as Db, [])).resolves.toEqual(new Set());
    expect(db.message.findMany).not.toHaveBeenCalled();
  });
});
