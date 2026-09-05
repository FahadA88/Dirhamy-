import { useState } from 'react';
import { Knobs } from '../authoring/knobs';
import { RuleDraft } from '../authoring/ruleKit';
import { AuthorResult, AuthorStep, authorGame } from '../authoring/author';
import { defaultProvider } from '../authoring/provider';
import { SimReport } from '../engine/simulator';
import { Draft, allDrafts, forgetDraft, saveDraft } from '../authoring/drafts';
import { hostInfo, HostInfo } from '../net/host';
import { useEffect } from 'react';

// Describe a game; get a game.
//
// The important part of this screen is not the box you type in. It is that the work is shown:
// the thing writes a draft, the engine checks it, the bots play it a hundred and twenty times,
// and if any of that fails it goes back and tries again — and you watch that happen. A game
// that appears here has been played to a finish before you see it.
//
// When it lands you get the real knobs and the real rules, in the editor, editable. Nothing is
// a black box you have to accept whole.

// Each one carries its own label. Chopping the prompt itself at thirty-four characters gave a
// button that read "Bluff…" — a word and an ellipsis, which tells nobody what pressing it does.
const EXAMPLES = [
  {
    label: 'Face down, and lie about it',
    text: 'Bluff: everyone is dealt the whole deck. On your turn you put cards face down and claim a rank. Anyone can call you a liar — if they are right you take the pile, if they are wrong they do.',
  },
  {
    label: 'Hearts, played in partnerships',
    text: 'A trick-taking game for four in partnerships where hearts are worth minus one and the queen of spades is minus thirteen. First partnership to minus a hundred loses.',
  },
  {
    label: 'Crazy Eights with a nasty seven',
    text: 'Like Crazy Eights, but a seven makes the next player draw two and a jack reverses the direction.',
  },
];

export function DescribeGame({ onBuilt }: {
  onBuilt: (r: {
    knobs: Partial<Knobs>; rules: RuleDraft[]; report: SimReport; notes: string[];
    /** What was typed to produce it, so publishing can say where the game came from. */
    prompt: string;
  }) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<AuthorStep[]>([]);
  const [result, setResult] = useState<AuthorResult | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>(() => allDrafts());
  const [showDrafts, setShowDrafts] = useState(false);
  // Which writer this host actually has, and which of its models to use.
  const [host, setHost] = useState<HostInfo | null>(null);
  const [model, setModel] = useState<string>('');

  useEffect(() => { void hostInfo().then(setHost); }, []);

  async function go() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setResult(null);
    setSteps([]);
    const r = await authorGame(text, defaultProvider(model || undefined), (s) => setSteps((prev) => [...prev, s]));
    setResult(r);
    setBusy(false);
    // Kept whether it worked or not. A description that nearly worked is the most useful thing
    // you have, and it used to disappear the moment you typed over it.
    saveDraft({
      description: text,
      ok: r.ok,
      name: r.definition?.meta.name,
      knobs: r.knobs,
      rules: r.rules,
      report: r.report,
      notes: r.notes,
      error: r.error,
    });
    setDrafts(allDrafts());
  }


  return (
    <section className="describe">
      <div className="describe-head">
        <h2>Describe it, and it gets built</h2>
        <p className="muted">
          Say how the game works in your own words. It writes the whole thing, the engine checks it,
          and bots play it 120 times before you see it.
        </p>
      </div>

      <textarea
        className="describe-box"
        rows={5}
        value={text}
        placeholder="On your turn you put cards face down and claim a rank…"
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
      />

      <div className="describe-actions">
        <button className="primary" onClick={go} disabled={busy || !text.trim()}>
          {busy ? 'Building…' : 'Build it'}
        </button>
        {/* A disabled button with no stated cause is the commonest dead end in a form — it reads
            as the product being broken rather than as a step not done yet. */}
        {!busy && !text.trim() && (
          <span className="muted describe-hint">Describe your game above first.</span>
        )}
        {/* Only shown when there is a real choice to make. A host with one model, or none,
            should not be asked about it. */}
        {host && host.authorModels.length > 1 && (
          <label className="model-pick">
            <span className="muted">{host.authorProvider}</span>
            <select value={model || host.authorModels[0].id} disabled={busy}
              aria-label="Which model writes the game"
              onChange={(e) => setModel(e.target.value)}>
              {host.authorModels.map((m) => (
                <option key={m.id} value={m.id} title={m.blurb}>{m.name}</option>
              ))}
            </select>
          </label>
        )}
        {!busy && !result && (
          <span className="muted">Or pick a starting point below and build it by hand.</span>
        )}
      </div>

      {!busy && !result && (
        <div className="describe-examples">
          {EXAMPLES.map((e, i) => (
            <button key={i} className="chip" onClick={() => setText(e.text)} title={e.text}>{e.label}</button>
          ))}
        </div>
      )}

      {steps.length > 0 && (
        <ol className="describe-steps">
          {steps.map((s, i) => (
            <li key={i} className={`ds-${s.stage} ${i === steps.length - 1 && busy ? 'live' : ''}`}>
              <span className="ds-mark" aria-hidden="true">
                {s.stage === 'failed' ? '✕' : s.stage === 'done' ? '✓' : s.stage === 'repairing' ? '↻' : '•'}
              </span>
              <span className="ds-text">{s.detail}</span>
              {s.attempt > 1 && <span className="ds-attempt">try {s.attempt}</span>}
            </li>
          ))}
        </ol>
      )}

      {result?.ok && result.report && (
        <div className="describe-result ok">
          <h3>{result.definition?.meta.name}</h3>
          <p className="muted">{result.definition?.meta.description}</p>
          <div className="dr-stats">
            <span><b>{result.report.terminated}/{result.report.games}</b> games finished</span>
            <span><b>{result.report.avgMoves.toFixed(0)}</b> moves each</span>
            <span><b>{result.rules?.length ?? 0}</b> custom rule{(result.rules?.length ?? 0) === 1 ? '' : 's'}</span>
            <span>seats {result.report.winRateBySeat.map((w) => `${Math.round(w * 100)}%`).join(' / ')}</span>
          </div>
          {result.notes.length > 0 && (
            <div className="dr-notes">
              <b>What it could not do</b>
              <ul>{result.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </div>
          )}
          <button
            className="primary"
            onClick={() => onBuilt({
              knobs: result.knobs!, rules: result.rules ?? [], report: result.report!,
              notes: result.notes, prompt: text,
            })}
          >
            Open it in the editor →
          </button>
        </div>
      )}

      {result && !result.ok && (
        <div className="describe-result bad">
          <h3>It could not build that</h3>
          <p>{result.error}</p>
          <Advice result={result} />
          {/* The pipeline already records every stage of every attempt. Showing them is the
              difference between "it did not work" and knowing which part did not. */}
          {result.steps.length > 0 && (
            <details className="dr-detail">
              <summary>What it tried</summary>
              <ol className="describe-steps">
                {result.steps.map((s, i) => (
                  <li key={i} className={`ds-${s.stage}`}>
                    <span className="ds-mark" aria-hidden="true">{s.stage === 'failed' ? '✕' : '•'}</span>
                    <span className="ds-text">{s.detail}</span>
                    {s.attempt > 1 && <span className="ds-attempt">try {s.attempt}</span>}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}

      {drafts.length > 0 && !busy && (
        <div className="drafts">
          <button className="ghost sm" aria-expanded={showDrafts} onClick={() => setShowDrafts((v) => !v)}>
            {showDrafts ? 'Hide' : `Earlier attempts (${drafts.length})`}
          </button>
          {showDrafts && (
            <ul className="draft-list">
              {drafts.map((d) => (
                <li key={d.id} className={d.ok ? 'ok' : 'bad'}>
                  <span className="dl-mark" aria-hidden="true">{d.ok ? '✓' : '✕'}</span>
                  <div className="dl-body">
                    <b>{d.ok ? (d.name ?? 'Built') : 'Did not build'}</b>
                    <span className="dl-desc">{d.description}</span>
                  </div>
                  <div className="dl-actions">
                    <button className="ghost sm" onClick={() => setText(d.description)}>Edit</button>
                    {d.ok && d.knobs && d.report && (
                      <button className="primary sm" onClick={() => onBuilt({
                        knobs: d.knobs!, rules: d.rules ?? [], report: d.report!,
                        notes: d.notes ?? [], prompt: d.description,
                      })}>Open</button>
                    )}
                    <button className="ghost sm" aria-label="Forget this attempt"
                      onClick={() => { forgetDraft(d.id); setDrafts(allDrafts()); }}>✕</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Say what to do about it, based on where it actually failed rather than one generic sentence
 * for every kind of failure. The stage the pipeline stopped at is the useful signal: a game
 * that would not terminate is a different problem from a description nobody could parse.
 */
function Advice({ result }: { result: AuthorResult }) {
  const err = result.error ?? '';
  const stopped = [...result.steps].reverse().find((s) => s.stage === 'failed')
    ?? result.steps[result.steps.length - 1];

  let advice: string;
  if (err.includes('configured') || err.includes('No game writer')) {
    advice = 'Build it by hand below instead — everything else works without a writer.';
  } else if (stopped?.stage === 'playtesting' || err.includes('playtest') || err.includes('terminate')) {
    advice = 'The rules it wrote never finished a game. Say how the game ends — somebody runs '
      + 'out of cards, or the deck does, or somebody reaches a score.';
  } else if (stopped?.stage === 'checking' || err.includes('validate') || err.includes('unknown')) {
    advice = 'It asked for something the engine does not have. Try describing the same idea with '
      + 'ordinary card actions: play, draw, pass, take a trick.';
  } else if (stopped?.stage === 'parsing') {
    advice = 'The reply came back malformed. That is usually worth simply trying again.';
  } else {
    advice = 'Try describing the turn more concretely: what you play, and what ends the game.';
  }
  return <p className="muted">{advice}</p>;
}
