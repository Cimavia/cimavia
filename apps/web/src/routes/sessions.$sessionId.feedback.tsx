import { createFileRoute } from "@tanstack/react-router";
import { AthleteFeedbackScreen } from "@/feature/feedback";

/**
 * Débrief d'une séance : athlète seul — garde portée par le layout du sous-arbre
 * (`sessions.$sessionId.tsx`). C'est structurel : le débrief est ÉCRIT par l'athlète
 * (`@Roles([ATHLETE])` sur `session-feedback.controller.ts`), le coach le lit par sa propre
 * surface (`/feedbacks`).
 */
export const Route = createFileRoute("/sessions/$sessionId/feedback")({
  component: AthleteFeedbackScreen,
});
