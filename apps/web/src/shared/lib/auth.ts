import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// baseURL = origine de l'API ; Better Auth y ajoute /api/auth. Cookies cross-origin → CORS credentials côté API.
const baseURL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3000";

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    /**
     * Ces déclarations sont ce qui fait exister les champs dans `useSession().data.user` : Better
     * Auth ne remonte que les `additionalFields` DÉCLARÉS. Sans les capacités ici, `capabilitiesOf`
     * rendrait « aucune capacité » à tout le monde — nav vide, redirections cassées — et ni `tsc`
     * ni le build ne le verraient (#9).
     */
    inferAdditionalFields({
      user: {
        isCoach: { type: "boolean", required: false },
        isAthlete: { type: "boolean", required: false },
        role: { type: "string" },
        locale: { type: "string", required: false },
      },
    }),
  ],
});
