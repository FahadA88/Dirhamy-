import { useState } from 'react';
import { Knobs } from '../authoring/knobs';
import { RuleDraft } from '../authoring/ruleKit';
import { AuthorResult, AuthorStep, authorGame } from '../authoring/author';
import { defaultProvider } from '../authoring/provider';
import { SimReport } from '../engine/simulator';

// Describe a game; get a game.
//
// The important part of this screen is not the box you type in. It is that the work is shown:
// the thing writes a draft, the engine checks it, the bots play it a hundred and twenty times,
// and if any of that fails it goes back and tries again — and you watch that happen. A game
// that appears here has been played to a finish before you see it.
//
// When it lands you get the real knobs and the real rules, in the editor, editable. Nothing is
// a black box you have to accept whole.

const EXAMPLES = [
  'Bluff: everyone is dealt the whole deck. On your turn you put cards face down and claim a rank. Anyone can call you a liar — if they are right you take the pile, if they are wrong they do.',
  'A trick-taking game for four in partnerships where hearts are worth minus one and the queen of spades is minus thirteen. First partnership to minus a hundred loses.',
  'Like Crazy Eights, but a seven makes the next player draw two and a jack reverses the direction.',
];

export function DescribeGame({ onBuilt }: {
  onBuilt: (r: { knobs: Partial<Knobs>; rules: RuleDraft[]; report: SimReport; notes: string[] }) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<AuthorStep[]>([]);
  const [result, setResult] = useState<AuthorResult | null>(null);

  async function go() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setResult(null);
    setSteps([]);
    const r = await authorGame(text, defaultProvider(), (s) => setSteps((prev) => [...prev, s]));
    setResult(r);
    setBusy(false);
  }

  const latest = steps[steps.length - 1];

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
        {!busy && !result && (
          <span className="muted">Or pick a starting point below and build it by hand.</span>
        )}
      </div>

      {!busy && !result && (
        <div className="describe-examples">
          {EXAMPLES.map((e, i) => (
            <button key={i} className="chip" onClick={() => setText(e)}>{e.split(':')[0].slice(0, 34)}…</button>
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
              knobs: result.knobs!, rules: result.rules ?? [], report: result.report!, notes: result.notes,
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
          <p className="muted">
            {latest?.stage === 'failed' && result.error?.includes('configured')
              ? 'Build it by hand below instead — everything still works without a writer.'
              : 'Try describing the turn more concretely: what you play, and what ends the game.'}
          </p>
        </div>
      )}
    </section>
  );
}
