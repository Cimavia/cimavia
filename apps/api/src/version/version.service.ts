import type { EnvSchema, VersionDto } from "@cmv/shared";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class VersionService {
  constructor(private readonly config: ConfigService<EnvSchema, true>) {}

  /**
   * Les deux `?? null` ne sont pas une politesse de typage : `APP_VERSION` et `APP_BUILD` sont
   * injectées AU BUILD de l'image, donc absentes partout ailleurs. Rendre `null` dit « je ne sais
   * pas » ; rendre « 0.0.0 » dirait « je suis la version 0.0.0 », ce qui est faux (règle dure n°5).
   */
  current(): VersionDto {
    return {
      version: this.config.get("APP_VERSION", { infer: true }) ?? null,
      build: this.config.get("APP_BUILD", { infer: true }) ?? null,
      env: this.config.get("APP_ENV", { infer: true }),
    };
  }
}
