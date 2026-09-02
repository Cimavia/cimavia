import { MediaType } from "@cmv/shared";
import type { ImagePickerAsset } from "expo-image-picker";
import { describe, expect, it } from "vitest";
import { assetMediaKind } from "./media-kind.util";

const asset = (type: string) => ({ type }) as ImagePickerAsset;

describe("assetMediaKind", () => {
  it("distingue une vidéo d'une photo", () => {
    expect(assetMediaKind(asset("video"))).toBe(MediaType.VIDEO);
    expect(assetMediaKind(asset("image"))).toBe(MediaType.IMAGE);
  });

  /**
   * LA raison d'être de cette fonction : `prepareMedia` aiguille sur `asset.type === "video"` et
   * envoie donc TOUT le reste vers la préparation photo. Les cas exotiques du picker (live photo
   * iOS, vidéo appairée) doivent occuper la place que leur préparation consommera vraiment —
   * sinon un média occupe une place de photo et se prépare comme une vidéo.
   */
  it("range comme photo tout ce qui n'est pas une vidéo, comme le fait la préparation", () => {
    expect(assetMediaKind(asset("livePhoto"))).toBe(MediaType.IMAGE);
    expect(assetMediaKind(asset("pairedVideo"))).toBe(MediaType.IMAGE);
  });
});
