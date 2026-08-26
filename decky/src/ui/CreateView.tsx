import { useMemo, useState } from 'react';
import {
  Knobs, RANK_CHOICES, RANKS_13, buildDefinition, defaultKnobs, knobsFromDefinition, rankLabel,
} from '../authoring/knobs';
import { offlineTranslator, ProposedChange, Question, TranslateResult } from '../authoring/copilot';
import { validate } from '../engine/validator';
import { buildDeck } from '../engine/deck';
import { simulate, SimReport } from '../engine/simulator';
import { catalog } from '../games/catalog';
import { GameDefinition, Rank, Suit } from '../engine/types';
import { Table } from './Table';
import { SolitaireTable } from './SolitaireTable';
import { RestrictionBuilder, RuleBuilder } from './RuleBuilder';
import { MiniTable } from './MiniTable';
import { TEMPLATES } from '../authoring/templates';
import { RestrictionDraft, RuleDraft } from '../authoring/ruleKit';
import { explainGame } from '../authoring/explain';
import { publish, complexityOf, playtimeOf, kindLabel } from '../library/library';
import { checkName, checkText } from '../social/safety';
import { useSettings } from '../settings/SettingsContext';
import { DescribeGame } from './DescribeGame';

type RankArrayKey = 'wildRanks' | 'skipRanks' | 'reverseRanks' | 'drawRanks' | 'extraTurnRanks' | 'wildDrawRanks' | 'excludeRanks' | 'passRanks' | 'reflexSlapRanks' | 'bluffClaimRanks';

// The builder is a guided flow, not a wall of dials: pick a starting point, shape the game,
// write your own twists, prove it works, publish it. Every step keeps the live preview on
// screen so a change is never more than a second away from being visible.
type Step = 'start' | 'design' | 'twists' | 'test' | 'publish';

const STEPS: { id: Step; label: string; blurb: string }[] = [
  { id: 'start', label: 'Start', blurb: 'Pick a shape to build on.' },
  { id: 'design', label: 'Design', blurb: 'Deck, deal and scoring.' },
  { id: 'twists', label: 'Twists', blurb: 'Rules of your own.' },
  { id: 'test', label: 'Test', blurb: 'Play it and simulate it.' },
  { id: 'publish', label: 'Publish', blurb: 'Put it on the shelf.' },
];

export function CreateView({ onPlay }: { onPlay?: (def: GameDefinition) => void } = {}) {
  const { settings } = useSettings();
  const [step, setStep] = useState<Step>('start');
  const [seats, setSeats] = useState(3);
  const [tags, setTags] = useState('');
  const [published, setPublished] = useState<{ id: string; name: string } | null>(null);
  // Where this game came from. Set when the writer produced it, so publishing can say so.
  const [writtenFrom, setWrittenFrom] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
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
    setKnobs((k) => {
      const next = { ...k, [key]: value };
      /*
        Switching family used to leave the old family's description behind, so a spotting game
        went on telling players to "match the top card by suit or rank" — the templates each
        carry an explicit description, and nothing ever cleared it.

        Only a description the previous family generated for itself is dropped. Something the
        author actually wrote stays, because they meant it.
      */
      if (key === 'family' && k.description) {
        const auto = buildDefinition({ ...k, description: '' }, 'probe').meta.description;
        if (k.description.trim() === auto.trim()) next.description = '';
      }
      return next;
    });
    setOverride(null); setReport(null);
  }
  function toggleRank(key: RankArrayKey, r: Rank) {
    const on = knobs[key].includes(r);
    set(key, (on ? knobs[key].filter((x) => x !== r) : [...knobs[key], r]) as Rank[]);
  }
  function startFrom(k: Knobs) {
    setKnobs(k); setOverride(null); setReport(null); setProposal(null); setPublished(null);
  }
  function startFromTemplate(k: Knobs) { startFrom({ ...k }); setStep('design'); }
  function setRules(next: RuleDraft[]) {
    setKnobs((k) => ({ ...k, customRules: next }));
    setOverride(null); setReport(null); setPublished(null);
  }
  function setRestrictions(next: RestrictionDraft[]) {
    setKnobs((k) => ({ ...k, restrictions: next }));
    setOverride(null); setReport(null); setPublished(null);
  }
  function doPublish() {
    // Screen before it reaches the shelf: no slurs, and nothing that can pretend to be official.
    const nameCheck = checkName(knobs.name);
    if (!nameCheck.ok) { setPublishError(nameCheck.reason ?? 'That name cannot be published.'); return; }
    const descCheck = checkText(knobs.description);
    if (!descCheck.ok) { setPublishError(descCheck.reason ?? 'That description cannot be published.'); return; }
    setPublishError(null);
    const g = publish({
      definition: def,
      knobs,
      author: settings.playerName || 'You',
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      aiWritten: !!writtenFrom,
      prompt: writtenFrom ?? undefined,
    });
    setPublished({ id: g.id, name: g.definition.meta.name });
  }

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
        {def.solitaire ? <SolitaireTable def={def} /> : <Table def={def} seats={Math.min(3, def.meta.players.max)} />}
      </div>
    );
  }

  const errors = validation.issues.filter((i) => i.level === 'error');

  return (
    <div className="create">
      <ol className="steprail">
        {STEPS.map((s, i) => (
          <li key={s.id} className={`steprail-item ${step === s.id ? 'on' : ''} ${STEPS.findIndex((x) => x.id === step) > i ? 'done' : ''}`}>
            <button onClick={() => setStep(s.id)}>
              <span className="steprail-n">{i + 1}</span>
              <span className="steprail-text"><b>{s.label}</b><em>{s.blurb}</em></span>
            </button>
          </li>
        ))}
      </ol>

      {step === 'start' && (
        <div className="startgrid">
          <DescribeGame onBuilt={({ knobs: k, rules, report: rep, prompt }) => {
            startFrom({ ...defaultKnobs, ...k, customRules: rules } as Knobs);
            setReport(rep);
            setWrittenFrom(prompt);
            setStep('design');
          }} />
          <div className="startgrid-head">
            <h2>Or start from a shape</h2>
            <p className="muted">Every one of these is already playable. Pick the closest and change it.</p>
          </div>
          <div className="template-grid">
            {TEMPLATES.map((t) => (
              <button key={t.id} className="template-card" onClick={() => startFromTemplate(t.knobs)}>
                <span className="tc-name">{t.name}</span>
                <span className="tc-tag">{t.tagline}</span>
                <span className="tc-meta">{t.shape}</span>
                <span className="tc-players">{t.players} player{t.players === '1' ? '' : 's'}</span>
              </button>
            ))}
          </div>
          <div className="startgrid-head">
            <h3>Or start from a classic</h3>
            <p className="muted">Opens the finished game in the editor, ready to be pulled apart.</p>
          </div>
          <div className="starters">
            {/* Derived from the catalogue, not listed by hand: the hand-written list had
                drifted to fourteen of the twenty-one games, so the newest ones could not be
                opened in the editor at all. Every one of these round-trips through the knobs
                and still validates. */}
            {catalog.map((g) => (
              <button key={g.meta.id} className="chip"
                onClick={() => startFromTemplate(knobsFromDefinition(g))}>{g.meta.name}</button>
            ))}
          </div>
        </div>
      )}

      {step === 'twists' && (
        <div className="editor-grid">
          <div className="panel glass">
            <RuleBuilder rules={knobs.customRules ?? []} onChange={setRules} />
            <hr />
            <RestrictionBuilder restrictions={knobs.restrictions ?? []} onChange={setRestrictions} />
          </div>
          <div className="panel glass">
            <div className="panel-head">
              <h2>Live table</h2>
              <span className={`status-pill ${validation.status}`}>{validation.status}</span>
            </div>
            <MiniTable def={def} seats={seats} />
            {errors.length > 0 && (
              <ul className="issue-list">{errors.map((i, k) => <li key={k} className="issue error">{i.message}</li>)}</ul>
            )}
            <div className="step-actions">
              <button className="ghost" onClick={() => setStep('design')}>← Design</button>
              <button className="primary" onClick={() => setStep('test')}>Test it →</button>
            </div>
          </div>
        </div>
      )}

      {step === 'test' && (
        <div className="editor-grid">
          <div className="panel glass">
            <div className="panel-head"><h2>Prove it works</h2>
              <span className={`status-pill ${validation.status}`}>{validation.status}</span></div>
            <p className="muted">
              Playtest sits you at a real table against bots. Simulate runs it {300} times and reports whether
              it ever finishes, whether it can be won, and whether one seat has an unfair edge.
            </p>
            <div className="proposal-actions">
              <button className="primary" onClick={() => setPlaytest(true)} disabled={!validation.ok}>▶ Playtest now</button>
              <button className="ghost" onClick={() => setReport(simulate(def, Math.min(4, def.meta.players.max), 300))} disabled={!validation.ok}>Simulate 300 games</button>
            </div>
            {errors.length > 0 && (
              <ul className="issue-list">{errors.map((i, k) => <li key={k} className="issue error">{i.message}</li>)}</ul>
            )}
            {report && (
              <div className={`report ${report.terminated === report.games && report.winnable ? 'good' : 'bad'}`}>
                <Metric label="Terminates" value={`${report.terminated}/${report.games}`} />
                <Metric label="Winnable" value={report.winnable ? 'yes' : 'no'} />
                <Metric label="Avg length" value={`${report.avgMoves.toFixed(1)} moves`} />
                <Metric label="Seat win-rates" value={report.winRateBySeat.map((w) => (w * 100).toFixed(0) + '%').join(' / ')} />
                {report.maxMovesHit > 0 && <div className="warn">⚠️ {report.maxMovesHit} games hit the move cap.</div>}
              </div>
            )}
            <div className="step-actions">
              <button className="ghost" onClick={() => setStep('twists')}>← Twists</button>
              <button className="primary" onClick={() => setStep('publish')} disabled={!validation.ok}>Publish →</button>
            </div>
          </div>
          <div className="panel glass">
            <div className="panel-head"><h2>Live table</h2></div>
            <MiniTable def={def} seats={seats} />
          </div>
        </div>
      )}

      {step === 'publish' && (
        <div className="editor-grid">
          <div className="panel glass">
            <div className="panel-head"><h2>Publish</h2>
              <span className={`status-pill ${validation.status}`}>{validation.status}</span></div>
            {!validation.ok ? (
              <>
                <p className="muted">Fix these before publishing:</p>
                <ul className="issue-list">{errors.map((i, k) => <li key={k} className="issue error">{i.message}</li>)}</ul>
              </>
            ) : published ? (
              <div className="published-ok">
                <div className="pub-mark">✓</div>
                <h3>{published.name} is on the shelf</h3>
                <p className="muted">It now appears in Play alongside the classics, and can be favourited, rated and remixed.</p>
                <div className="proposal-actions">
                  {onPlay && <button className="primary" onClick={() => onPlay(def)}>Play it now</button>}
                  <button className="ghost" onClick={() => setPublished(null)}>Publish an update</button>
                </div>
              </div>
            ) : (
              <>
                <label className="field"><span>Name</span>
                  <input value={knobs.name} onChange={(e) => set('name', e.target.value)} /></label>
                <label className="field"><span>Description</span>
                  <input value={knobs.description} placeholder={def.meta.description}
                    onChange={(e) => set('description', e.target.value)} /></label>
                <label className="field"><span>Tags (comma separated)</span>
                  <input value={tags} placeholder="fast, party, 4 players" onChange={(e) => setTags(e.target.value)} /></label>
                <dl className="bs-facts">
                  <div><dt>Complexity</dt><dd>{'●'.repeat(complexityOf(def))}{'○'.repeat(5 - complexityOf(def))}</dd></div>
                  <div><dt>Playtime</dt><dd>~{playtimeOf(def)} min</dd></div>
                  <div><dt>Twists</dt><dd>{(def.rules ?? []).length}</dd></div>
                </dl>
                {publishError && <div className="issue error">{publishError}</div>}
                <div className="proposal-actions">
                  <button className="primary" onClick={doPublish}>Publish to the shelf</button>
                </div>
              </>
            )}
          </div>
          <div className="panel glass">
            <div className="panel-head"><h2>What players will read</h2></div>
            <ul className="explain-list">{explainGame(def).map((line, i) => <li key={i}>{line}</li>)}</ul>
          </div>
        </div>
      )}

      {step === 'design' && (
      <div className="editor-grid">
        {/* LEFT: knobs */}
        <div className="panel glass">
          <div className="panel-head">
            <h2>Design</h2>
            <span className={`status-pill ${validation.status}`}>{validation.status}</span>
          </div>

          <div className="starters">
            <span className="mini-label">Started from a template.</span>
            <button className="chip" onClick={() => setStep('start')}>Change starting point</button>
          </div>

          <div className="field"><span>Game family</span>
            <div className="seg wrap">
              <button className={knobs.family === 'shedding' ? 'on' : ''} onClick={() => set('family', 'shedding')}>Shedding</button>
              <button className={knobs.family === 'trick' ? 'on' : ''} onClick={() => set('family', 'trick')}>Trick-taking</button>
              <button className={knobs.family === 'climb' ? 'on' : ''} onClick={() => set('family', 'climb')}>Climbing</button>
              <button className={knobs.family === 'fish' ? 'on' : ''} onClick={() => set('family', 'fish')}>Fishing</button>
              <button className={knobs.family === 'rummy' ? 'on' : ''} onClick={() => set('family', 'rummy')}>Rummy</button>
              <button className={knobs.family === 'war' ? 'on' : ''} onClick={() => set('family', 'war')}>War</button>
              <button className={knobs.family === 'solitaire' ? 'on' : ''} onClick={() => set('family', 'solitaire')}>Solitaire</button>
              {/* Four families the compiler has always been able to build and the picker never
                  offered — every one of them shipped as a classic on the shelf while being
                  unbuildable here. */}
              <button className={knobs.family === 'bluff' ? 'on' : ''} onClick={() => set('family', 'bluff')}>Bluffing</button>
              <button className={knobs.family === 'reflex' ? 'on' : ''} onClick={() => set('family', 'reflex')}>Reflex</button>
              <button className={knobs.family === 'poker' ? 'on' : ''} onClick={() => set('family', 'poker')}>Betting</button>
              <button className={knobs.family === 'pit' ? 'on' : ''} onClick={() => set('family', 'pit')}>Trading</button>
              <button className={knobs.family === 'kent' ? 'on' : ''} onClick={() => set('family', 'kent')}>Signalling</button>
              <button className={knobs.family === 'set' ? 'on' : ''} onClick={() => set('family', 'set')}>Spotting</button>
            </div>
          </div>

          {override && <div className="expert-note">Expert override active — knob edits will replace the raw definition.</div>}

          <Section title="Identity" defaultOpen>
            <label className="field"><span>Name</span><input value={knobs.name} onChange={(e) => set('name', e.target.value)} /></label>
            {knobs.family === 'solitaire' ? (
              <span className="mini-label">Patience is played alone — no seat count to set.</span>
            ) : (
              <>
                <div className="two">
                  <label className="field"><span>Min players: <b>{knobs.minPlayers}</b></span>
                    <input type="range" min={2} max={8} value={knobs.minPlayers} onChange={(e) => set('minPlayers', +e.target.value)} /></label>
                  <label className="field"><span>Max players: <b>{knobs.maxPlayers}</b></span>
                    <input type="range" min={knobs.minPlayers} max={8} value={knobs.maxPlayers} onChange={(e) => set('maxPlayers', +e.target.value)} /></label>
                </div>
                {/* A partnership game cannot seat five — somebody has no partner. The schema has
                    always had a seat step; nothing ever set it. */}
                <div className="field"><span>Seats go up in</span>
                  <Seg options={[[1, 'Ones'], [2, 'Twos (partnerships)'], [3, 'Threes']]}
                    value={knobs.seatStep} onChange={(v) => set('seatStep', v)} /></div>
                {knobs.seatStep > 1 && (
                  <span className="mini-label">
                    Playable at {seatsAllowed(knobs).join(', ') || 'no seat count — widen the range'} players.
                  </span>
                )}
              </>
            )}
          </Section>

          {/* The deck belongs to every game, not just the shedding ones. It used to live inside
              the shedding-only block, which is why a two-deck Rummy or a jokers-in-trumps game
              could not be built here at all — the engine ran both, the panel just never asked. */}
          <Section title="The deck" defaultOpen>
            {knobs.family === 'set' ? (
              // A spotting game's deck is its properties, not a pack: ranks, suits and jokers
              // mean nothing there, so offering the controls would be offering a lie.
              <span className="mini-label">
                This family builds its deck from properties instead of ranks and suits — see “Spotting rules” below.
                It holds <b>{buildDeck(def).length}</b> cards.
              </span>
            ) : knobs.family === 'solitaire' ? (
              <span className="mini-label">Patience deals a fixed board, so its deck count lives in “The board” above and jokers have no foundation to go to.</span>
            ) : (
              <>
                <div className="field"><span>Number of decks</span>
                  <Seg options={([[1, 'One'], [2, 'Two'], [3, 'Three']] as [number, string][]).slice(0, maxDecksFor(knobs.family))}
                    value={Math.min(knobs.deckCount, maxDecksFor(knobs.family))} onChange={(v) => set('deckCount', v)} /></div>
                {maxDecksFor(knobs.family) === 1 && (
                  <span className="mini-label">{knobs.family === 'war'
                    ? 'War splits one pack between two players — a second deck has nowhere to go.'
                    : 'Poker hand ranks stop meaning anything once a card can appear twice.'}</span>
                )}
                <label className="field row"><Switch on={knobs.includeJokers} onChange={(v) => set('includeJokers', v)} /><span>Include jokers</span></label>
                {knobs.includeJokers && (
                  <>
                    <label className="field"><span>Jokers per deck: <b>{knobs.jokerCount}</b></span>
                      <input type="range" min={1} max={8} value={knobs.jokerCount} onChange={(e) => set('jokerCount', +e.target.value)} /></label>
                    {knobs.family === 'trick' && (
                      <div className="field"><span>A joker in a trick is…</span>
                        <Seg options={[['low', 'The weakest card'], ['high', 'Top of the led suit'], ['trump', 'The highest trump']] as ['low' | 'high' | 'trump', string][]}
                          value={knobs.jokerRank} onChange={(v) => set('jokerRank', v)} />
                        <span className="mini-label">{knobs.jokerRank === 'low'
                          ? 'It can never take a trick — useful only as something to score or dodge.'
                          : knobs.jokerRank === 'high'
                            ? 'It always counts as following suit, and only trump beats it.'
                            : 'It beats everything. Leading one names trump as the suit led.'}</span>
                      </div>
                    )}
                    {knobs.family !== 'trick' && knobs.family !== 'shedding' && (
                      <span className="mini-label">Jokers deal out like any other card here. Give them a job in Twists, or tag them as wild under Wild cards in a shedding game.</span>
                    )}
                  </>
                )}
              </>
            )}
            {knobs.family !== 'set' && <>
              <div className="mini-label">Remove whole ranks (short deck)</div>
              <RankGrid ranks={RANKS_13} selected={knobs.excludeRanks} onToggle={(r) => toggleRank('excludeRanks', r)} />
              <CardPicker
                label="Remove individual cards"
                hint="Struck out of every copy of the pack. Ranks already removed above are greyed out."
                selected={knobs.excludeCards}
                dimmed={knobs.excludeRanks}
                onToggle={(key) => set('excludeCards', knobs.excludeCards.includes(key)
                  ? knobs.excludeCards.filter((c) => c !== key)
                  : [...knobs.excludeCards, key])}
              />
              <div className="deck-count-note">
                This deck holds <b>{buildDeck(def).length}</b> cards.
              </div>
              <RankOrder order={knobs.rankOrder} excluded={knobs.excludeRanks}
                onChange={(v) => set('rankOrder', v)} />
            </>}
          </Section>

          {/* A twist could always READ any pile by name; nothing could make one exist, because
              every family hard-codes its own zone list. */}
          <Section title="Extra piles">
            <span className="mini-label">Somewhere to put cards aside — a kitty, a widow, a penalty pile. Twists can move cards in and out of these by name.</span>
            <div className="propedit">
              {knobs.extraPiles.map((pile, i) => (
                <div key={i} className="pe-row">
                  <input className="pe-vals" value={pile.id} placeholder="kitty"
                    onChange={(e) => set('extraPiles', knobs.extraPiles.map((x, k) => (k === i ? { ...x, id: e.target.value } : x)))} />
                  <label className="pe-face">
                    <Switch on={pile.faceUp} onChange={(v) => set('extraPiles', knobs.extraPiles.map((x, k) => (k === i ? { ...x, faceUp: v } : x)))} />
                    <span>face up</span>
                  </label>
                  <button className="icon-btn danger" title="Remove this pile"
                    onClick={() => set('extraPiles', knobs.extraPiles.filter((_, k) => k !== i))}>✕</button>
                </div>
              ))}
              <div className="pe-foot">
                <button className="chip" disabled={knobs.extraPiles.length >= 4}
                  onClick={() => set('extraPiles', [...knobs.extraPiles, { id: `pile${knobs.extraPiles.length + 1}`, faceUp: false }])}>
                  + Add a pile
                </button>
                {knobs.extraPiles.length > 0 && (
                  <span className="mini-label">Reachable in Twists as {knobs.extraPiles.map((p) => `“${p.id}”`).join(', ')}.</span>
                )}
              </div>
            </div>
          </Section>

          {knobs.family === 'trick' && (
            <>
              <Section title="Deal" defaultOpen>
                <label className="field"><span>Cards dealt each: <b>{knobs.handSize}</b></span>
                  <input type="range" min={1} max={13} value={knobs.handSize} onChange={(e) => set('handSize', +e.target.value)} /></label>
                <span className="mini-label">Tip: cards × players must fit the deck — {buildDeck(def).length} cards here, so {Math.floor(buildDeck(def).length / Math.max(2, knobs.maxPlayers))} each at {knobs.maxPlayers} players.</span>
                <SeatDeal knobs={knobs} deckSize={buildDeck(def).length} onChange={(v) => set('handSizeBySeats', v)} />
              </Section>
              <Section title="Trick rules" defaultOpen>
                <label className="field"><span>Trump suit (beats all others)</span>
                  <select value={knobs.trump} onChange={(e) => set('trump', e.target.value as Suit | 'none')}>
                    <option value="none">No trump</option>
                    <option value="S">♠ Spades</option>
                    <option value="H">♥ Hearts</option>
                    <option value="D">♦ Diamonds</option>
                    <option value="C">♣ Clubs</option>
                  </select></label>
                <label className="field row"><Switch on={knobs.mustFollowSuit} onChange={(v) => set('mustFollowSuit', v)} /><span>Must follow the led suit if able</span></label>
                <label className="field row"><Switch on={knobs.aceHigh} onChange={(v) => set('aceHigh', v)} /><span>Ace is the highest card</span></label>
                <label className="field row"><Switch on={knobs.trickBidding} onChange={(v) => set('trickBidding', v)} /><span>Players bid tricks before play</span></label>
                {knobs.minPlayers <= 4 && knobs.maxPlayers >= 4 && (
                  <label className="field row"><Switch on={knobs.trickPartnerships} onChange={(v) => set('trickPartnerships', v)} /><span>Partnerships (4 players: seats 1&3 vs 2&4)</span></label>
                )}
                {knobs.trickBidding && (
                  <>
                    <label className="field row"><Switch on={knobs.bustEnabled} onChange={(v) => set('bustEnabled', v)} /><span>Lose the match instantly if score drops too low</span></label>
                    {knobs.bustEnabled && (
                      <label className="field"><span>Bust at (needs Match play on, below)</span>
                        <input type="number" value={knobs.bustScore} onChange={(e) => set('bustScore', parseInt(e.target.value || '0', 10))} /></label>
                    )}
                  </>
                )}
              </Section>
              {/* The contract auction has been in the engine, the knobs and the table for as
                  long as Contract Whist has been on the shelf. It had no controls here at all,
                  so the only way to build a Bridge-shaped game was to hand-edit JSON. */}
              <Section title="Auction">
                <div className="field"><span>How trump is decided</span>
                  <Seg options={[['fixed', 'Fixed by the game'], ['turnup', 'Turn a card up'], ['contract', 'Bid a level and a suit']] as ['fixed' | 'turnup' | 'contract', string][]}
                    value={knobs.contractAuction ? 'contract' : knobs.trumpAuction ? 'turnup' : 'fixed'}
                    onChange={(v) => {
                      set('trumpAuction', v === 'turnup');
                      set('contractAuction', v === 'contract');
                    }} /></div>
                {knobs.contractAuction && <>
                  <span className="mini-label">Each bid must beat the last on level first, then on strain — clubs, diamonds, hearts, spades, no-trump. Three passes settle it, and the winning side has promised that many tricks.</span>
                  <label className="field"><span>Highest level biddable: <b>{knobs.contractMaxLevel}</b></span>
                    <input type="range" min={1} max={7} value={knobs.contractMaxLevel} onChange={(e) => set('contractMaxLevel', +e.target.value)} /></label>
                  <label className="field"><span>Tricks the level sits on top of: <b>{knobs.contractBook}</b></span>
                    <input type="range" min={0} max={6} value={knobs.contractBook} onChange={(e) => set('contractBook', +e.target.value)} /></label>
                  <span className="mini-label">
                    {knobs.contractBook === 6
                      ? 'Bridge’s book: a bid of 3 promises 9 tricks.'
                      : `A bid of 3 promises ${3 + knobs.contractBook} tricks.`}
                  </span>
                </>}
                {knobs.trumpAuction && <>
                  <label className="field row"><Switch on={knobs.bowers} onChange={(v) => set('bowers', v)} />
                    <span>Bowers — trump's jack is highest, and the other jack of the same colour becomes trump just under it</span></label>
                  <label className="field row"><Switch on={knobs.goAlone} onChange={(v) => set('goAlone', v)} />
                    <span>Going alone — the maker may cut their partner out for a bigger score{knobs.trickPartnerships ? '' : ' (needs partnerships)'}</span></label>
                  <span className="mini-label">
                    {knobs.trickPartnerships
                      ? 'Scores Euchre-style: 1 for making it, 2 for all tricks, 4 alone, and 2 to the defenders if the makers fall short.'
                      : 'Turn partnerships on to get Euchre scoring (make it / march / euchred).'}
                  </span>
                </>}
              </Section>
              <Section title="Scoring" defaultOpen>
                <div className="field"><span>Winner is</span>
                  <div className="seg wrap">
                    <button className={knobs.trickScoreBy === 'mostTricks' ? 'on' : ''} onClick={() => set('trickScoreBy', 'mostTricks')}>Most tricks</button>
                    <button className={knobs.trickScoreBy === 'fewestTricks' ? 'on' : ''} onClick={() => set('trickScoreBy', 'fewestTricks')}>Fewest tricks</button>
                    <button className={knobs.trickScoreBy === 'penalty' ? 'on' : ''} onClick={() => set('trickScoreBy', 'penalty')}>Avoid penalty cards</button>
                  </div></div>
                {knobs.trickScoreBy === 'penalty' && (
                  <>
                    <div className="two">
                      <NumField label="Points per heart" value={knobs.heartsValue} onChange={(v) => set('heartsValue', v)} />
                      <NumField label="Queen of spades" value={knobs.queenSpadesValue} onChange={(v) => set('queenSpadesValue', v)} />
                    </div>
                    <CardValues values={knobs.penaltyCards} onChange={(v) => set('penaltyCards', v)} unit="penalty" />
                  </>
                )}
                {knobs.trickScoreBy === 'penalty' && <>
                  <span className="mini-label">Lowest penalty total wins (this is how Hearts works).</span>
                  <label className="field row"><Switch on={knobs.shootTheMoon} onChange={(v) => set('shootTheMoon', v)} />
                    <span>Shooting the moon — take every penalty point and you score 0 while everyone else takes the lot</span></label>
                  <label className="field row"><Switch on={knobs.brokenSuitLead} onChange={(v) => set('brokenSuitLead', v)} />
                    <span>A suit must be broken before it can be led</span></label>
                  {/* Hard-coded to hearts before this, though the engine never cared which. */}
                  {knobs.brokenSuitLead && (
                    <label className="field"><span>Which suit</span>
                      <select value={knobs.brokenSuit} onChange={(e) => set('brokenSuit', e.target.value as Suit)}>
                        <option value="H">♥ Hearts</option>
                        <option value="S">♠ Spades</option>
                        <option value="D">♦ Diamonds</option>
                        <option value="C">♣ Clubs</option>
                      </select></label>
                  )}
                </>}
                <label className="field row"><Switch on={knobs.forceOpeningLead} onChange={(v) => set('forceOpeningLead', v)} />
                  <span>One named card must lead the first trick{knobs.trickScoreBy === 'penalty' ? ', and no points may fall on it' : ''}</span></label>
                {/* Also hard-coded — to the 2♣, which is Hearts' convention and nobody else's. */}
                {knobs.forceOpeningLead && (
                  <div className="field"><span>Which card leads</span>
                    <div className="cardparam-row">
                      <select value={knobs.openingLeadCard.slice(1) || '2'}
                        onChange={(e) => set('openingLeadCard', `${knobs.openingLeadCard.slice(0, 1)}${e.target.value}`)}>
                        {RANKS_13.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <select value={knobs.openingLeadCard.slice(0, 1) || 'C'}
                        onChange={(e) => set('openingLeadCard', `${e.target.value}${knobs.openingLeadCard.slice(1)}`)}>
                        <option value="C">♣ clubs</option>
                        <option value="D">♦ diamonds</option>
                        <option value="H">♥ hearts</option>
                        <option value="S">♠ spades</option>
                      </select>
                    </div>
                    {!buildDeck(def).some((c) => `${c.suit}${c.rank}` === knobs.openingLeadCard) && (
                      <span className="mini-label warn-text">That card is not in this deck, so nobody can be made to lead it.</span>
                    )}
                  </div>
                )}
              </Section>
              <Section title="Passing">
                <div className="field"><span>Cards exchanged before each hand</span>
                  <Seg options={[[0, 'None'], [1, 'One'], [2, 'Two'], [3, 'Three']]}
                    value={knobs.handPassCount} onChange={(v) => set('handPassCount', v)} /></div>
                {knobs.handPassCount > 0 && (
                  <span className="mini-label">Direction rotates every hand: left, right, across, then a hold hand with no pass. Everyone picks at the same time and nobody sees what's coming.</span>
                )}
              </Section>
            </>
          )}

          {knobs.family === 'fish' && (
            <Section title="Fishing rules" defaultOpen>
              <label className="field"><span>Cards dealt each: <b>{knobs.handSize}</b></span>
                <input type="range" min={5} max={7} value={knobs.handSize} onChange={(e) => set('handSize', +e.target.value)} /></label>
              <div className="field"><span>Cards per book</span>
                <Seg options={[[2, 'Pairs (2)'], [3, 'Threes (3)'], [4, 'Fours (4)']]} value={knobs.bookSize} onChange={(v) => set('bookSize', v)} /></div>
              <span className="mini-label">Ask opponents for ranks; collect a book of a rank. Most books wins.</span>
            </Section>
          )}

          {knobs.family === 'rummy' && (
            <Section title="Rummy rules" defaultOpen>
              <label className="field"><span>Cards dealt each: <b>{knobs.handSize}</b></span>
                <input type="range" min={5} max={13} value={knobs.handSize} onChange={(e) => set('handSize', +e.target.value)} /></label>
              <div className="field"><span>Set size (same rank)</span>
                <Seg options={[[2, '2'], [3, '3'], [4, '4']]} value={knobs.rummySetMin} onChange={(v) => set('rummySetMin', v)} /></div>
              <div className="field"><span>Run length (sequence in a suit)</span>
                <Seg options={[[2, '2'], [3, '3'], [4, '4'], [5, '5']]} value={knobs.rummyRunMin} onChange={(v) => set('rummyRunMin', v)} /></div>
              <label className="field row"><Switch on={knobs.rummyKnock} onChange={(v) => set('rummyKnock', v)} />
                <span>Knocking (Gin) — melds stay hidden in hand and you end the hand by knocking</span></label>
              {knobs.rummyKnock && (
                <>
                  <label className="field"><span>Knock when your unmatched cards total <b>{knobs.rummyKnockAt}</b> or less</span>
                    <input type="range" min={0} max={20} value={knobs.rummyKnockAt} onChange={(e) => set('rummyKnockAt', +e.target.value)} /></label>
                  <div className="two">
                    <NumField label="Gin bonus (no deadwood)" value={knobs.rummyGinBonus} onChange={(v) => set('rummyGinBonus', v)} />
                    <NumField label="Undercut bonus" value={knobs.rummyUndercutBonus} onChange={(v) => set('rummyUndercutBonus', v)} />
                  </div>
                </>
              )}
              <label className="field row"><Switch on={knobs.rummyLayOff} onChange={(v) => set('rummyLayOff', v)} />
                <span>Lay-off — spare cards can extend a meld already on the table</span></label>
              <label className="field row"><Switch on={knobs.rummyWilds} onChange={(v) => set('rummyWilds', v)} />
                <span>Wild cards fill gaps in sets and runs (Canasta, Kalooki)</span></label>
              {knobs.rummyWilds && (
                <>
                  <div className="field"><span>Wilds allowed in one meld</span>
                    <Seg options={[[1, 'One'], [2, 'Two']]} value={knobs.rummyMaxWilds} onChange={(v) => set('rummyMaxWilds', v)} /></div>
                  <div className="mini-label">Which cards are wild</div>
                  <RankGrid selected={knobs.wildRanks} onToggle={(r) => toggleRank('wildRanks', r)} />
                  <CardPicker label="…or name individual wild cards" selected={knobs.wildCards}
                    onToggle={(key) => set('wildCards', knobs.wildCards.includes(key)
                      ? knobs.wildCards.filter((c) => c !== key) : [...knobs.wildCards, key])} />
                  {!knobs.wildRanks.length && !knobs.wildCards.length && (
                    <span className="mini-label">Nothing is wild yet, so this changes nothing — pick a rank or a card above.</span>
                  )}
                  <span className="mini-label">A meld always needs at least one real card: a pile of wilds is not a set.</span>
                </>
              )}
              <span className="mini-label">
                {knobs.rummyKnock
                  ? 'Score the gap between the two players’ unmatched cards. No deadwood at all is gin (+25); fail to beat your opponent and they undercut you (+25).'
                  : 'Draw, lay down sets and runs, then discard. First to shed every card wins.'}
              </span>
            </Section>
          )}

          {knobs.family === 'solitaire' && (
            <Section title="The board" defaultOpen>
              <span className="mini-label">One player against the deal. The engine builds the whole board from these.</span>
              <label className="field"><span>Tableau columns: <b>{knobs.solColumns}</b></span>
                <input type="range" min={4} max={12} value={knobs.solColumns} onChange={(e) => set('solColumns', +e.target.value)} /></label>
              <div className="field"><span>Deal shape</span>
                <Seg options={[['triangle', 'Staircase (1,2,3…)'], ['even', 'Even split']]} value={knobs.solDeal} onChange={(v) => set('solDeal', v)} /></div>
              <div className="field"><span>Face up</span>
                <Seg options={[['top', 'Only the bottom of each column'], ['all', 'Everything']]} value={knobs.solFaceUp} onChange={(v) => set('solFaceUp', v)} /></div>
              <div className="field"><span>Number of decks</span>
                <Seg options={[[1, 'One'], [2, 'Two']]} value={knobs.solDecks} onChange={(v) => set('solDecks', v)} /></div>
            </Section>
          )}

          {knobs.family === 'solitaire' && (
            <Section title="Building rules" defaultOpen>
              <div className="field"><span>Stack a card onto one that is…</span>
                <div className="seg wrap">
                  <button className={knobs.solBuild === 'alt-color' ? 'on' : ''} onClick={() => set('solBuild', 'alt-color')}>One higher, other colour</button>
                  <button className={knobs.solBuild === 'same-suit' ? 'on' : ''} onClick={() => set('solBuild', 'same-suit')}>One higher, same suit</button>
                  <button className={knobs.solBuild === 'down-any' ? 'on' : ''} onClick={() => set('solBuild', 'down-any')}>One higher, any suit</button>
                </div></div>
              <div className="field"><span>You may pick up…</span>
                <div className="seg wrap">
                  <button className={knobs.solMoveRun === 'single' ? 'on' : ''} onClick={() => set('solMoveRun', 'single')}>One card</button>
                  <button className={knobs.solMoveRun === 'built' ? 'on' : ''} onClick={() => set('solMoveRun', 'built')}>A properly built run</button>
                  <button className={knobs.solMoveRun === 'same-suit' ? 'on' : ''} onClick={() => set('solMoveRun', 'same-suit')}>A same-suit run only</button>
                </div></div>
              <div className="field"><span>An empty column takes</span>
                <Seg options={[['any', 'Any card'], ['king', 'A King only'], ['none', 'Nothing']]} value={knobs.solEmpty} onChange={(v) => set('solEmpty', v)} /></div>
              <label className="field"><span>Free cells: <b>{knobs.solFreeCells}</b></span>
                <input type="range" min={0} max={6} value={knobs.solFreeCells} onChange={(e) => set('solFreeCells', +e.target.value)} /></label>
              {knobs.solFreeCells > 0 && (
                <span className="mini-label">How many cards you can shift at once is (free cells + 1), doubled for every empty column.</span>
              )}
            </Section>
          )}

          {knobs.family === 'solitaire' && (
            <Section title="Finishing & stock" defaultOpen>
              <label className="field"><span>Foundations: <b>{knobs.solFoundations}</b></span>
                <input type="range" min={1} max={8} value={knobs.solFoundations} onChange={(e) => set('solFoundations', +e.target.value)} /></label>
              <label className="field row"><Switch on={knobs.solAutoRuns} onChange={(v) => set('solAutoRuns', v)} />
                <span>Runs clear themselves — finish a King-to-Ace suit run on the table and it leaves the board (Spider)</span></label>
              <div className="field"><span>Stock</span>
                <Seg options={[['none', 'None'], ['waste', 'Turn to a waste pile'], ['deal-row', 'Deal a row to every column']]} value={knobs.solStock} onChange={(v) => set('solStock', v)} /></div>
              {knobs.solStock === 'waste' && <>
                <div className="field"><span>Cards turned at a time</span>
                  <Seg options={[[1, 'One'], [3, 'Three']]} value={knobs.solStockTurn} onChange={(v) => set('solStockTurn', v)} /></div>
                <div className="field"><span>Passes through the stock</span>
                  <Seg options={[[-1, 'Unlimited'], [0, 'One'], [2, 'Three']]} value={knobs.solRedeals} onChange={(v) => set('solRedeals', v)} /></div>
              </>}
            </Section>
          )}

          {knobs.family === 'kent' && (
            <Section title="Signalling rules" defaultOpen>
              <span className="mini-label">Partners sit opposite, so seats come in pairs. No turns — anyone may swap with the middle whenever they like.</span>
              <label className="field"><span>Cards each: <b>{knobs.kentHandSize}</b></span>
                <input type="range" min={3} max={5} value={knobs.kentHandSize} onChange={(e) => set('kentHandSize', +e.target.value)} /></label>
              <label className="field"><span>Cards face up in the middle: <b>{knobs.kentPoolSize}</b></span>
                <input type="range" min={3} max={6} value={knobs.kentPoolSize} onChange={(e) => set('kentPoolSize', +e.target.value)} /></label>
              <label className="field"><span>A tell stays up for: <b>{knobs.kentTellPlies}</b> moves</span>
                <input type="range" min={1} max={8} value={knobs.kentTellPlies} onChange={(e) => set('kentTellPlies', +e.target.value)} /></label>
              <span className="mini-label">Counted in moves, not seconds — the engine has no clock, so that a game can always be replayed from its seed.</span>
              <label className="field"><span>Word to spell before a pair is out</span>
                <input value={knobs.kentLetters} maxLength={8}
                  onChange={(e) => set('kentLetters', e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase())} /></label>
              <span className="mini-label">{knobs.kentLetters.length || 4} letters: {(knobs.kentLetters || 'KENT').split('').join('-')}.</span>
            </Section>
          )}

          {knobs.family === 'set' && (
            <Section title="Spotting rules" defaultOpen>
              <span className="mini-label">Not a pack of cards — every combination of the properties below, once each. All the same or all different, never two-and-one.</span>
              <PropertyEditor props={knobs.setProperties} onChange={(v) => set('setProperties', v)} />
              <div className="field"><span>Cards in a combination</span>
                <Seg options={[[2, 'Two'], [3, 'Three'], [4, 'Four']]} value={knobs.setSize} onChange={(v) => set('setSize', v)} /></div>
              <label className="field"><span>Cards face up at once: <b>{knobs.setBoardSize}</b></span>
                <input type="range" min={6} max={21} value={knobs.setBoardSize} onChange={(e) => set('setBoardSize', +e.target.value)} /></label>
              <div className="two">
                <NumField label="Points for spotting one" value={knobs.setScore} onChange={(v) => set('setScore', v)} />
                <NumField label="Points lost for a wrong call" value={knobs.setPenalty} onChange={(v) => set('setPenalty', v)} />
              </div>
              {knobs.setPenalty === 0 && (
                <span className="mini-label warn-text">With no penalty, calling every combination at random is a winning strategy.</span>
              )}
            </Section>
          )}

          {knobs.family === 'bluff' && (
            <Section title="Bluffing rules" defaultOpen>
              <span className="mini-label">Play cards face down claiming a rank — true or not. Anyone may call it; whoever is wrong takes the pile. First to empty their hand wins.</span>
              <div className="mini-label">Ranks a claim may name (none selected = any rank)</div>
              <RankGrid ranks={RANKS_13} selected={knobs.bluffClaimRanks} onToggle={(r) => toggleRank('bluffClaimRanks', r)} />
              <span className="mini-label">Narrowing this is what turns Cheat into a tighter game — claims can only walk up and down a short ladder.</span>
            </Section>
          )}

          {knobs.family === 'reflex' && (
            <Section title="Reflex rules" defaultOpen>
              <span className="mini-label">Everyone flips onto a shared pile. When the trigger shows, first hand on the pile takes it.</span>
              <div className="mini-label">Slap when the top card is…</div>
              <RankGrid ranks={RANKS_13} selected={knobs.reflexSlapRanks} onToggle={(r) => toggleRank('reflexSlapRanks', r)} />
              <label className="field row"><Switch on={knobs.reflexSlapMatch} onChange={(v) => set('reflexSlapMatch', v)} />
                <span>…or whenever the top two cards match rank (Snap)</span></label>
              {knobs.reflexSlapRanks.length === 0 && !knobs.reflexSlapMatch && (
                <span className="mini-label warn-text">Nothing triggers a slap, so nobody can ever take the pile. Pick a rank or turn on matching.</span>
              )}
            </Section>
          )}

          {knobs.family === 'poker' && (
            <Section title="Betting rules" defaultOpen>
              <span className="mini-label">A fixed deal, one round of betting, then a showdown. No streets, no draw, no side pots.</span>
              <div className="field"><span>Cards each</span>
                <Seg options={[[3, '3'], [5, '5'], [7, '7']]} value={knobs.pokerHandSize} onChange={(v) => set('pokerHandSize', v)} /></div>
              <label className="field"><span>Hands in a sitting: <b>{knobs.pokerHands}</b></span>
                <input type="range" min={1} max={20} value={knobs.pokerHands} onChange={(e) => set('pokerHands', +e.target.value)} /></label>
              <span className="mini-label">{knobs.pokerHands === 1
                ? 'One hand and out — you post a blind, call once, and it is over with everyone still holding chips.'
                : `Chips carry between hands; biggest stack after ${knobs.pokerHands} wins, or it ends early if someone busts.`}</span>
              <div className="two">
                <NumField label="Starting chips" value={knobs.pokerStartingChips} onChange={(v) => set('pokerStartingChips', v)} />
                <NumField label="Ante" value={knobs.pokerAnte} onChange={(v) => set('pokerAnte', v)} />
              </div>
              <div className="two">
                <NumField label="Small blind" value={knobs.pokerSmallBlind} onChange={(v) => set('pokerSmallBlind', v)} />
                <NumField label="Big blind" value={knobs.pokerBigBlind} onChange={(v) => set('pokerBigBlind', v)} />
              </div>
              <NumField label="Minimum raise" value={knobs.pokerMinRaise} onChange={(v) => set('pokerMinRaise', v)} />
              <span className="mini-label">Play money only — no cash, no purchases, nothing to cash out.</span>
            </Section>
          )}

          {knobs.family === 'pit' && (
            <Section title="Trading rules" defaultOpen>
              <span className="mini-label">No turns at all. Offer a number of one suit, accept anyone else's offer, and corner a suit to win.</span>
              <label className="field"><span>Cards that corner a suit: <b>{knobs.pitCornerSize}</b></span>
                <input type="range" min={4} max={13} value={knobs.pitCornerSize} onChange={(e) => set('pitCornerSize', +e.target.value)} /></label>
              <span className="mini-label">At a table too crowded to hold that many, a whole hand of one suit wins instead.</span>
            </Section>
          )}

          {knobs.family === 'war' && (
            <Section title="War rules" defaultOpen>
              <label className="field row"><Switch on={knobs.aceHigh} onChange={(v) => set('aceHigh', v)} /><span>Ace is the highest card</span></label>
              <span className="mini-label">2 players. Split the deck, flip; higher card takes both, ties trigger a war. Take every card to win.</span>
            </Section>
          )}

          {knobs.family === 'climb' && (
            <Section title="Climbing rules" defaultOpen>
              <span className="mini-label">All cards are dealt out. Beat the pile with a higher card or pass.</span>
              <div className="field"><span>Rank order</span>
                <div className="seg">
                  <button className={knobs.climbTwosHigh ? 'on' : ''} onClick={() => set('climbTwosHigh', true)}>3 low … 2 high (President)</button>
                  <button className={!knobs.climbTwosHigh ? 'on' : ''} onClick={() => set('climbTwosHigh', false)}>2 low … Ace high</button>
                </div></div>
              <label className="field row"><Switch on={knobs.climbCombos} onChange={(v) => set('climbCombos', v)} />
                <span>Allow pairs & triples {knobs.climbCombos ? '(a reply must match the shape)' : '(single cards only)'}</span></label>
              <label className="field row"><Switch on={knobs.climbBombSize > 0} onChange={(v) => set('climbBombSize', v ? 4 : 0)} />
                <span>Bombs — four of a kind beats any pile, playable even out of turn</span></label>
            </Section>
          )}

          {knobs.family === 'shedding' && <>
          <Section title="Deal & drawing" defaultOpen>
            <label className="field"><span>Cards dealt each: <b>{knobs.handSize}</b></span>
              <input type="range" min={1} max={13} value={knobs.handSize} onChange={(e) => set('handSize', +e.target.value)} /></label>
            <label className="field row"><Switch on={knobs.canAlwaysDraw} onChange={(v) => set('canAlwaysDraw', v)} /><span>Draw anytime {knobs.canAlwaysDraw ? '' : '(only when you can’t play)'}</span></label>
            {!knobs.canAlwaysDraw && (
              <label className="field row"><Switch on={knobs.drawUntilCanPlay} onChange={(v) => set('drawUntilCanPlay', v)} /><span>Keep drawing until you can play</span></label>
            )}
          </Section>

          <Section title="Matching rules" defaultOpen>
            <span className="mini-label">A card is legal to play if it matches the top card by…</span>
            <label className="field row"><Switch on={knobs.matchSuit} onChange={(v) => set('matchSuit', v)} /><span>Suit (or the chosen wild suit)</span></label>
            <label className="field row"><Switch on={knobs.matchRank} onChange={(v) => set('matchRank', v)} /><span>Rank</span></label>
            <label className="field row"><Switch on={knobs.matchColor} onChange={(v) => set('matchColor', v)} /><span>Colour (red / black)</span></label>
          </Section>

          <Section title="Wild cards">
            <span className="mini-label">Playable anytime → then name a suit</span>
            <RankGrid selected={knobs.wildRanks} onToggle={(r) => toggleRank('wildRanks', r)} />
            <CardPicker label="…or name individual wild cards"
              hint="One card, not the whole rank — the queen of spades wild, her three sisters ordinary."
              selected={knobs.wildCards}
              onToggle={(key) => set('wildCards', knobs.wildCards.includes(key)
                ? knobs.wildCards.filter((c) => c !== key) : [...knobs.wildCards, key])} />
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
            <div className="mini-label">Trade wind — everyone passes a card at once</div>
            <RankGrid selected={knobs.passRanks} onToggle={(r) => toggleRank('passRanks', r)} />
            {knobs.passRanks.length > 0 && (
              <div className="field"><span>Pass direction</span>
                <div className="seg">
                  <button className={knobs.passDirectionKnob === 'left' ? 'on' : ''} onClick={() => set('passDirectionKnob', 'left')}>Left</button>
                  <button className={knobs.passDirectionKnob === 'right' ? 'on' : ''} onClick={() => set('passDirectionKnob', 'right')}>Right</button>
                </div></div>
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
            <CardValues values={knobs.cardValues} onChange={(v) => set('cardValues', v)} />
            <label className="field row"><Switch on={knobs.unpricedScoreRankValue} onChange={(v) => set('unpricedScoreRankValue', v)} />
              <span>Anything left unpriced scores its own pip value (ace 1, faces 10)</span></label>
          </Section>
          </>}

          <Section title="Match play">
            <span className="mini-label">Play repeated hands with a running score, instead of ending after one hand.</span>
            <label className="field row"><Switch on={knobs.matchPlay} onChange={(v) => set('matchPlay', v)} /><span>Play to a target score across multiple hands</span></label>
            {knobs.matchPlay && (
              <label className="field"><span>Points to win the match</span>
                <input type="number" value={knobs.pointTarget} onChange={(e) => set('pointTarget', parseInt(e.target.value || '0', 10))} /></label>
            )}
          </Section>
        </div>

        {/* RIGHT: live table, co-pilot, verify, expert */}
        <div className="panel glass">
          <div className="panel-head">
            <h2>Live table</h2>
            {!def.solitaire && (
              <div className="seat-control sm">
                <span>Seats</span>
                {[2, 3, 4, 5, 6].map((n) => (
                  <button key={n} className={`seg-btn ${seats === n ? 'on' : ''}`}
                    disabled={n < def.meta.players.min || n > def.meta.players.max}
                    onClick={() => setSeats(n)}>{n}</button>
                ))}
              </div>
            )}
          </div>
          <MiniTable def={def} seats={seats} />
          <div className="step-actions">
            <button className="ghost" onClick={() => setStep('start')}>← Start</button>
            <button className="primary" onClick={() => setStep('twists')}>Add twists →</button>
          </div>
          <hr />
          <h2>AI co-pilot</h2>
          <p className="hint">Describe rules in plain English. It fills the knobs and interviews you on gaps — you approve every change.</p>
          <textarea className="desc" rows={3} value={desc}
            placeholder='e.g. "Two decks, remove 2s–5s. Match by suit, rank or colour. 7s play again, aces are wild draw four, keep drawing until you can play."'
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
          <details className="advanced" open><summary>How to play (auto-generated)</summary><p className="howto">{def.meta.description}</p></details>

          <div className="build-summary">
            <div className="bs-head">What you've built</div>
            <dl className="bs-facts">
              <div><dt>Family</dt><dd>{kindLabel(def)}</dd></div>
              <div><dt>Players</dt><dd>{def.meta.players.min === def.meta.players.max ? def.meta.players.min : `${def.meta.players.min}–${def.meta.players.max}`}</dd></div>
              <div><dt>Deck</dt><dd>{(def.deck.deckCount ?? 1) > 1 ? `${def.deck.deckCount} decks` : 'one deck'}{def.deck.includeJokers ? ' + jokers' : ''}{(def.deck.excludeRanks?.length ?? 0) > 0 ? ` − ${def.deck.excludeRanks!.length} ranks` : ''}</dd></div>
              <div><dt>Ends</dt><dd>{def.scoring.target != null ? `race to ${def.scoring.target}` : 'a single hand'}</dd></div>
              {def.solitaire && <div><dt>Board</dt><dd>{def.solitaire.columns} columns · {def.solitaire.foundations} foundations{def.solitaire.freeCells ? ` · ${def.solitaire.freeCells} cells` : ''}</dd></div>}
              {def.trick && <div><dt>Trump</dt><dd>{def.trick.auction ? 'auctioned each hand' : def.trick.trump === 'none' ? 'none' : def.trick.trump}</dd></div>}
            </dl>
          </div>
        </div>
      </div>
      )}
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

/**
 * Which rank beats which.
 *
 * The engine reads the order out of the deck and has never cared what is in it — but every
 * builder pinned it to ace-high, so a game where the seven is the highest card, or where the
 * two beats the ace, was hand-edited JSON or nothing. Ranks move one place at a time rather
 * than by dragging, because this is a list of thirteen things that is read far more often than
 * it is changed, and arrows work on a phone.
 */
function RankOrder({ order, excluded, onChange }:
  { order: Rank[]; excluded: Rank[]; onChange: (v: Rank[]) => void }) {
  const [open, setOpen] = useState(order.length > 0);
  const live = (order.length ? order : RANKS_13).filter((r) => !excluded.includes(r));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= live.length) return;
    const next = live.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const custom = order.length > 0;
  return (
    <div className="cardpicker">
      <button className="cp-head" onClick={() => setOpen(!open)}>
        <span className="sec-caret">{open ? '▾' : '▸'}</span> Which rank beats which
        {custom && <span className="cp-count">custom</span>}
      </button>
      {open && (
        <>
          <span className="mini-label">Lowest on the left. Trick-taking, climbing and comparison games all read this.</span>
          <div className="rankorder">
            {live.map((r, i) => (
              <span key={r} className="ro-item">
                <button className="ro-arrow" disabled={i === 0} aria-label={`Move ${r} lower`}
                  onClick={() => move(i, -1)}>‹</button>
                <b>{rankLabel(r)}</b>
                <button className="ro-arrow" disabled={i === live.length - 1} aria-label={`Move ${r} higher`}
                  onClick={() => move(i, 1)}>›</button>
              </span>
            ))}
          </div>
          <div className="pe-foot">
            <button className="chip" onClick={() => onChange(
              (['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'] as Rank[]).filter((r) => !excluded.includes(r)),
            )}>Twos high (President)</button>
            <button className="chip" onClick={() => onChange(
              (['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as Rank[]).filter((r) => !excluded.includes(r)),
            )}>Ace low</button>
            {custom && <button className="chip" onClick={() => onChange([])}>Reset to normal</button>}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The properties a Set-style deck is built from.
 *
 * Every combination becomes one card, so three properties of three values each is twenty-seven
 * and adding a fourth makes eighty-one. The count is shown live because that is the number
 * that decides whether the game is a five-minute puzzle or an evening.
 */
function PropertyEditor({ props, onChange }:
  { props: { name: string; values: string[] }[]; onChange: (v: { name: string; values: string[] }[]) => void }) {
  const size = props.reduce((n, p) => n * Math.max(1, p.values.length), 1);
  const setAt = (i: number, patch: Partial<{ name: string; values: string[] }>) =>
    onChange(props.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  return (
    <div className="propedit">
      {props.map((p, i) => (
        <div key={i} className="pe-row">
          <input className="pe-name" value={p.name} placeholder="colour"
            onChange={(e) => setAt(i, { name: e.target.value })} />
          <input className="pe-vals" value={p.values.join(', ')} placeholder="red, green, violet"
            onChange={(e) => setAt(i, { values: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} />
          <button className="icon-btn danger" title="Remove this property"
            onClick={() => onChange(props.filter((_, k) => k !== i))}>✕</button>
        </div>
      ))}
      <div className="pe-foot">
        <button className="chip" disabled={props.length >= 4}
          onClick={() => onChange([...props, { name: '', values: [] }])}>+ Add a property</button>
        <span className="mini-label">{size} cards in the deck</span>
      </div>
      {props.some((p) => p.values.length < 2) && (
        <span className="mini-label warn-text">Every property needs at least two values.</span>
      )}
      {props.some((p) => p.values.length !== props[0].values.length) && (
        <span className="mini-label warn-text">Properties with different numbers of values make “all different” impossible for some of them.</span>
      )}
    </div>
  );
}

/**
 * A different deal at each table size.
 *
 * "Thirteen each" is a four-player statement. At three it leaves a stub, at five it cannot be
 * dealt at all, and a game whose whole point is that every card goes out has to say so
 * differently at every seat count. countByPlayers has been in the schema from the start with
 * nothing ever writing to it.
 */
function SeatDeal({ knobs, deckSize, onChange }:
  { knobs: Knobs; deckSize: number; onChange: (v: Record<string, number>) => void }) {
  const [open, setOpen] = useState(Object.keys(knobs.handSizeBySeats).length > 0);
  const seats = seatsAllowed(knobs);
  return (
    <div className="cardpicker">
      <button className="cp-head" onClick={() => setOpen(!open)}>
        <span className="sec-caret">{open ? '▾' : '▸'}</span> Deal a different number at each table size
        {Object.keys(knobs.handSizeBySeats).length > 0 && <span className="cp-count">{Object.keys(knobs.handSizeBySeats).length}</span>}
      </button>
      {open && (
        <>
          <span className="mini-label">Blank means the number above. Whole-deck deals need cards ÷ players to come out even.</span>
          <div className="seatdeal">
            {seats.map((n) => {
              const even = Math.floor(deckSize / n);
              const v = knobs.handSizeBySeats[String(n)];
              return (
                <label key={n} className="sd-row">
                  <span>{n} players</span>
                  <input type="number" min={0} max={deckSize} value={v ?? ''} placeholder={String(knobs.handSize)}
                    onChange={(e) => {
                      const next = { ...knobs.handSizeBySeats };
                      const parsed = parseInt(e.target.value || '0', 10);
                      if (!parsed) delete next[String(n)]; else next[String(n)] = parsed;
                      onChange(next);
                    }} />
                  <button className="chip subtle" onClick={() => onChange({ ...knobs.handSizeBySeats, [String(n)]: even })}
                    title={`Deal the whole deck: ${even} each`}>all {even}</button>
                  <span className={`sd-note ${(v ?? knobs.handSize) * n > deckSize ? 'bad' : ''}`}>
                    {(v ?? knobs.handSize) * n > deckSize
                      ? `needs ${(v ?? knobs.handSize) * n} of ${deckSize}`
                      : `${deckSize - (v ?? knobs.handSize) * n} left over`}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** The seat counts a step actually permits between min and max. */
function seatsAllowed(k: Knobs): number[] {
  const out: number[] = [];
  for (let n = k.minPlayers; n <= k.maxPlayers; n += Math.max(1, k.seatStep)) out.push(n);
  return out;
}

/** How many copies of the pack a family can honestly shuffle together. */
function maxDecksFor(family: Knobs['family']): number {
  if (family === 'war' || family === 'poker') return 1;
  if (family === 'shedding') return 3;
  return 2;
}

const PICKER_SUITS: { suit: Suit; symbol: string; red: boolean }[] = [
  { suit: 'S', symbol: '♠', red: false },
  { suit: 'H', symbol: '♥', red: true },
  { suit: 'D', symbol: '♦', red: true },
  { suit: 'C', symbol: '♣', red: false },
];

/**
 * The whole pack, one button per card.
 *
 * Every card-level control in the builder used to be rank-level: "remove the twos" was
 * expressible, "remove the two of clubs" was not, even though the engine has always keyed
 * individual cards as suit+rank. This is that key, made clickable — the same grid serves
 * removing cards, marking them wild, and pricing them.
 */
function CardPicker({ label, hint, selected, onToggle, dimmed = [], accent }:
  { label: string; hint?: string; selected: string[]; onToggle: (key: string) => void; dimmed?: Rank[]; accent?: string }) {
  const [open, setOpen] = useState(false);
  const dim = new Set(dimmed);
  return (
    <div className="cardpicker">
      <button className="cp-head" onClick={() => setOpen(!open)}>
        <span className="sec-caret">{open ? '▾' : '▸'}</span> {label}
        {selected.length > 0 && <span className="cp-count">{selected.length}</span>}
      </button>
      {open && (
        <>
          {hint && <span className="mini-label">{hint}</span>}
          <div className="cp-grid">
            {PICKER_SUITS.map(({ suit, symbol, red }) => (
              <div key={suit} className="cp-row">
                <span className={`cp-suit ${red ? 'red' : ''}`}>{symbol}</span>
                {RANKS_13.map((r) => {
                  const key = `${suit}${r}`;
                  const gone = dim.has(r);
                  return (
                    <button key={key} type="button"
                      className={`cp-card ${selected.includes(key) ? 'on' : ''} ${gone ? 'gone' : ''}`}
                      style={selected.includes(key) && accent ? { background: accent, borderColor: accent } : undefined}
                      aria-pressed={selected.includes(key)}
                      aria-label={`${r} of ${({ S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' } as Record<string, string>)[suit]}`}
                      title={gone ? 'This whole rank is already out of the deck' : undefined}
                      onClick={() => onToggle(key)}>{r}</button>
                  );
                })}
              </div>
            ))}
          </div>
          {selected.length > 0 && (
            <button className="chip" onClick={() => selected.slice().forEach(onToggle)}>Clear all {selected.length}</button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * A price list for cards.
 *
 * The engine has always been able to say "the jack of diamonds is worth ten" — its scorers read
 * a suit key, a rank key and a suit+rank key. The builder only ever wrote two of those, both
 * hard-coded, so every game where one particular card matters had to be hand-edited as JSON.
 * This is the same grid as the picker, with a number attached to whatever you tap.
 */
function CardValues({ values, onChange, unit = 'points' }:
  { values: Record<string, number>; onChange: (next: Record<string, number>) => void; unit?: string }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(values);
  const setKey = (key: string, v: number | null) => {
    const next = { ...values };
    if (v === null) delete next[key]; else next[key] = v;
    onChange(next);
  };
  const label = (k: string) => {
    if (k.length > 1 && PICKER_SUITS.some((s) => s.suit === k[0])) {
      return `${k.slice(1)}${PICKER_SUITS.find((s) => s.suit === k[0])!.symbol}`;
    }
    const suit = PICKER_SUITS.find((s) => s.suit === k);
    return suit ? `every ${suit.symbol}` : `every ${k}`;
  };
  return (
    <div className="cardpicker">
      <button className="cp-head" onClick={() => setOpen(!open)}>
        <span className="sec-caret">{open ? '▾' : '▸'}</span> Price individual cards
        {entries.length > 0 && <span className="cp-count">{entries.length}</span>}
      </button>
      {open && (
        <>
          <span className="mini-label">Tap a card to give it its own value. A card's own price beats a whole-suit price, which beats a whole-rank one.</span>
          <div className="cp-grid">
            {PICKER_SUITS.map(({ suit, symbol, red }) => (
              <div key={suit} className="cp-row">
                <button type="button" className={`cp-suit as-btn ${red ? 'red' : ''} ${values[suit] !== undefined ? 'on' : ''}`}
                  title={`Price every ${suit === 'S' ? 'spade' : suit === 'H' ? 'heart' : suit === 'D' ? 'diamond' : 'club'}`}
                  onClick={() => setKey(suit, values[suit] === undefined ? 1 : null)}>{symbol}</button>
                {RANKS_13.map((r) => {
                  const key = `${suit}${r}`;
                  const on = values[key] !== undefined;
                  return (
                    <button key={key} type="button" className={`cp-card ${on ? 'on' : ''}`} aria-pressed={on}
                      onClick={() => setKey(key, on ? null : 1)}>{on ? values[key] : r}</button>
                  );
                })}
              </div>
            ))}
          </div>
          {entries.length > 0 && (
            <div className="cv-list">
              {entries.map(([k, v]) => (
                <label key={k} className="cv-row">
                  <span>{label(k)}</span>
                  <input type="number" value={v} onChange={(e) => setKey(k, parseInt(e.target.value || '0', 10))} />
                  <span className="cv-unit">{unit}</span>
                  <button className="chip" onClick={() => setKey(k, null)} aria-label={`Remove ${label(k)}`}>×</button>
                </label>
              ))}
            </div>
          )}
        </>
      )}
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

// Options can be numbers (deck counts) or strings (deal shapes), so this is generic over both.
function Seg<T extends string | number>({ options, value, onChange }:
  { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg wrap">
      {options.map(([val, lbl]) => (
        <button key={String(val)} className={value === val ? 'on' : ''} onClick={() => onChange(val)}>{lbl}</button>
      ))}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="field"><span>{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(parseInt(e.target.value || '0', 10))} />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><b>{value}</b></div>;
}
