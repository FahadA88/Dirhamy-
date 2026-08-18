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

export interface AuthorRequest { system?: unknown; user?: unknown }
export interface AuthorReply { text?: string; error?: string; status: number }

/** True when this host can write games at all. Lets the UI say so before you type. */
export function canAuthor(): boolean {
  return !!process.env.GEMINI_API_KEY || !!process.env.ANTHROPIC_API_KEY;
}

export async function handleAuthor(payload: AuthorRequest): Promise<AuthorReply> {
  const system = typeof payload.system === 'string' ? payload.system : '';
  const user = typeof payload.user === 'string' ? payload.user : '';
  if (!system || !user) return { status: 400, error: 'Both system and user are required.' };
  // A description is a sentence or two. Anything past this is somebody using the endpoint as a
  // free model, not describing a card game.
  if (user.length > 8000) return { status: 413, error: 'That description is too long.' };

  if (process.env.GEMINI_API_KEY) return callGemini(process.env.GEMINI_API_KEY, system, user);
  if (process.env.ANTHROPIC_API_KEY) return callAnthropic(process.env.ANTHROPIC_API_KEY, system, user);
  return { status: 501, error: 'This host has no GEMINI_API_KEY or ANTHROPIC_API_KEY, so it cannot write games.' };
}

async function callGemini(key: string, system: string, user: string): Promise<AuthorReply> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
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

async function callAnthropic(key: string, system: string, user: string): Promise<AuthorReply> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
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
