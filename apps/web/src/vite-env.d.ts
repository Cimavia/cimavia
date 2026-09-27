/// <reference types="vite/client" />

interface Window {
  /** Posé par `/config.js`, servi au démarrage du conteneur (#417) — lu par `runtime-config.ts`. */
  __CMV_CONFIG__?: unknown;
}
