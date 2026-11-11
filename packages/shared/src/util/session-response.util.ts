import { z } from "zod";

const UNAUTHORIZED = 401;
const BAD_GATEWAY = 502;

const id = z.object({ id: z.string() });

/** Ce que `/get-session` répond vraiment : une session, ou personne (`null`, ou les deux à `null`). */
const sessionBodySchema = z.union([
  z.null(),
  z.object({ session: z.null(), user: z.null() }),
  z.object({ session: id, user: id }),
]);

/** `undefined` sur un texte qui n'est pas du JSON : `null` est, lui, une réponse légitime. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Un 401 sans corps JSON n'a pas été écrit par l'API : un proxy refuse à sa place. */
function isReadable(status: number, text: string): boolean {
  if (status === UNAUTHORIZED) return text === "" || parseJson(text) !== undefined;
  return sessionBodySchema.safeParse(parseJson(text)).success;
}

type ResponseLike = Readonly<{
  ok: boolean;
  status: number;
  statusText: string;
  headers: unknown;
  text: () => Promise<string>;
}>;

type ResponseClass<R extends ResponseLike> = new (
  body: string | null,
  init: Readonly<{ status: number; statusText?: string; headers?: R["headers"] }>,
) => R;

/**
 * Refuse, à l'entrée du client d'auth, ce qui n'est pas une réponse de `/get-session` (#439).
 *
 * Better Auth prend tout corps en 200 pour une réponse : la page HTML d'un portail captif ou d'un
 * proxy devient une « session » que chaque lecteur de `session.user` fait planter, et un corps vide
 * devient `null`, soit « le serveur dit qu'il n'y a personne » : mot de passe réclamé, appareil
 * purgé, sur une session valide. Transformé en 502, ce corps suit le chemin d'une panne : la session
 * connue reste en place, et le prochain retour au premier plan la relira. Un 401 en HTML aussi : il
 * viderait la session. `onRefused` le signale : l'API n'a rien vu de cette réponse (#699).
 *
 * Le corps se relit puis se reconstruit, sans `clone()` : le `fetch` de React Native ne le garantit
 * pas. Les en-têtes suivent, le plugin Expo y lit le cookie de session. `Response` est injectée :
 * ce paquet compile aussi pour Node, sans les types du navigateur.
 */
export function refuseUnreadableSession<R extends ResponseLike>(
  Response: ResponseClass<R>,
  onRefused: () => void,
) {
  return async ({
    request,
    response,
  }: Readonly<{ request: Readonly<{ url: unknown }>; response: R }>): Promise<R | undefined> => {
    const answered = response.ok || response.status === UNAUTHORIZED;
    if (!answered || !String(request.url).split("?")[0]?.endsWith("/get-session")) {
      return undefined;
    }
    const text = await response.text();
    if (!isReadable(response.status, text)) {
      onRefused();
      return new Response(null, { status: BAD_GATEWAY });
    }
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}
