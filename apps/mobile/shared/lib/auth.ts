import { expoClient } from "@better-auth/expo/client";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

// Sur mobile, le cookie de session est stocké chiffré (expo-secure-store) et réinjecté par expoClient.
// baseURL : sur appareil/émulateur, localhost ne pointe pas vers la machine hôte → utiliser l'IP LAN.
const baseURL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

// Le scheme dépend de la variante de build (app.config.ts) : cimavia / cimavia-dev / cimavia-preview.
// Il doit correspondre à une origine de confiance côté API (voir apps/api/src/config/origins.ts).
const configuredScheme = Constants.expoConfig?.scheme;
const scheme =
  (Array.isArray(configuredScheme) ? configuredScheme[0] : configuredScheme) ?? "cimavia";

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    expoClient({
      scheme,
      storagePrefix: "cimavia",
      storage: SecureStore,
    }),
    inferAdditionalFields({
      user: {
        role: { type: "string" },
        locale: { type: "string", required: false },
      },
    }),
  ],
});
