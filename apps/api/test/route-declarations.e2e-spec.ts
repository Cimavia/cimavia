import { RequestMethod, type Type } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { RouteParamtypes } from "@nestjs/common/enums/route-paramtypes.enum";
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { Test, type TestingModule } from "@nestjs/testing";
import { AllowAnonymous, OptionalAuth } from "@thallesp/nestjs-better-auth";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import {
  NO_CAPABILITY,
  routeDeclarationOf,
} from "../src/auth/decorator/require-capability.decorator";
import { hasSchema } from "../src/zod/zod.util";
import { ZodSchemaPipe } from "../src/zod/zod-schema.pipe";

/**
 * Chaque route montée déclare son scope (#622) : la capacité qu'elle exerce
 * (`@RequireCapability`), aucune (`@ExercisesNoCapability`), ou aucune authentification
 * (`@AllowAnonymous`, `@OptionalAuth`). Une route joignable sans session n'exige jamais de
 * capacité.
 *
 * Sans ce test, une route qu'on a oublié de déclarer passe `CapabilitiesGuard` sans exigence et
 * ressemble trait pour trait à une route volontairement ouverte aux deux capacités — rien ne
 * distingue l'oubli de la décision, ni en revue ni à l'exécution.
 *
 * Une suite à part, et seulement compilée : l'énumération lit les métadonnées des contrôleurs que
 * `AppModule` monte vraiment, sans démarrer de serveur ni toucher la base.
 */

/**
 * La clé de métadonnée qu'un décorateur pose, lue sur une cible témoin :
 * `@thallesp/nestjs-better-auth` n'exporte pas les siennes, et les recopier en dur laisserait un
 * renommage passer en silence.
 */
function metadataKeyOf(decorator: ClassDecorator): unknown {
  const probe = () => undefined;
  decorator(probe);
  return Reflect.getOwnMetadataKeys(probe)[0];
}

/** Les deux façons de joindre une route sans session : anonyme, ou authentification facultative. */
const ANONYMOUS_KEYS = [metadataKeyOf(AllowAnonymous()), metadataKeyOf(OptionalAuth())];

/**
 * La surface joignable sans session, figée : une route qu'on rend anonyme doit s'ajouter ici, à la
 * main et en revue, plutôt que de passer avec son seul décorateur.
 */
const ANONYMOUS_ROUTES = ["GET /health", "GET /health/ready", "POST /internal/reminders/tick"];

type Route = {
  label: string;
  declared: boolean;
  requiresCapability: boolean;
  anonymous: boolean;
  queries: Query[];
};

/** Un argument `@Query` du handler : `?search`, ou `?*` pour la requête entière. */
type Query = { name: string; validated: boolean };

type RouteArg = { index: number; data?: unknown; pipes?: unknown[] };

let moduleRef: TestingModule;
let routes: Route[];

/** `/a`, `a/`, `` → un chemin normalisé, pour lire `GET /me/notifications` et non `GET me//`. */
function joinPath(...parts: (string | undefined)[]): string {
  const segments = parts.flatMap((part) => (part ?? "").split("/")).filter(Boolean);
  return `/${segments.join("/")}`;
}

/**
 * Les arguments `@Query` d'un handler, et s'ils passent par Zod (#352) : un `ZodSchemaPipe`
 * posé sur l'argument, ou un type DTO qui porte son schéma, que le pipe global applique. Une
 * clé brute (`@Query("search") search?: string`) n'a ni l'un ni l'autre : une clé répétée y
 * arrive en tableau, et le premier `.trim()` venu fait un 500.
 */
function queriesOf(controller: Type, name: string): Query[] {
  const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, name) ?? {}) as Record<
    string,
    RouteArg
  >;
  const types = (Reflect.getMetadata("design:paramtypes", controller.prototype, name) ??
    []) as unknown[];
  return (
    Object.entries(args)
      // Clé `<type>:<index>` — `4:1` pour un `@Query` en 2e position.
      .filter(([key]) => key.startsWith(`${RouteParamtypes.QUERY}:`))
      .map(([, arg]) => ({
        name: `?${typeof arg.data === "string" ? arg.data : "*"}`,
        validated:
          (arg.pipes ?? []).some((pipe) => pipe instanceof ZodSchemaPipe) ||
          hasSchema(types[arg.index]),
      }))
  );
}

function mountedRoutes(module: TestingModule): Route[] {
  const discovery = module.get(DiscoveryService);
  const scanner = module.get(MetadataScanner);
  const reflector = module.get(Reflector);

  return discovery.getControllers().flatMap(({ metatype }) => {
    const controller = metatype as Type;
    const prototype = controller.prototype as Record<string, unknown>;
    return scanner.getAllMethodNames(prototype).flatMap((name) => {
      const handler = prototype[name] as (...args: unknown[]) => unknown;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (path === undefined) return [];

      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
      const declaration = routeDeclarationOf(reflector, {
        getHandler: () => handler,
        getClass: () => controller,
      });
      return [
        {
          label: `${method} ${joinPath(Reflect.getMetadata(PATH_METADATA, controller), path)} (${controller.name}.${name})`,
          declared: declaration != null,
          requiresCapability: declaration != null && declaration !== NO_CAPABILITY,
          anonymous: ANONYMOUS_KEYS.some(
            (key) =>
              reflector.getAllAndOverride<boolean>(key as string, [handler, controller]) === true,
          ),
          queries: queriesOf(controller, name),
        },
      ];
    });
  });
}

/** `GET /health (HealthController.live)` → `GET /health`. */
function withoutHandler(label: string): string {
  return label.replace(/ \(.*\)$/, "");
}

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule] }).compile();
  routes = mountedRoutes(moduleRef);
});

afterAll(async () => {
  await moduleRef?.close();
});

describe("déclaration de scope des routes (#622)", () => {
  it("trouve les routes montées", () => {
    // Garde contre un test vert par vacuité : une énumération vide ne refuserait rien.
    expect(routes.map((r) => withoutHandler(r.label))).toContain("GET /me/notifications");
  });

  it("aucune route ne repose sur l'absence de déclaration", () => {
    const undeclared = routes.filter((r) => !r.declared && !r.anonymous).map((r) => r.label);
    expect(undeclared).toEqual([]);
  });

  it("aucune route joignable sans session n'exige de capacité", () => {
    // Sans utilisateur, la garde lèverait (500) : la contradiction se voit ici, pas en production.
    const contradictory = routes
      .filter((r) => r.requiresCapability && r.anonymous)
      .map((r) => r.label);
    expect(contradictory).toEqual([]);
  });

  it("la surface joignable sans session est exactement celle qu'on a décidée", () => {
    const anonymous = routes.filter((r) => r.anonymous).map((r) => withoutHandler(r.label));
    expect(new Set(anonymous)).toEqual(new Set(ANONYMOUS_ROUTES));
    expect(anonymous).toHaveLength(ANONYMOUS_ROUTES.length);
  });
});

describe("validation des paramètres de requête (#352)", () => {
  it("trouve les paramètres de requête, sous pipe comme sous DTO", () => {
    // Même garde contre la vacuité : sans arguments `@Query` énumérés, tout passerait.
    const validated = routes.flatMap((r) =>
      r.queries.filter((q) => q.validated).map((q) => `${withoutHandler(r.label)} ${q.name}`),
    );
    expect(validated).toContain("DELETE /exercises/:id ?*");
    expect(validated).toContain("GET /me/notifications ?*");
  });

  it("aucun paramètre de requête n'échappe à Zod", () => {
    const unvalidated = routes.flatMap((r) =>
      r.queries.filter((q) => !q.validated).map((q) => `${r.label} ${q.name}`),
    );
    expect(unvalidated).toEqual([]);
  });
});
