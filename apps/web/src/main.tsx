// Sentry AVANT tout autre import — le SDK doit être armé quand les modules ci-dessous
// s'évaluent, sinon un crash à leur initialisation part sans trace (cf. instrument.ts).
// Le groupe isolé par des lignes vides est ce qui empêche Biome de le retrier ailleurs.
import "./instrument";

import "./index.css";
import "./shared/lib/i18n";

import { createRoot } from "react-dom/client";
import { CmvCrashScreen } from "./shared/component/CmvCrashScreen";
import { missingRuntimeConfig, runtimeConfig } from "./shared/lib/runtime-config";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

const root = createRoot(rootElement);

/**
 * Sans l'URL de l'API ni le tier, l'app n'a rien de juste à faire : elle le dit (#417, règle dure
 * n°5) au lieu d'appeler `localhost` depuis le navigateur du Coach, l'ancien repli. L'écran de
 * crash remonte l'erreur à Sentry quand son DSN, lui, est là.
 *
 * L'app n'est importée qu'ensuite, et DYNAMIQUEMENT (`app.tsx`) : ses clients `api` et `auth` se
 * construisent à l'import avec l'URL. Contrepartie assumée, un chunk de plus au chargement. Son
 * échec (chunk introuvable après un déploiement, #290) tombe sur le même écran.
 */
const missing = missingRuntimeConfig(runtimeConfig());
if (missing.length > 0) {
  root.render(<CmvCrashScreen error={new Error(`config.js incomplet : ${missing.join(", ")}`)} />);
} else {
  try {
    const { mountApp } = await import("./app");
    mountApp(root);
  } catch (error: unknown) {
    root.render(<CmvCrashScreen error={error} />);
  }
}
