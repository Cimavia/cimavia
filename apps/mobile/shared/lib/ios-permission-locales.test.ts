import { describe, expect, it } from "vitest";
import appJson from "../../app.json";
import en from "../locale/en.json";
import fr from "../locale/fr.json";
import { buildIosPermissionLocales } from "./ios-permission-locales";

const FR = {
  permission: { ios: { photoLibrary: "ta photothèque", microphone: "ton micro" } },
};

describe("buildIosPermissionLocales", () => {
  it("traduit chaque clé Info.plist, langue par langue", () => {
    expect(buildIosPermissionLocales({ fr: FR })).toEqual({
      fr: {
        ios: {
          NSPhotoLibraryUsageDescription: "ta photothèque",
          NSMicrophoneUsageDescription: "ton micro",
        },
      },
    });
  });

  it("refuse une clé absente plutôt que de laisser iOS se replier en silence", () => {
    expect(() =>
      buildIosPermissionLocales({ en: { permission: { ios: { photoLibrary: "photos" } } } }),
    ).toThrow("Le catalogue en n'a pas de clé permission.ios.microphone");
  });

  it("refuse une valeur qui n'est pas une chaîne", () => {
    expect(() => buildIosPermissionLocales({ en: { permission: "photos" } })).toThrow(
      "permission.ios.photoLibrary",
    );
  });

  it.each([
    ["un guillemet droit", 'le "micro"'],
    ["une barre oblique inverse", "le micro\\n"],
  ])("refuse %s, qu'Expo écrirait tel quel dans InfoPlist.strings", (_, microphone) => {
    expect(() =>
      buildIosPermissionLocales({
        fr: { permission: { ios: { photoLibrary: "photos", microphone } } },
      }),
    ).toThrow("fr:permission.ios.microphone contient un caractère");
  });

  it("couvre les deux catalogues livrés", () => {
    const locales = buildIosPermissionLocales({ fr, en });

    expect(Object.keys(locales)).toEqual(["fr", "en"]);
    expect(locales.en?.ios.NSMicrophoneUsageDescription).toMatch(/microphone/);
  });
});

/**
 * Dette IOS-4 : la valeur de base vit dans les plugins d'`app.json`, en plus de `fr.json`, et la
 * chaîne micro y est écrite deux fois. Rien ne signalait une divergence ; ce test le fait.
 */
describe("app.json — valeurs de base des permissions iOS", () => {
  const pluginOptions = (name: string) => {
    const entry = appJson.expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === name,
    );
    return (entry as [string, Record<string, unknown>] | undefined)?.[1];
  };

  it("donne à expo-image-picker les chaînes du catalogue français", () => {
    expect(pluginOptions("expo-image-picker")).toMatchObject({
      photosPermission: fr.permission.ios.photoLibrary,
      microphonePermission: fr.permission.ios.microphone,
    });
  });

  it("donne à expo-audio la même chaîne micro", () => {
    expect(pluginOptions("expo-audio")).toMatchObject({
      microphonePermission: fr.permission.ios.microphone,
    });
  });
});
