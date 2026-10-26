import {
  type AttachDocumentInput,
  type ChangeAccessInput,
  type CoachOrganizationDto,
  type CreateCustomMetricInput,
  type CreateExerciseInput,
  type CreateSessionInput,
  type CustomMetric,
  type DuplicateExerciseInput,
  type ElementAccessDto,
  type ExerciseDocumentDto,
  type ExerciseDto,
  LibraryScope,
  type ReloadSessionExerciseInput,
  type RequestUploadUrlInput,
  type SessionDto,
  type StructureDto,
  type StructureInput,
  type StructureLibraryDto,
  type UpdateCustomMetricInput,
  type UpdateExerciseInput,
  type UpdateSessionInput,
  type UpdateStructureInput,
  type UploadUrlDto,
  type VersionQuery,
} from "@cmv/shared";
import { api } from "@/shared/lib/api";

export type ExerciseFilters = {
  /** Ce qui porte l'UN de ces tags (#654). Vide ou absent : pas de filtre. */
  tags?: readonly string[];
  search?: string;
  /** Absent = `all` : tout ce que le Coach peut lire (#605). */
  scope?: LibraryScope;
};

// Clés de cache TanStack Query — une seule racine pour invalider toute la bibliothèque.
export const exerciseKeys = {
  all: ["exercises"] as const,
  // `all` explicite et `all` implicite sont la même requête (cf. `listExercises`) : une seule clé,
  // sinon la liste se relit à l'identique dès que le Coach se découvre une entreprise.
  list: ({ scope, ...filters }: ExerciseFilters) =>
    [
      "exercises",
      "list",
      scope == null || scope === LibraryScope.ALL ? filters : { ...filters, scope },
    ] as const,
  detail: (id: string) => ["exercises", "detail", id] as const,
  tags: () => ["exercises", "tags"] as const,
  customMetrics: (id: string) => ["exercises", "custom-metrics", id] as const,
};

export function listExercises(filters: ExerciseFilters): Promise<ExerciseDto[]> {
  const params = new URLSearchParams();
  for (const tag of filters.tags ?? []) params.append("tag", tag);
  if (filters.search) params.set("search", filters.search);
  // `all` est la valeur par défaut de l'API : l'écrire ne changerait rien à la réponse.
  if (filters.scope != null && filters.scope !== LibraryScope.ALL) {
    params.set("scope", filters.scope);
  }
  const query = params.toString();
  const path = query ? `/exercises?${query}` : "/exercises";
  return api.get<ExerciseDto[]>(path);
}

/**
 * Les tags du coach, pour l'autocomplétion et le filtre. Servis par une route dédiée et non
 * dérivés de la liste affichée : dérivés, ils rétréciraient à chaque clic de filtre, et le coach
 * ne pourrait plus revenir en arrière.
 */
export function listExerciseTags(): Promise<string[]> {
  return api.get<string[]>("/exercises/tags");
}

/**
 * Le constructeur s'ouvre sur une URL, pas depuis une ligne de liste : il ne peut pas compter sur
 * un DTO déjà en mémoire, et doit savoir le charger seul.
 */
export function getExercise(id: string): Promise<ExerciseDto> {
  return api.get<ExerciseDto>(`/exercises/${id}`);
}

/**
 * Le catalogue de métriques du PROPRIÉTAIRE de l'exercice (#605) : dans l'exercice d'un autre
 * Coach, le sélecteur de colonnes ne propose que le sien — ce que l'acteur a chez lui n'y existe
 * pas, et l'API refuserait de l'y citer.
 */
export function listExerciseCustomMetrics(id: string): Promise<CustomMetric[]> {
  return api.get<CustomMetric[]>(`/exercises/${id}/custom-metrics`);
}

export function createExercise(input: CreateExerciseInput): Promise<ExerciseDto> {
  return api.post<ExerciseDto>("/exercises", input);
}

/** « Dupliquer en variante » : le serveur recopie la source, images de consigne comprises (#315). */
export function duplicateExercise(id: string, input: DuplicateExerciseInput): Promise<ExerciseDto> {
  return api.post<ExerciseDto>(`/exercises/${id}/duplicate`, input);
}

export function updateExercise(id: string, input: UpdateExerciseInput): Promise<ExerciseDto> {
  return api.patch<ExerciseDto>(`/exercises/${id}`, input);
}

// Sous la version affichée (#605, MC-8) : un autre Coach a pu écrire l'exercice depuis.
export function deleteExercise(id: string, query: VersionQuery): Promise<void> {
  return api.delete<void>(`/exercises/${id}?${new URLSearchParams(query)}`);
}

/**
 * Les droits de plusieurs exercices d'un coup (#605) : seules les entreprises CHANGÉES partent,
 * une ligne laissée « Mixte » garde la valeur de chaque exercice (tranché en #597).
 */
export function changeExerciseAccess(input: ChangeAccessInput): Promise<ElementAccessDto[]> {
  return api.patch<ElementAccessDto[]>("/exercises/access", input);
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

// ── Métriques maison du coach ────────────────────────────────────────────────

export const customMetricKeys = {
  all: ["custom-metrics"] as const,
  list: () => ["custom-metrics", "list"] as const,
};

export function listCustomMetrics(): Promise<CustomMetric[]> {
  return api.get<CustomMetric[]>("/custom-metrics");
}

export function createCustomMetric(input: CreateCustomMetricInput): Promise<CustomMetric> {
  return api.post<CustomMetric>("/custom-metrics", input);
}

/** La mise à jour REMPLACE la définition entière : `valueType` et `scale` sont liés. */
export function updateCustomMetric(
  id: string,
  input: UpdateCustomMetricInput,
): Promise<CustomMetric> {
  return api.patch<CustomMetric>(`/custom-metrics/${id}`, input);
}

export function deleteCustomMetric(id: string): Promise<void> {
  return api.delete<void>(`/custom-metrics/${id}`);
}

// ── Séances (modèles) ────────────────────────────────────────────────────────

export const sessionKeys = {
  all: ["sessions"] as const,
  list: (scope: LibraryScope) => ["sessions", "list", scope] as const,
  detail: (id: string) => ["sessions", "detail", id] as const,
};

export function listSessions(scope: LibraryScope): Promise<SessionDto[]> {
  // Comme pour les exercices : `all` est le défaut de l'API, inutile de l'écrire.
  return api.get<SessionDto[]>(
    scope === LibraryScope.ALL ? "/sessions" : `/sessions?scope=${scope}`,
  );
}

export function getSession(id: string): Promise<SessionDto> {
  return api.get<SessionDto>(`/sessions/${id}`);
}

/**
 * « Recharger depuis la bibliothèque » : action serveur, parce qu'elle déplace la RÉFÉRENCE de
 * dosage — la seule chose que le client n'a pas le droit d'envoyer.
 */
export function reloadSessionExercise(
  sessionId: string,
  sessionExerciseId: string,
  input: ReloadSessionExerciseInput,
): Promise<SessionDto> {
  return api.post<SessionDto>(
    `/sessions/${sessionId}/exercises/${sessionExerciseId}/reload`,
    input,
  );
}

export function createSession(input: CreateSessionInput): Promise<SessionDto> {
  return api.post<SessionDto>("/sessions", input);
}

// PUT : la composition est remplacée intégralement (replace-all côté API).
export function updateSession(id: string, input: UpdateSessionInput): Promise<SessionDto> {
  return api.put<SessionDto>(`/sessions/${id}`, input);
}

// Sous la version affichée (#605, MC-8) : un autre Coach a pu écrire la séance depuis.
export function deleteSession(id: string, query: VersionQuery): Promise<void> {
  return api.delete<void>(`/sessions/${id}?${new URLSearchParams(query)}`);
}

/** Les droits de plusieurs séances d'un coup, sur le même contrat que les exercices. */
export function changeSessionAccess(input: ChangeAccessInput): Promise<ElementAccessDto[]> {
  return api.patch<ElementAccessDto[]>("/sessions/access", input);
}

// ── Structures (#717) ────────────────────────────────────────────────────────

export const structureKeys = {
  all: ["structures"] as const,
  library: () => ["structures", "library"] as const,
  detail: (id: string) => ["structures", "detail", id] as const,
};

/** Les structures prêtes et celles du Coach, chacune avec son compteur « Séances ». */
export function listStructures(): Promise<StructureLibraryDto> {
  return api.get<StructureLibraryDto>("/structures");
}

export function getStructure(id: string): Promise<StructureDto> {
  return api.get<StructureDto>(`/structures/${id}`);
}

export function createStructure(input: StructureInput): Promise<StructureDto> {
  return api.post<StructureDto>("/structures", input);
}

export function updateStructure(id: string, input: UpdateStructureInput): Promise<StructureDto> {
  return api.put<StructureDto>(`/structures/${id}`, input);
}

// Sous la version affichée (#604) : la structure a pu changer dans un autre onglet.
export function deleteStructure(id: string, query: VersionQuery): Promise<void> {
  return api.delete<void>(`/structures/${id}?${new URLSearchParams(query)}`);
}

// ── Entreprises du coach ─────────────────────────────────────────────────────

export const myOrganizationKeys = {
  all: ["me", "organizations"] as const,
};

/**
 * Les entreprises du Coach et leurs Coachs (#605). Liste vide = Coach sans entreprise : la
 * bibliothèque n'affiche alors rien du partage (tranché en #597).
 */
export function listMyOrganizations(): Promise<CoachOrganizationDto[]> {
  return api.get<CoachOrganizationDto[]>("/me/organizations");
}
