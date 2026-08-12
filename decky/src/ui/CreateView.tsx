import { useMemo, useState } from 'react';
import {
  Knobs, RANK_CHOICES, buildDefinition, defaultKnobs, knobsFromDefinition, rankLabel,
} from '../authoring/knobs';
import { offlineTranslator, ProposedChange, Question, TranslateResult } from '../authoring/copilot';
import { validate } from '../engine/validator';
import { simulate, SimReport } from '../engine/simulator';
import { crazyEights } from '../games/crazyEights';
import { switchGame } from '../games/switch';
import { Rank } from '../engine/types';
import { Table } from './Table';

export function CreateView() {
  const [knobs, setKnobs] = useState<Knobs>({ ...defaultKnobs });
  const [desc, setDesc] = useState('');
  const [proposal, setProposal] = useState<TranslateResult | null>(null);
  const [report, setReport] = useState<SimReport | null>(null);
  const [playtest, setPlaytest] = useState(false);
  const [showJson, setShowJson] = useState(false);

  const def = useMemo(() => buildDefinition(knobs), [knobs]);
  const validation = useMemo(() => validate(def), [def]);

  function set<K extends keyof Knobs>(key: K, value: Knobs[K]) {
    setKnobs((k) => ({ ...k, [key]: value }));
    setReport(null);
  }
  function startFrom(k: Knobs) { setKnobs(k); setReport(null); setProposal(null); }

  async function askCopilot() {
    if (!desc.trim()) return;
    const result = await offlineTranslator.translate(desc, knobs);
    setProposal(result);
  }
  function applyProposal() {
    if (!proposal) return;
    setKnobs((k) => ({ ...k, ...proposal.patch }));
    setProposal(null);
    setDesc('');
    setReport(null);
  }
  function answerQuestion(q: Question, patch: Partial<Knobs>) {
    setKnobs((k) => ({ ...k, ...patch }));
    setProposal((p) => (p ? { ...p, questions: p.questions.filter((x) => x.id !== q.id) } : p));
  }

  function runTest() {
    setReport(simulate(def, 4, 300));
  }

  if (playtest) {
    return (
      <div>
        <div className="crumbs">
          <button className="ghost" onClick={() => setPlaytest(false)}>← Back to editor</button>
          <span className="crumb-title">Playtesting: {knobs.name}</span>
        </div>
        <Table def={def} seats={3} />
      </div>
    );
  }

  return (
    <div className="create">
      <div className="editor-grid">
        {/* LEFT: knobs */}
        <div className="panel">
          <div className="panel-head">
            <h2>Build a game</h2>
            <span className={`status-dot ${validation.status}`} title={validation.status}>{validation.status}</span>
          </div>

          <div className="starters">
            <span className="mini-label">Start from</span>
            <button className="chip" onClick={() => startFrom({ ...defaultKnobs })}>Blank skeleton</button>
            <button className="chip" onClick={() => startFrom(knobsFromDefinition(crazyEights))}>Remix Crazy Eights</button>
            <button className="chip" onClick={() => startFrom(knobsFromDefinition(switchGame))}>Remix Switch</button>
          </div>

          <label className="field">
            <span>Name</span>
            <input value={knobs.name} onChange={(e) => set('name', e.target.value)} />
          </label>

          <label className="field">
            <span>Cards dealt each: <b>{knobs.handSize}</b></span>
            <input type="range" min={1} max={13} value={knobs.handSize}
              onChange={(e) => set('handSize', parseInt(e.target.value, 10))} />
          </label>

          <div className="field">
            <span>Wild ranks (playable anytime → name a suit)</span>
            <div className="rank-toggles">
              {RANK_CHOICES.map((r) => {
                const on = knobs.wildRanks.includes(r);
                return (
                  <button key={r} className={`rank-toggle ${on ? 'on' : ''}`}
                    onClick={() => set('wildRanks', on ? knobs.wildRanks.filter((x) => x !== r) : [...knobs.wildRanks, r])}>
                    {rankLabel(r)}
                  </button>
                );
              })}
            </div>
          </div>

          <RankSelect label="Skip next player on" value={knobs.skipRank} onChange={(r) => set('skipRank', r)} />
          <RankSelect label="Reverse direction on" value={knobs.reverseRank} onChange={(r) => set('reverseRank', r)} />
          <RankSelect label="Next player draws two on" value={knobs.drawTwoRank} onChange={(r) => set('drawTwoRank', r)} />

          <label className="field row">
            <input type="checkbox" checked={knobs.includeJokers} onChange={(e) => set('includeJokers', e.target.checked)} />
            <span>Include 2 jokers in the deck</span>
          </label>

          <div className="field">
            <span>When the draw pile runs out</span>
            <div className="seg">
              <button className={knobs.reshuffleWhenEmpty ? 'on' : ''} onClick={() => set('reshuffleWhenEmpty', true)}>Reshuffle discard</button>
              <button className={!knobs.reshuffleWhenEmpty ? 'on' : ''} onClick={() => set('reshuffleWhenEmpty', false)}>End the round</button>
            </div>
          </div>
        </div>

        {/* RIGHT: co-pilot + validation + test */}
        <div className="panel">
          <h2>AI co-pilot</h2>
          <p className="hint">Describe your rules in plain English. The co-pilot fills in the knobs — you review every change.</p>
          <textarea className="desc" rows={3} value={desc}
            placeholder='e.g. "Deal 7 each. Jokers are wild, queens reverse, 2s make the next player draw two."'
            onChange={(e) => setDesc(e.target.value)} />
          <button className="primary" onClick={askCopilot} disabled={!desc.trim()}>Ask co-pilot</button>

          {proposal && (
            <div className="proposal">
              {proposal.changes.length > 0 && (
                <>
                  <div className="mini-label">Proposed changes</div>
                  <ul className="changes">
                    {proposal.changes.map((c: ProposedChange, i) => (<li key={i}>{c.label}</li>))}
                  </ul>
                  <div className="proposal-actions">
                    <button className="primary sm" onClick={applyProposal}>Apply changes</button>
                    <button className="ghost sm" onClick={() => setProposal(null)}>Discard</button>
                  </div>
                </>
              )}
              {proposal.changes.length === 0 && <div className="hint">No changes understood from that. Try naming a rank, e.g. "8s are wild".</div>}

              {proposal.questions.map((q) => (
                <div key={q.id} className="interview">
                  <div className="q">{q.text}</div>
                  <div className="q-opts">
                    {q.options.map((o, i) => (
                      <button key={i} className="chip" onClick={() => answerQuestion(q, o.patch)}>{o.label}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <hr />

          <h2>Check & test</h2>
          <div className={`validation ${validation.status}`}>
            <b>{validation.status === 'green' ? 'Ready to publish' : validation.status === 'amber' ? 'Playable, with warnings' : 'Not publishable yet'}</b>
            <ul>
              {validation.issues.length === 0 && <li>No issues — well-formed.</li>}
              {validation.issues.map((iss, i) => (
                <li key={i} className={iss.level}>{iss.level === 'error' ? '⛔ ' : '⚠️ '}{iss.message}</li>
              ))}
            </ul>
          </div>

          <div className="test-row">
            <button className="ghost" onClick={runTest} disabled={!validation.ok}>Test (300 bot games)</button>
            <button className="ghost" onClick={() => setPlaytest(true)} disabled={!validation.ok}>Playtest solo</button>
          </div>

          {report && (
            <div className={`report ${report.terminated === report.games && report.winnable ? 'good' : 'bad'}`}>
              <div>Terminates: <b>{report.terminated}/{report.games}</b></div>
              <div>Winnable: <b>{report.winnable ? 'yes' : 'no'}</b></div>
              <div>Avg length: <b>{report.avgMoves.toFixed(1)} moves</b></div>
              <div>Seat win-rates: <b>{report.winRateBySeat.map((w) => (w * 100).toFixed(0) + '%').join(' / ')}</b></div>
              {report.maxMovesHit > 0 && <div className="warn">⚠️ {report.maxMovesHit} games hit the move cap (possible infinite loop).</div>}
            </div>
          )}

          <details className="advanced" open={showJson} onToggle={(e) => setShowJson((e.target as HTMLDetailsElement).open)}>
            <summary>How to play (auto-generated) & advanced</summary>
            <p className="howto">{def.meta.description}</p>
            {showJson && <pre className="json">{JSON.stringify(def, null, 2)}</pre>}
          </details>
        </div>
      </div>
    </div>
  );
}

function RankSelect({ label, value, onChange }: { label: string; value: Rank | null; onChange: (r: Rank | null) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? (e.target.value as Rank) : null)}>
        <option value="">— none —</option>
        {RANK_CHOICES.map((r) => (<option key={r} value={r}>{rankLabel(r)}</option>))}
      </select>
    </label>
  );
}
