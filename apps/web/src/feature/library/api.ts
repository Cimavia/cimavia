import type {
  AttachDocumentInput,
  CreateExerciseInput,
  CreateSessionInput,
  ExerciseCategory,
  ExerciseDocumentDto,
  ExerciseDto,
  RequestUploadUrlInput,
  SessionDto,
  UpdateExerciseInput,
  UpdateSessionInput,
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
  const path = query ? `/exercises?${query}` : "/exercises";
  return api.get<ExerciseDto[]>(path);
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

// ── Séances (modèles) ────────────────────────────────────────────────────────

export const sessionKeys = {
  all: ["sessions"] as const,
  list: () => ["sessions", "list"] as const,
};

export function listSessions(): Promise<SessionDto[]> {
  return api.get<SessionDto[]>("/sessions");
}

export function createSession(input: CreateSessionInput): Promise<SessionDto> {
  return api.post<SessionDto>("/sessions", input);
}

// PUT : la composition est remplacée intégralement (replace-all côté API).
export function updateSession(id: string, input: UpdateSessionInput): Promise<SessionDto> {
  return api.put<SessionDto>(`/sessions/${id}`, input);
}

export function deleteSession(id: string): Promise<void> {
  return api.delete<void>(`/sessions/${id}`);
}
