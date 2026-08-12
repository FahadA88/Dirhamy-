import { useMemo, useState } from 'react';
import {
  Knobs, RANK_CHOICES, RANKS_13, buildDefinition, defaultKnobs, knobsFromDefinition, rankLabel,
} from '../authoring/knobs';
import { offlineTranslator, ProposedChange, Question, TranslateResult } from '../authoring/copilot';
import { validate } from '../engine/validator';
import { simulate, SimReport } from '../engine/simulator';
import { crazyEights } from '../games/crazyEights';
import { switchGame } from '../games/switch';
import { GameDefinition, Rank } from '../engine/types';
import { Table } from './Table';

type RankArrayKey = 'wildRanks' | 'skipRanks' | 'reverseRanks' | 'drawRanks' | 'extraTurnRanks' | 'wildDrawRanks' | 'excludeRanks';

export function CreateView() {
  const [knobs, setKnobs] = useState<Knobs>({ ...defaultKnobs });
  const [override, setOverride] = useState<GameDefinition | null>(null);
  const [desc, setDesc] = useState('');
  const [proposal, setProposal] = useState<TranslateResult | null>(null);
  const [report, setReport] = useState<SimReport | null>(null);
  const [playtest, setPlaytest] = useState(false);

  const built = useMemo(() => buildDefinition(knobs), [knobs]);
  const def = override ?? built;
  const validation = useMemo(() => validate(def), [def]);

  function set<K extends keyof Knobs>(key: K, value: Knobs[K]) {
    setKnobs((k) => ({ ...k, [key]: value }));
    setOverride(null); setReport(null);
  }
  function toggleRank(key: RankArrayKey, r: Rank) {
    const on = knobs[key].includes(r);
    set(key, (on ? knobs[key].filter((x) => x !== r) : [...knobs[key], r]) as Rank[]);
  }
  function startFrom(k: Knobs) { setKnobs(k); setOverride(null); setReport(null); setProposal(null); }

  async function askCopilot() {
    if (!desc.trim()) return;
    setProposal(await offlineTranslator.translate(desc, knobs));
  }
  function applyProposal() {
    if (!proposal) return;
    setKnobs((k) => ({ ...k, ...proposal.patch }));
    setOverride(null); setProposal(null); setDesc(''); setReport(null);
  }
  function answerQuestion(q: Question, patch: Partial<Knobs>) {
    setKnobs((k) => ({ ...k, ...patch }));
    setProposal((p) => (p ? { ...p, questions: p.questions.filter((x) => x.id !== q.id) } : p));
  }

  if (playtest) {
    return (
      <div>
        <div className="crumbs">
          <button className="ghost" onClick={() => setPlaytest(false)}>← Back to editor</button>
          <span className="crumb-title">Playtesting · {def.meta.name}</span>
        </div>
        <Table def={def} seats={Math.min(3, def.meta.players.max)} />
      </div>
    );
  }

  return (
    <div className="create">
      <div className="editor-grid">
        {/* LEFT: knobs */}
        <div className="panel glass">
          <div className="panel-head">
            <h2>Design</h2>
            <span className={`status-pill ${validation.status}`}>{validation.status}</span>
          </div>

          <div className="starters">
            <span className="mini-label">Start from</span>
            <button className="chip" onClick={() => startFrom({ ...defaultKnobs })}>Blank</button>
            <button className="chip" onClick={() => startFrom(knobsFromDefinition(crazyEights))}>Crazy Eights</button>
            <button className="chip" onClick={() => startFrom(knobsFromDefinition(switchGame))}>Switch</button>
          </div>

          {override && <div className="expert-note">Expert override active — knob edits will replace the raw definition.</div>}

          <Section title="Identity" defaultOpen>
            <label className="field"><span>Name</span><input value={knobs.name} onChange={(e) => set('name', e.target.value)} /></label>
            <div className="two">
              <label className="field"><span>Min players: <b>{knobs.minPlayers}</b></span>
                <input type="range" min={2} max={8} value={knobs.minPlayers} onChange={(e) => set('minPlayers', +e.target.value)} /></label>
              <label className="field"><span>Max players: <b>{knobs.maxPlayers}</b></span>
                <input type="range" min={knobs.minPlayers} max={8} value={knobs.maxPlayers} onChange={(e) => set('maxPlayers', +e.target.value)} /></label>
            </div>
          </Section>

          <Section title="Deal & deck" defaultOpen>
            <label className="field"><span>Cards dealt each: <b>{knobs.handSize}</b></span>
              <input type="range" min={1} max={13} value={knobs.handSize} onChange={(e) => set('handSize', +e.target.value)} /></label>
            <div className="field"><span>Number of decks</span>
              <Seg options={[[1, 'One'], [2, 'Two'], [3, 'Three']]} value={knobs.deckCount} onChange={(v) => set('deckCount', v)} /></div>
            <label className="field row"><Switch on={knobs.includeJokers} onChange={(v) => set('includeJokers', v)} /><span>Include 2 jokers per deck</span></label>
            <label className="field row"><Switch on={knobs.canAlwaysDraw} onChange={(v) => set('canAlwaysDraw', v)} /><span>Draw anytime {knobs.canAlwaysDraw ? '' : '(only when you can’t play)'}</span></label>
            {!knobs.canAlwaysDraw && (
              <label className="field row"><Switch on={knobs.drawUntilCanPlay} onChange={(v) => set('drawUntilCanPlay', v)} /><span>Keep drawing until you can play</span></label>
            )}
            <div className="mini-label">Remove ranks from the deck (short deck)</div>
            <RankGrid ranks={RANKS_13} selected={knobs.excludeRanks} onToggle={(r) => toggleRank('excludeRanks', r)} />
          </Section>

          <Section title="Matching rules" defaultOpen>
            <span className="mini-label">A card is legal to play if it matches the top card by…</span>
            <label className="field row"><Switch on={knobs.matchSuit} onChange={(v) => set('matchSuit', v)} /><span>Suit (or the chosen wild suit)</span></label>
            <label className="field row"><Switch on={knobs.matchRank} onChange={(v) => set('matchRank', v)} /><span>Rank</span></label>
            <label className="field row"><Switch on={knobs.matchColor} onChange={(v) => set('matchColor', v)} /><span>Color (red / black)</span></label>
          </Section>

          <Section title="Wild cards">
            <span className="mini-label">Playable anytime → then name a suit</span>
            <RankGrid selected={knobs.wildRanks} onToggle={(r) => toggleRank('wildRanks', r)} />
          </Section>

          <Section title="Action cards">
            <div className="mini-label">Skip the next player</div>
            <RankGrid selected={knobs.skipRanks} onToggle={(r) => toggleRank('skipRanks', r)} />
            <div className="mini-label">Reverse direction</div>
            <RankGrid selected={knobs.reverseRanks} onToggle={(r) => toggleRank('reverseRanks', r)} />
            <div className="mini-label">Play again (extra turn)</div>
            <RankGrid selected={knobs.extraTurnRanks} onToggle={(r) => toggleRank('extraTurnRanks', r)} />
            <div className="mini-label">Force the next player to draw</div>
            <RankGrid selected={knobs.drawRanks} onToggle={(r) => toggleRank('drawRanks', r)} />
            {knobs.drawRanks.length > 0 && (
              <label className="field"><span>Cards drawn: <b>{knobs.drawCount}</b></span>
                <input type="range" min={1} max={6} value={knobs.drawCount} onChange={(e) => set('drawCount', +e.target.value)} /></label>
            )}
            <div className="mini-label">Wild + force a draw (wild draw)</div>
            <RankGrid selected={knobs.wildDrawRanks} onToggle={(r) => toggleRank('wildDrawRanks', r)} />
            {knobs.wildDrawRanks.length > 0 && (
              <label className="field"><span>Wild-draw amount: <b>{knobs.wildDrawCount}</b></span>
                <input type="range" min={1} max={8} value={knobs.wildDrawCount} onChange={(e) => set('wildDrawCount', +e.target.value)} /></label>
            )}
          </Section>

          <Section title="Turn flow & endgame">
            <div className="field"><span>Direction of play</span>
              <div className="seg">
                <button className={knobs.direction === 'clockwise' ? 'on' : ''} onClick={() => set('direction', 'clockwise')}>Clockwise ↻</button>
                <button className={knobs.direction === 'counter-clockwise' ? 'on' : ''} onClick={() => set('direction', 'counter-clockwise')}>Counter ↺</button>
              </div></div>
            <div className="field"><span>When the draw pile runs out</span>
              <div className="seg">
                <button className={knobs.reshuffleWhenEmpty ? 'on' : ''} onClick={() => set('reshuffleWhenEmpty', true)}>Reshuffle</button>
                <button className={!knobs.reshuffleWhenEmpty ? 'on' : ''} onClick={() => set('reshuffleWhenEmpty', false)}>End round</button>
              </div></div>
            <div className="field"><span>Winner is</span>
              <div className="seg wrap">
                <button className={knobs.winMode === 'firstOut' ? 'on' : ''} onClick={() => set('winMode', 'firstOut')}>First to empty</button>
                <button className={knobs.winMode === 'lowestTotal' ? 'on' : ''} onClick={() => set('winMode', 'lowestTotal')}>Lowest points</button>
                <button className={knobs.winMode === 'highestTotal' ? 'on' : ''} onClick={() => set('winMode', 'highestTotal')}>Highest points</button>
              </div></div>
          </Section>

          <Section title="Scoring values">
            <span className="mini-label">Points per card (negatives allowed)</span>
            <div className="points-grid">
              {RANKS_13.map((r) => (
                <label key={r} className="pt-cell">
                  <span>{rankLabel(r)}</span>
                  <input type="number" value={knobs.perRankPoints[r] ?? 0}
                    onChange={(e) => set('perRankPoints', { ...knobs.perRankPoints, [r]: parseInt(e.target.value || '0', 10) })} />
                </label>
              ))}
              <label className="pt-cell"><span>Jok</span>
                <input type="number" value={knobs.jokerPoints} onChange={(e) => set('jokerPoints', parseInt(e.target.value || '0', 10))} /></label>
            </div>
            <label className="field"><span>Play to (points target)</span>
              <input type="number" value={knobs.pointTarget} onChange={(e) => set('pointTarget', parseInt(e.target.value || '0', 10))} /></label>
          </Section>
        </div>

        {/* RIGHT: co-pilot, verify, expert */}
        <div className="panel glass">
          <h2>AI co-pilot</h2>
          <p className="hint">Describe rules in plain English. It fills the knobs and interviews you on gaps — you approve every change.</p>
          <textarea className="desc" rows={3} value={desc}
            placeholder='e.g. "Two decks, remove 2s–5s. Match by suit, rank or color. 7s play again, aces are wild draw four, keep drawing until you can play."'
            onChange={(e) => setDesc(e.target.value)} />
          <button className="primary" onClick={askCopilot} disabled={!desc.trim()}>✦ Ask co-pilot</button>

          {proposal && (
            <div className="proposal">
              {proposal.changes.length > 0 ? (
                <>
                  <div className="mini-label">Proposed changes</div>
                  <ul className="changes">{proposal.changes.map((c: ProposedChange, i) => (<li key={i}>{c.label}</li>))}</ul>
                  <div className="proposal-actions">
                    <button className="primary sm" onClick={applyProposal}>Apply</button>
                    <button className="ghost sm" onClick={() => setProposal(null)}>Discard</button>
                  </div>
                </>
              ) : <div className="hint">Nothing understood there — try naming a rank, e.g. “8s are wild”.</div>}
              {proposal.questions.map((q) => (
                <div key={q.id} className="interview">
                  <div className="q">◆ {q.text}</div>
                  <div className="q-opts">{q.options.map((o, i) => (<button key={i} className="chip" onClick={() => answerQuestion(q, o.patch)}>{o.label}</button>))}</div>
                </div>
              ))}
            </div>
          )}

          <hr />
          <h2>Verify</h2>
          <div className={`validation ${validation.status}`}>
            <b>{validation.status === 'green' ? '✓ Ready to publish' : validation.status === 'amber' ? '! Playable, with warnings' : '✕ Not publishable yet'}</b>
            <ul>
              {validation.issues.length === 0 && <li>No issues — well-formed.</li>}
              {validation.issues.map((iss, i) => (<li key={i} className={iss.level}>{iss.level === 'error' ? '⛔ ' : '⚠️ '}{iss.message}</li>))}
            </ul>
          </div>
          <div className="test-row">
            <button className="ghost" onClick={() => setReport(simulate(def, 4, 300))} disabled={!validation.ok}>▶ Simulate 300 games</button>
            <button className="primary" onClick={() => setPlaytest(true)} disabled={!validation.ok}>Playtest solo</button>
          </div>
          {report && (
            <div className={`report ${report.terminated === report.games && report.winnable ? 'good' : 'bad'}`}>
              <Metric label="Terminates" value={`${report.terminated}/${report.games}`} />
              <Metric label="Winnable" value={report.winnable ? 'yes' : 'no'} />
              <Metric label="Avg length" value={`${report.avgMoves.toFixed(1)} moves`} />
              <Metric label="Seat win-rates" value={report.winRateBySeat.map((w) => (w * 100).toFixed(0) + '%').join(' / ')} />
              {report.maxMovesHit > 0 && <div className="warn">⚠️ {report.maxMovesHit} games hit the move cap.</div>}
            </div>
          )}

          <hr />
          <ExpertEditor def={def} onApply={setOverride} isOverride={!!override} />
          <details className="advanced"><summary>How to play (auto-generated)</summary><p className="howto">{def.meta.description}</p></details>
        </div>
      </div>
    </div>
  );
}

// ---------- expert raw-definition editor ----------
function ExpertEditor({ def, onApply, isOverride }: { def: GameDefinition; onApply: (d: GameDefinition | null) => void; isOverride: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function openEditor() { setText(JSON.stringify(def, null, 2)); setError(null); setOpen(true); }
  function apply() {
    try {
      const parsed = JSON.parse(text) as GameDefinition;
      const v = validate(parsed);
      if (!v.ok) { setError('Definition has errors: ' + v.issues.filter((i) => i.level === 'error').map((i) => i.message).join('; ')); return; }
      setError(null); onApply(parsed);
    } catch (e) { setError('Invalid JSON: ' + (e as Error).message); }
  }

  return (
    <div className="expert">
      <div className="expert-head">
        <span className="mini-label">Expert · edit the raw game definition</span>
        {!open ? <button className="chip" onClick={openEditor}>Open editor</button> : <button className="chip" onClick={() => setOpen(false)}>Close</button>}
      </div>
      {isOverride && <div className="expert-note">Running from a hand-edited definition.</div>}
      {open && (
        <>
          <textarea className="json-edit" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} rows={16} />
          {error && <div className="json-error">{error}</div>}
          <div className="proposal-actions">
            <button className="primary sm" onClick={apply}>Apply definition</button>
            {isOverride && <button className="ghost sm" onClick={() => onApply(null)}>Revert to knobs</button>}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- building blocks ----------
function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`sec ${open ? 'open' : ''}`}>
      <button className="sec-head" onClick={() => setOpen(!open)}><span className="sec-caret">{open ? '▾' : '▸'}</span> {title}</button>
      {open && <div className="sec-body">{children}</div>}
    </div>
  );
}

function RankGrid({ selected, onToggle, ranks = RANK_CHOICES }: { selected: Rank[]; onToggle: (r: Rank) => void; ranks?: Rank[] }) {
  return (
    <div className="rank-toggles">
      {ranks.map((r) => (
        <button key={r} className={`rank-toggle ${selected.includes(r) ? 'on' : ''}`} onClick={() => onToggle(r)}>{rankLabel(r)}</button>
      ))}
    </div>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on}><span className="knob" /></button>;
}

function Seg({ options, value, onChange }: { options: [number, string][]; value: number; onChange: (v: number) => void }) {
  return (
    <div className="seg">
      {options.map(([val, lbl]) => (<button key={val} className={value === val ? 'on' : ''} onClick={() => onChange(val)}>{lbl}</button>))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><b>{value}</b></div>;
}
