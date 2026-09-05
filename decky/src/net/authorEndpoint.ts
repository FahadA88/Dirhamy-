// The host's game writer.
//
// The one place an API key exists. The browser posts a description here and gets back the
// model's text; it never sees the key and never talks to the model itself. Everything the
// reply is then put through — parsing, validation, a hundred-and-twenty-game playtest —
// happens on the client against the same engine the table uses, so a host that lies about a
// game still cannot ship an unplayable one.
//
// Two backends, picked by whichever key is set. Gemini's free tier needs nothing but a Google
// account, so it's the default recommendation; Anthropic still works if ANTHROPIC_API_KEY is set.

const GEMINI_MODEL = process.env.DECKY_AUTHOR_MODEL ?? 'gemini-2.0-flash';
const ANTHROPIC_MODEL = process.env.DECKY_AUTHOR_MODEL ?? 'claude-sonnet-5';

export interface AuthorRequest { system?: unknown; user?: unknown; model?: unknown }
export interface AuthorReply { text?: string; error?: string; status: number }

/** True when this host can write games at all. Lets the UI say so before you type. */
export function canAuthor(): boolean {
  return !!process.env.GEMINI_API_KEY || !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Which models this host will actually use, so the interface can offer a real choice rather
 * than a list of names it hopes work. The key never leaves this process — only the fact that
 * one exists, and what it can drive.
 */
export function authorModels(): { provider: string; models: { id: string; name: string; blurb: string }[] } {
  if (process.env.GEMINI_API_KEY) {
    return {
      provider: 'Gemini',
      models: [
        { id: 'gemini-2.0-flash', name: 'Flash', blurb: 'Quick, and free on Google\u2019s own tier.' },
        { id: 'gemini-2.5-flash', name: 'Flash 2.5', blurb: 'Newer, a little slower, follows a long brief better.' },
        { id: 'gemini-2.5-pro', name: 'Pro', blurb: 'Slowest and best at unusual rules.' },
      ],
    };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: 'Anthropic',
      models: [
        { id: 'claude-haiku-4-5-20251001', name: 'Haiku', blurb: 'Fast and cheap.' },
        { id: 'claude-sonnet-5', name: 'Sonnet', blurb: 'The balanced one.' },
        { id: 'claude-opus-5', name: 'Opus', blurb: 'Best at rules nobody has written down before.' },
      ],
    };
  }
  return { provider: '', models: [] };
}

export async function handleAuthor(payload: AuthorRequest): Promise<AuthorReply> {
  const system = typeof payload.system === 'string' ? payload.system : '';
  const user = typeof payload.user === 'string' ? payload.user : '';
  if (!system || !user) return { status: 400, error: 'Both system and user are required.' };
  // A description is a sentence or two. Anything past this is somebody using the endpoint as a
  // free model, not describing a card game.
  if (user.length > 8000) return { status: 413, error: 'That description is too long.' };

  // A caller may name a model, but only one this host has offered. Anything else falls back to
  // the default rather than being passed through to the provider — the browser does not get to
  // pick what this key is spent on.
  const offered = authorModels().models.map((m) => m.id);
  const asked = typeof payload.model === 'string' && offered.includes(payload.model) ? payload.model : null;

  if (process.env.GEMINI_API_KEY) return callGemini(process.env.GEMINI_API_KEY, system, user, asked);
  if (process.env.ANTHROPIC_API_KEY) return callAnthropic(process.env.ANTHROPIC_API_KEY, system, user, asked);
  return { status: 501, error: 'This host has no GEMINI_API_KEY or ANTHROPIC_API_KEY, so it cannot write games.' };
}

async function callGemini(key: string, system: string, user: string, model: string | null): Promise<AuthorReply> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model ?? GEMINI_MODEL}:generateContent?key=${key}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 4096 },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { status: 502, error: `The model refused (${res.status}). ${detail.slice(0, 300)}` };
    }
    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    if (!text) return { status: 502, error: 'The model returned nothing.' };
    return { status: 200, text };
  } catch (e) {
    return { status: 502, error: `Could not reach the model: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function callAnthropic(key: string, system: string, user: string, model: string | null): Promise<AuthorReply> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model ?? ANTHROPIC_MODEL,
        max_tokens: 4096,
        // The schema briefing is identical on every request and long, so caching it turns the
        // repair loop from three full-price calls into one.
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { status: 502, error: `The model refused (${res.status}). ${detail.slice(0, 300)}` };
    }
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (body.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');
    if (!text) return { status: 502, error: 'The model returned nothing.' };
    return { status: 200, text };
  } catch (e) {
    return { status: 502, error: `Could not reach the model: ${e instanceof Error ? e.message : String(e)}` };
  }
}
