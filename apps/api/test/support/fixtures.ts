import { mondayOfIsoWeek } from "@cmv/shared";
import { expect } from "vitest";
import { productToday } from "../../src/util/date.util";
import type { Agent } from "./actors";

// Le cycle démarre TOUJOURS un lundi (planStartDateSchema) : on prend celui de la semaine en
// cours, pour que le plan diffusé soit bien le plan « courant » vu par l'athlète. La semaine est
// celle de l'API (`productToday`, Paris) : en UTC, le dimanche soir après 22 h, le test et le
// serveur ne parleraient pas de la même semaine (#321).
export function mondayOfCurrentWeek(): string {
  const monday = mondayOfIsoWeek(productToday());
  if (monday == null) throw new Error("[test] lundi de la semaine courante introuvable");
  return monday;
}

// Un instant relatif à maintenant, pour placer l'échéance d'un rappel de part et d'autre du « dû ».
export const inPast = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
export const inFuture = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

export type DocumentFile = { fileName: string; mimeType: string; size: number };

export const jpeg = (fileName: string): DocumentFile => ({
  fileName,
  mimeType: "image/jpeg",
  size: 2048,
});

export const pdf = (fileName: string): DocumentFile => ({
  fileName,
  mimeType: "application/pdf",
  size: 4096,
});

/**
 * Un fichier réellement envoyé sous un exercice, rendu par sa clé : le rattachement confronte sa
 * déclaration à l'objet reçu, une clé signée mais jamais envoyée y est refusée en 404 (#317).
 */
export async function putExerciseFile(
  coach: Agent,
  exerciseId: string,
  file: DocumentFile,
): Promise<string> {
  const signed = await coach.post(`/exercises/${exerciseId}/documents/upload-url`).send(file);
  const uploaded = await fetch(signed.body.uploadUrl, {
    method: "PUT",
    body: Buffer.alloc(file.size, 1),
    headers: { "content-type": file.mimeType },
  });
  expect(uploaded.status).toBe(200);
  return signed.body.storagePath;
}

/**
 * Le PDF justificatif d'un cycle, réellement envoyé au storage puis rattaché à sa facture DRAFT :
 * un test qui éprouve la purge du bucket a besoin d'un objet qui existe. Rend sa clé.
 */
export async function attachInvoiceDocument(coach: Agent, planId: string): Promise<string> {
  const file = { fileName: "facture.pdf", mimeType: "application/pdf", size: 2_000 };
  const signed = await coach.post(`/plans/${planId}/billing/document/upload-url`).send(file);
  expect(signed.status).toBe(201);
  const uploaded = await fetch(signed.body.uploadUrl, {
    method: "PUT",
    body: Buffer.alloc(file.size, 1),
    headers: { "content-type": file.mimeType },
  });
  expect(uploaded.status).toBe(200);
  const attached = await coach
    .put(`/plans/${planId}/billing/document`)
    .send({ storagePath: signed.body.storagePath, ...file });
  expect(attached.status).toBe(200);
  return signed.body.storagePath;
}

/** Une image de consigne réellement envoyée : la purge du stockage se vérifie en la relisant. */
export async function uploadInstructionImage(coach: Agent, exerciseId: string) {
  const image = jpeg("prise.jpg");
  const storagePath = await putExerciseFile(coach, exerciseId, image);
  const attached = await coach.post(`/exercises/${exerciseId}/documents`).send({
    type: "FILE",
    storagePath,
    ...image,
    usage: "INSTRUCTION",
  });
  expect(attached.status).toBe(201);
  return attached.body.id as string;
}
