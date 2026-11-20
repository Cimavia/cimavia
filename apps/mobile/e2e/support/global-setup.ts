import {
  assertOneDevice,
  buildApk,
  installApk,
  pinTimeZone,
  relayAdbServer,
  reverseApiPort,
  uninstallApk,
} from "./device";

/**
 * Avant les parcours : l'appareil et son fuseau, puis la build, puis son installation. L'API de
 * test, elle, est déjà là — Playwright démarre ses `webServer` AVANT ce global setup.
 *
 * `CMV_E2E_SKIP_BUILD=1` réinstalle la dernière build sans la refaire : une relance ne paie pas
 * 5 à 10 minutes de Gradle quand seuls les flux ou le seed ont changé.
 *
 * Chaque étape faite inscrit de quoi la défaire, et le teardown les défait toutes, dans l'ordre
 * inverse, même si l'une échoue. Un build qui casse défait donc ce qui l'a précédé : Playwright ne
 * reçoit le teardown qu'en cas de succès, et l'émulateur du poste resterait sinon sur le fuseau de
 * la suite, sa détection automatique coupée.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const undo: Array<() => Promise<void>> = [];
  const teardown = async () => {
    const failures: unknown[] = [];
    for (const step of [...undo].reverse()) {
      try {
        await step();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, "teardown e2e mobile incomplet");
  };

  try {
    const relay = await relayAdbServer();
    if (relay != null) undo.push(relay.close);
    await assertOneDevice();
    undo.push(await pinTimeZone());
    if (process.env.CMV_E2E_SKIP_BUILD !== "1") await buildApk();
    // Inscrit AVANT l'installation : une installation interrompue se retire aussi.
    undo.push(uninstallApk);
    await installApk();
    undo.push(await reverseApiPort());
  } catch (error) {
    // L'erreur du setup est celle qui compte : celles du nettoyage n'y ajoutent que du bruit.
    await teardown().catch(() => undefined);
    throw error;
  }
  return teardown;
}
