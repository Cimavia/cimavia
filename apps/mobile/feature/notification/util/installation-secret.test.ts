import * as SecureStore from "expo-secure-store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readInstallationSecret, storeInstallationSecret } from "./installation-secret";

const getItemAsync = vi.mocked(SecureStore.getItemAsync);
const setItemAsync = vi.mocked(SecureStore.setItemAsync);

beforeEach(() => {
  vi.clearAllMocks();
  getItemAsync.mockResolvedValue(null);
  setItemAsync.mockResolvedValue(undefined);
});

describe("readInstallationSecret", () => {
  it("rend le secret déjà rangé", async () => {
    getItemAsync.mockResolvedValue("s3cret-dinstallation");

    expect(await readInstallationSecret()).toBe("s3cret-dinstallation");
  });

  // Premier lancement, ou app d'avant #90 : l'API en émettra un.
  it("rend null quand il n'y en a pas encore", async () => {
    expect(await readInstallationSecret()).toBeNull();
  });

  // Un trousseau verrouillé ne doit pas empêcher d'enregistrer l'appareil : l'API réémettra,
  // puisque la session prouve déjà à qui la ligne appartient.
  it("rend null plutôt que de lever quand le stockage est indisponible", async () => {
    getItemAsync.mockRejectedValue(new Error("trousseau indisponible"));

    expect(await readInstallationSecret()).toBeNull();
  });
});

describe("storeInstallationSecret", () => {
  // La clé est le contrat avec l'installation précédente : la changer perdrait tous les secrets
  // déjà distribués, donc la possibilité de réaffecter chaque appareil.
  it("range le secret sous une clé stable", async () => {
    await storeInstallationSecret("secret-neuf");

    expect(setItemAsync).toHaveBeenCalledWith("cmv.push.installation-secret", "secret-neuf");
  });

  it("n'échoue pas quand l'écriture est refusée", async () => {
    setItemAsync.mockRejectedValue(new Error("stockage plein"));

    await expect(storeInstallationSecret("secret-neuf")).resolves.toBeUndefined();
  });
});
