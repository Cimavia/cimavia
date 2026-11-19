import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/feature/auth";
import { AthleteSessionsScreen, type SessionsSegment } from "@/feature/plan";

/**
 * `?segment=upcoming|past` — le segment vit dans l'URL, comme la semaine du planning : revenir
 * d'une séance ouverte doit ramener sur la liste qu'on regardait, pas sur son défaut.
 *
 * Défaut `upcoming` : ce que l'athlète vient chercher, c'est ce qu'il a à faire.
 */
export type SessionsSearch = { segment: SessionsSegment };

export const Route = createFileRoute("/sessions/")({
  validateSearch: (search: Record<string, unknown>): SessionsSearch => ({
    segment: search.segment === "past" ? "past" : "upcoming",
  }),
  component: () => (
    <RoleGate capability="athlete">
      <AthleteSessionsScreen />
    </RoleGate>
  ),
});
