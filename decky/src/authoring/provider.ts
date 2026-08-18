// Where the model call happens.
//
// The browser never holds an API key. It posts the description to an endpoint and the host —
// which already exists to referee tables — makes the call with a key from its own environment.
// That keeps the secret on the server side of the wire, the same place the rules already live.
//
// If nobody has configured an endpoint, the feature says so plainly. It does not quietly fall
// back to something dumber and let you think a model wrote your game.

import { AuthorProvider } from './author';

export const NO_MODEL =
  'No game writer is configured. Run the host with an ANTHROPIC_API_KEY and point the site at it, '
  + 'or build your game with the editor instead.';

/** The default: ask whatever host is serving the tables. */
export function httpAuthorProvider(endpoint: string): AuthorProvider {
  return {
    name: 'host',
    async complete({ system, user }) {
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ system, user }),
        });
      } catch {
        throw new Error(NO_MODEL);
      }
      if (res.status === 404 || res.status === 501) throw new Error(NO_MODEL);
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`The game writer failed (${res.status}). ${detail.slice(0, 200)}`);
      }
      const body = (await res.json()) as { text?: string; error?: string };
      if (body.error) throw new Error(body.error);
      if (!body.text) throw new Error('The game writer returned nothing.');
      return body.text;
    },
  };
}

/** Stands in when nothing is configured, so the failure is a sentence rather than a stack. */
export const unavailableProvider: AuthorProvider = {
  name: 'none',
  async complete() { throw new Error(NO_MODEL); },
};

/**
 * Which provider the app should use. An endpoint can be pinned at build time for a deployment
 * that has one; otherwise we try the host we are served from and let it 404 into a clear message.
 */
export function defaultProvider(): AuthorProvider {
  const pinned = (import.meta as { env?: Record<string, string> }).env?.VITE_AUTHOR_ENDPOINT;
  if (pinned) return httpAuthorProvider(pinned);
  if (typeof window === 'undefined') return unavailableProvider;
  return httpAuthorProvider('/api/author');
}
