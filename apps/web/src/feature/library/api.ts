import type {
  AttachDocumentInput,
  CreateExerciseInput,
  ExerciseCategory,
  ExerciseDocumentDto,
  ExerciseDto,
  RequestUploadUrlInput,
  UpdateExerciseInput,
  UploadUrlDto,
} from "@cmv/shared";
import { api } from "@/shared/lib/api";

export type ExerciseFilters = {
  category?: ExerciseCategory;
  search?: string;
};

// Clés de cache TanStack Query — une seule racine pour invalider toute la bibliothèque.
export const exerciseKeys = {
  all: ["exercises"] as const,
  list: (filters: ExerciseFilters) => ["exercises", "list", filters] as const,
};

export function listExercises(filters: ExerciseFilters): Promise<ExerciseDto[]> {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.search) params.set("search", filters.search);
  const query = params.toString();
  return api.get<ExerciseDto[]>(`/exercises${query ? `?${query}` : ""}`);
}

export function createExercise(input: CreateExerciseInput): Promise<ExerciseDto> {
  return api.post<ExerciseDto>("/exercises", input);
}

export function updateExercise(id: string, input: UpdateExerciseInput): Promise<ExerciseDto> {
  return api.patch<ExerciseDto>(`/exercises/${id}`, input);
}

export function deleteExercise(id: string): Promise<void> {
  return api.delete<void>(`/exercises/${id}`);
}

// Étape 1 du flux d'upload : obtenir l'URL PUT signée (le binaire ne passe pas par l'API).
export function requestUploadUrl(
  exerciseId: string,
  input: RequestUploadUrlInput,
): Promise<UploadUrlDto> {
  return api.post<UploadUrlDto>(`/exercises/${exerciseId}/documents/upload-url`, input);
}

// Étape 2 : rattacher le document (FILE après envoi, ou LINK externe).
export function attachDocument(
  exerciseId: string,
  input: AttachDocumentInput,
): Promise<ExerciseDocumentDto> {
  return api.post<ExerciseDocumentDto>(`/exercises/${exerciseId}/documents`, input);
}

export function deleteDocument(exerciseId: string, documentId: string): Promise<void> {
  return api.delete<void>(`/exercises/${exerciseId}/documents/${documentId}`);
}
