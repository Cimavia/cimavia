import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// baseURL = origine de l'API ; Better Auth y ajoute /api/auth. Cookies cross-origin → CORS credentials côté API.
const baseURL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3000";

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    inferAdditionalFields({
      user: {
        role: { type: "string" },
        locale: { type: "string", required: false },
      },
    }),
  ],
});
