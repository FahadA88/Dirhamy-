/*
  Handing somebody a file, in a page that may not be allowed to.

  Everywhere Faro normally runs — a browser tab, the PWA — an anchor with a `download` attribute
  saves a file, and every export here did exactly that. Inside the claude.ai artifact viewer the
  page is framed and that anchor does NOTHING: no error, no file, no clue. The match export, the
  record export and the shared hand picture were all dead there, silently, which is the worst way
  for a feature to be broken. The host mediates it through a capability instead: ask for
  `downloads`, call `save`, and the VIEWER confirms the file.

  So there are two worlds and one function. `window.claude.use` tells them apart — it exists only
  when the page is framed by a host that offers capabilities at all — and nothing else about
  either path leaks into the callers.
*/

interface DownloadsNamespace {
  save(req: { filename: string; data: Blob | string }): Promise<{ status: string }>;
}
interface ClaudeHost { use(name: string): Promise<unknown> }

function host(): ClaudeHost | null {
  if (typeof window === 'undefined') return null;
  const c = (window as unknown as { claude?: ClaudeHost }).claude;
  return typeof c?.use === 'function' ? c : null;
}

/*
  Resolved once and kept. `use()` is memoized by the platform anyway, but the host is allowed to
  take up to ten seconds to answer and a second export should not sit through that again.

  Keyed on the host object itself rather than a bare flag: if the page is ever handed a
  different `window.claude` the old answer is not about this one, and a cache that cannot be
  wrong for the wrong host is also a cache a test can drive.
*/
let cachedHost: ClaudeHost | null = null;
let pending: Promise<DownloadsNamespace | null> | null = null;
function downloads(): Promise<DownloadsNamespace | null> {
  const c = host();
  if (!c) return Promise.resolve(null);
  if (c !== cachedHost) { cachedHost = c; pending = null; }
  pending ??= c.use('downloads')
    .then((ns) => (ns && typeof (ns as DownloadsNamespace).save === 'function'
      ? (ns as DownloadsNamespace) : null))
    .catch(() => null);
  return pending;
}

/**
 * What happened, in the caller's terms rather than the platform's.
 *
 * `declined` is not a failure and must not be reported as one — the viewer was asked and said
 * no, which is the capability working. `unavailable` is the one worth saying out loud: the page
 * cannot hand over files here at all, and the person is otherwise left staring at a button that
 * did nothing.
 */
export type SaveOutcome = 'saved' | 'declined' | 'unavailable' | 'failed';

/** Whether this page can hand the viewer a file at all. Resolves false only in a framed host
 *  that will not serve `downloads` — a plain browser tab is always true. */
export async function canSaveFiles(): Promise<boolean> {
  return host() === null || (await downloads()) !== null;
}

/**
 * Offer `data` to the person as a file called `filename`.
 *
 * Never throws: every caller here is a button, and a button that explodes is worse than one that
 * reports. In a plain browser this is the anchor it always was.
 */
export async function saveFile(filename: string, data: Blob | string): Promise<SaveOutcome> {
  const ns = await downloads();

  if (ns) {
    try {
      await ns.save({ filename, data });
      return 'saved';
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'declined') return 'declined';
      // rate_limited means a prompt is already open — the person is being asked right now, and
      // a second dialog is not what they need. Everything else is either a bug here or the
      // capability going away mid-session; both leave them with no file either way.
      if (code === 'rate_limited') return 'declined';
      if (code === 'not_granted' || code === 'unavailable'
        || code === 'capability_disabled' || code === 'capability_removed') return 'unavailable';
      return 'failed';
    }
  }

  // A framed host that will not serve downloads: the anchor below would do nothing at all, and
  // saying so is the whole point of this file.
  if (host()) return 'unavailable';

  try {
    const blob = typeof data === 'string' ? new Blob([data], { type: 'text/plain' }) : data;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return 'saved';
  } catch {
    return 'failed';
  }
}

/** The sentence to show for an outcome, or null when there is nothing worth saying. */
export function saveMessage(outcome: SaveOutcome, what = 'file'): string | null {
  if (outcome === 'saved' || outcome === 'declined') return null;
  return outcome === 'unavailable'
    ? `This page cannot save files where it is running — the ${what} could not be handed over.`
    : `Something went wrong saving the ${what}.`;
}
