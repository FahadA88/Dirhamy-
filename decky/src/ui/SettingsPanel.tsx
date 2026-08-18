import { createContext, useContext, useMemo, useState } from 'react';
import { useSettings } from '../settings/SettingsContext';
import { useDismissable } from './useEscape';
import {
  ACCENTS, AccentId, BACKS, CardBack, CardFace, CustomBack, FACES, FELTS, Settings, TableFelt,
} from '../settings/settings';

// Preferences.
//
// The old version was one drawer with six headings and a scrollbar, and it had shipped two
// separate table pickers that set the same value. This is the shape every application that
// takes its preferences seriously ends up at: a rail of categories on the left, one category
// at a time on the right, one row per setting with the label on the left and the control on
// the right, and a search box for the times you know what you want to change but not where
// somebody filed it.
//
// Two rules hold it together. A setting appears in exactly one place. And every row is
// label-then-control on one line, so the eye runs down a single column of controls instead of
// hunting for them.

const DEFAULT_CUSTOM_BACK: CustomBack = { pattern: 'lattice', ink: '#d6af5c', ground: '#123b28', emblem: '♠' };

const PATTERNS: [CustomBack['pattern'], string][] = [
  ['lattice', 'Lattice'], ['stripe', 'Stripe'], ['dots', 'Dots'],
  ['checker', 'Checker'], ['wave', 'Wave'], ['plain', 'Plain'],
];
const EMBLEMS = ['', '♠', '♥', '♦', '♣', '★', '✦', '❖', '⚜'];

type SectionId = 'look' | 'table' | 'cards' | 'play' | 'opponents' | 'motion' | 'access';

const SECTIONS: { id: SectionId; label: string; mark: string; blurb: string }[] = [
  { id: 'look', label: 'Appearance', mark: '◐', blurb: 'Light or dark, and the accent through the site.' },
  { id: 'table', label: 'The table', mark: '▤', blurb: 'What you play on.' },
  { id: 'cards', label: 'Cards', mark: '🂠', blurb: 'Faces, backs, and one you draw yourself.' },
  { id: 'play', label: 'Playing', mark: '▶', blurb: 'How the table behaves while you play.' },
  { id: 'opponents', label: 'Opponents', mark: '☻', blurb: 'Who you play against and how fast.' },
  { id: 'motion', label: 'Motion & sound', mark: '♪', blurb: 'Animation, background, audio.' },
  { id: 'access', label: 'Accessibility', mark: '◎', blurb: 'Text, contrast, and reducing movement.' },
];

/** The live search term, so a row can decide for itself whether it is a match. */
const Query = createContext('');

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, set, reset } = useSettings();
  const ref = useDismissable(open, onClose);
  const [section, setSection] = useState<SectionId>('look');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  if (!open) return null;

  return (
    <div className="prefs-scrim" onClick={onClose}>
      <div className="prefs" ref={ref} role="dialog" aria-modal="true" aria-label="Preferences"
        onClick={(e) => e.stopPropagation()}>

        <header className="prefs-head">
          <h2>Preferences</h2>
          <input
            className="prefs-search"
            type="search"
            placeholder="Search settings…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search settings"
          />
          <div className="prefs-head-actions">
            <button className="ghost sm" onClick={reset}>Reset all</button>
            <button className="primary sm" onClick={onClose}>Done</button>
          </div>
        </header>

        <div className="prefs-body">
          <nav className="prefs-rail" aria-label="Settings categories">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`prefs-tab ${!searching && section === s.id ? 'on' : ''}`}
                aria-current={!searching && section === s.id}
                onClick={() => { setQuery(''); setSection(s.id); }}
              >
                <span className="pt-mark" aria-hidden="true">{s.mark}</span>
                <span className="pt-label">{s.label}</span>
              </button>
            ))}
            <Preview />
          </nav>

          <div className="prefs-pane">
            <Query.Provider value={q}>
              {searching ? (
                <>
                  <p className="prefs-searching">Matches for “{query}”</p>
                  {SECTIONS.map((s) => (
                    <Section key={s.id} title={s.label}>{body(s.id, settings, set)}</Section>
                  ))}
                  <p className="prefs-nomatch">Nothing else matches that.</p>
                </>
              ) : (
                <>
                  <div className="prefs-pane-head">
                    <h3>{SECTIONS.find((s) => s.id === section)!.label}</h3>
                    <p>{SECTIONS.find((s) => s.id === section)!.blurb}</p>
                  </div>
                  {body(section, settings, set)}
                </>
              )}
            </Query.Provider>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- the sections ----------

type Setter = <K extends keyof Settings>(k: K, v: Settings[K]) => void;

function body(id: SectionId, s: Settings, set: Setter): React.ReactNode {
  switch (id) {
    case 'look': return <LookSection s={s} set={set} />;
    case 'table': return <TableSection s={s} set={set} />;
    case 'cards': return <CardsSection s={s} set={set} />;
    case 'play': return <PlaySection s={s} set={set} />;
    case 'opponents': return <OpponentsSection s={s} set={set} />;
    case 'motion': return <MotionSection s={s} set={set} />;
    case 'access': return <AccessSection s={s} set={set} />;
  }
}

function LookSection({ s, set }: { s: Settings; set: Setter }) {
  return (
    <>
      <Row label="Theme" hint="The room after midnight, or the same room with the lights on." keywords="light dark mode night">
        <Seg value={s.theme} onChange={(v) => set('theme', v as Settings['theme'])}
          options={[['light', 'Day'], ['dark', 'Evening'], ['system', 'Match device']]} />
      </Row>
      <Row label="Accent" hint="The light everything else takes its cue from." keywords="colour color highlight">
        <div className="swatches inline">
          {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
            <button key={id} title={ACCENTS[id].name} aria-label={ACCENTS[id].name}
              className={`swatch dot ${s.accent === id ? 'on' : ''}`}
              style={{ background: `linear-gradient(135deg, ${ACCENTS[id].emerald}, ${ACCENTS[id].green})` }}
              onClick={() => set('accent', id)} />
          ))}
        </div>
      </Row>
      <Row label="Density" hint="How much air there is between things." keywords="compact comfortable spacing">
        <Seg value={s.density} onChange={(v) => set('density', v as Settings['density'])}
          options={[['comfortable', 'Comfortable'], ['compact', 'Compact']]} />
      </Row>
      <Row label="Card size" keywords="big small large cards">
        <Seg value={s.cardSize} onChange={(v) => set('cardSize', v as Settings['cardSize'])}
          options={[['s', 'Small'], ['m', 'Medium'], ['l', 'Large']]} />
      </Row>
    </>
  );
}

function TableSection({ s, set }: { s: Settings; set: Setter }) {
  return (
    <Row label="Cloth" hint={FELTS[s.tableFelt].blurb} keywords="felt table green baize surface" wide>
      <div className="swatches tables">
        {(Object.keys(FELTS) as TableFelt[]).map((t) => (
          <button key={t} className={`swatch wide ${s.tableFelt === t ? 'on' : ''}`}
            title={FELTS[t].blurb} aria-pressed={s.tableFelt === t}
            onClick={() => set('tableFelt', t)}>
            <span className="felt-swatch" data-felt={t}><span className="fs-rail"><span className="fs-felt" /></span></span>
            <em>{FELTS[t].name}</em>
          </button>
        ))}
      </div>
    </Row>
  );
}

function CardsSection({ s, set }: { s: Settings; set: Setter }) {
  return (
    <>
      <Row label="Face" hint={FACES[s.cardFace].note} keywords="face pips index numbers colour blind suits" wide>
        <div className="swatches faces">
          {(Object.keys(FACES) as CardFace[]).map((f) => (
            <button key={f} className={`swatch ${s.cardFace === f ? 'on' : ''}`}
              title={FACES[f].note} aria-pressed={s.cardFace === f}
              onClick={() => set('cardFace', f)}>
              <span className={`sw-card card face f-${f} ${f === 'block' || f === 'neon' ? 'black' : 'red'}`}>
                <span className="corner tl">A<span>♥</span></span>
              </span>
              <em>{FACES[f].name}</em>
            </button>
          ))}
        </div>
      </Row>

      <Row label="Back" hint="What the other side of every card looks like." keywords="back pattern deck design" wide>
        <div className="swatches backs">
          {(Object.keys(BACKS) as Exclude<CardBack, 'custom'>[]).map((bk) => (
            <button key={bk} className={`swatch ${s.cardBack === bk ? 'on' : ''}`}
              title={BACKS[bk].name} aria-pressed={s.cardBack === bk}
              onClick={() => set('cardBack', bk)}>
              <span className="sw-back" data-back={bk}>{bk === 'monogram' ? '♠' : ''}</span>
              <em>{BACKS[bk].name}</em>
            </button>
          ))}
          <button className={`swatch ${s.cardBack === 'custom' ? 'on' : ''}`}
            aria-pressed={s.cardBack === 'custom'}
            onClick={() => { if (!s.customBack) set('customBack', DEFAULT_CUSTOM_BACK); set('cardBack', 'custom'); }}>
            <span className="sw-back mine" data-cbpattern={s.customBack?.pattern}
              style={s.customBack ? { ['--cb-ink' as string]: s.customBack.ink, ['--cb-ground' as string]: s.customBack.ground } : undefined}>
              {s.customBack?.emblem || '+'}
            </span>
            <em>Yours</em>
          </button>
        </div>
      </Row>

      {s.cardBack === 'custom' && (
        <Row label="Your back" hint="Four dials, because a back has to stay legible at the size of a thumbnail." keywords="custom design own draw" wide>
          <BackDesigner value={s.customBack ?? DEFAULT_CUSTOM_BACK} onChange={(v) => set('customBack', v)} />
        </Row>
      )}

      <Row label="Sort your hand" keywords="order arrange rank suit">
        <Seg value={s.sort} onChange={(v) => set('sort', v as Settings['sort'])}
          options={[['off', 'As dealt'], ['rank', 'By rank'], ['suit', 'By suit']]} />
      </Row>
    </>
  );
}

function PlaySection({ s, set }: { s: Settings; set: Setter }) {
  return (
    <>
      <Row label="Your name" keywords="player name you">
        <input className="pref-text" value={s.playerName} maxLength={16}
          onChange={(e) => set('playerName', e.target.value || 'You')} />
      </Row>
      <Row label="Show legal moves" hint="How a card you are allowed to play is marked." keywords="highlight glow outline hint legal">
        <Seg value={s.highlight} onChange={(v) => set('highlight', v as Settings['highlight'])}
          options={[['glow', 'Glow'], ['outline', 'Outline'], ['lift', 'Lift'], ['off', 'Off']]} />
      </Row>
      <Row label="Confirm before playing" hint="Tap once to pick the card, again to play it." keywords="confirm double tap mistake">
        <Toggle on={s.confirmPlays} onChange={(v) => set('confirmPlays', v)} label="Confirm before playing" />
      </Row>
      <Row label="Game log" hint="The running account of what everyone did." keywords="log history record">
        <Toggle on={s.showLog} onChange={(v) => set('showLog', v)} label="Game log" />
      </Row>
      <Row label="Seats by default" hint="Used when you start a game without setting a table up." keywords="players seats number">
        <div className="pref-range">
          <input type="range" min={2} max={6} value={s.defaultSeats}
            aria-label="Default seats"
            onChange={(e) => set('defaultSeats', +e.target.value)} />
          <b>{s.defaultSeats}</b>
        </div>
      </Row>
    </>
  );
}

function OpponentsSection({ s, set }: { s: Settings; set: Setter }) {
  return (
    <>
      <Row label="How they are named" keywords="bot bots names labels seats opponents">
        <Seg value={s.botLabels ? 'bot' : 'seat'} onChange={(v) => set('botLabels', v === 'bot')}
          options={[['bot', 'Bot 2, Bot 3…'], ['seat', 'P2, P3…']]} />
      </Row>
      <Row label="How fast they play" hint="Instant is useful when you are testing a game you built." keywords="bot bots speed slow fast pace opponents">
        <Seg value={s.botSpeed} onChange={(v) => set('botSpeed', v as Settings['botSpeed'])}
          options={[['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']]} />
      </Row>
      <Row label="How well they play" hint="Smart bots follow the rules of thumb a decent player would." keywords="bot bots difficulty hard easy smart random opponents">
        <Seg value={s.botDiff} onChange={(v) => set('botDiff', v as Settings['botDiff'])}
          options={[['random', 'Easy'], ['smart', 'Smart']]} />
      </Row>
    </>
  );
}

function MotionSection({ s, set }: { s: Settings; set: Setter }) {
  return (
    <>
      <Row label="Animation" hint="Reduced keeps the game and drops the flourishes, including the deal." keywords="motion animation reduce deal shuffle">
        <Seg value={s.motion} onChange={(v) => set('motion', v as Settings['motion'])}
          options={[['full', 'Full'], ['reduced', 'Reduced']]} />
      </Row>
      <Row label="Sound" hint="Short tones on play, draw and win. Nothing else." keywords="audio sound mute volume">
        <Toggle on={s.sound} onChange={(v) => set('sound', v)} label="Sound" />
      </Row>
      <Row label="Moving background" keywords="background ambient 3d">
        <Toggle on={s.ambient3d} onChange={(v) => set('ambient3d', v)} label="Moving background" />
      </Row>
      <Row label="Glowing orbs" keywords="orbs background glow" indent>
        <Toggle on={s.orbs} onChange={(v) => set('orbs', v)} disabled={!s.ambient3d} label="Glowing orbs" />
      </Row>
      <Row label="Perspective grid" keywords="grid background lines" indent>
        <Toggle on={s.grid} onChange={(v) => set('grid', v)} disabled={!s.ambient3d} label="Perspective grid" />
      </Row>
      <Row label="Drifting cards" keywords="floaties cards background" indent>
        <Toggle on={s.floaties} onChange={(v) => set('floaties', v)} disabled={!s.ambient3d} label="Drifting cards" />
      </Row>
    </>
  );
}

function AccessSection({ s, set }: { s: Settings; set: Setter }) {
  return (
    <>
      <Row label="Text size" keywords="font bigger larger read">
        <Seg value={s.textSize} onChange={(v) => set('textSize', v as Settings['textSize'])}
          options={[['s', 'Small'], ['m', 'Default'], ['l', 'Large'], ['xl', 'Largest']]} />
      </Row>
      <Row label="Easier-to-read text" hint="Heavier strokes, more space between letters, no italics." keywords="dyslexia legible contrast bold">
        <Toggle on={s.legibleText} onChange={(v) => set('legibleText', v)} label="Easier-to-read text" />
      </Row>
      <Row
        label="Colour-safe cards"
        hint="Suit Letters and Shape Coded are the two faces that stay readable with a red-green deficiency. They are in Cards ▸ Face."
        keywords="colourblind colorblind deficiency red green suits accessibility"
      >
        <Seg value={s.cardFace === 'letters' || s.cardFace === 'shapes' ? s.cardFace : 'off'}
          onChange={(v) => set('cardFace', (v === 'off' ? 'classic' : v) as CardFace)}
          options={[['off', 'Off'], ['letters', 'Letters'], ['shapes', 'Shapes']]} />
      </Row>
      <Row label="Animation" hint="The same control as in Motion & sound — here because it is the one people look for." keywords="motion reduce vestibular">
        <Seg value={s.motion} onChange={(v) => set('motion', v as Settings['motion'])}
          options={[['full', 'Full'], ['reduced', 'Reduced']]} />
      </Row>
    </>
  );
}

// ---------- the live preview ----------

/** What the choices add up to, kept in view while you make them. */
function Preview() {
  const { settings } = useSettings();
  return (
    <div className="prefs-preview">
      <span className="pp-title">Preview</span>
      <div className="pp-stage" data-felt={settings.tableFelt}>
        <span className="pp-felt" />
        <span className={`sw-card card face f-${settings.cardFace} red pp-face`}>
          <span className="corner tl">A<span>♥</span></span>
        </span>
        <span
          className={`sw-back pp-back ${settings.cardBack === 'custom' ? 'mine' : ''}`}
          data-back={settings.cardBack === 'custom' ? undefined : settings.cardBack}
          data-cbpattern={settings.cardBack === 'custom' ? settings.customBack?.pattern : undefined}
          style={settings.cardBack === 'custom' && settings.customBack
            ? { ['--cb-ink' as string]: settings.customBack.ink, ['--cb-ground' as string]: settings.customBack.ground }
            : undefined}
        >
          {settings.cardBack === 'custom' ? settings.customBack?.emblem : settings.cardBack === 'monogram' ? '♠' : ''}
        </span>
      </div>
      <span className="pp-caption">
        {FACES[settings.cardFace].name} · {settings.cardBack === 'custom' ? 'Yours' : BACKS[settings.cardBack as Exclude<CardBack, 'custom'>].name} · {FELTS[settings.tableFelt].name}
      </span>
    </div>
  );
}

/**
 * Make your own back. Deliberately four dials rather than a canvas: a back has to stay legible
 * at thumbnail size across a whole table, and an open drawing tool produces mud.
 */
function BackDesigner({ value, onChange }: { value: CustomBack; onChange: (v: CustomBack) => void }) {
  const patch = (p: Partial<CustomBack>) => onChange({ ...value, ...p });
  return (
    <div className="designer">
      <div className="dz-preview">
        <span className="sw-back big mine" data-cbpattern={value.pattern}
          style={{ ['--cb-ink' as string]: value.ink, ['--cb-ground' as string]: value.ground }}>
          {value.emblem}
        </span>
      </div>
      <div className="dz-controls">
        <div className="field"><span>Pattern</span>
          <div className="seg wrap">
            {PATTERNS.map(([p, label]) => (
              <button key={p} className={value.pattern === p ? 'on' : ''} onClick={() => patch({ pattern: p })}>{label}</button>
            ))}
          </div>
        </div>
        <div className="two">
          <label className="field"><span>Ink</span>
            <input type="color" value={value.ink} onChange={(e) => patch({ ink: e.target.value })} /></label>
          <label className="field"><span>Card</span>
            <input type="color" value={value.ground} onChange={(e) => patch({ ground: e.target.value })} /></label>
        </div>
        <div className="field"><span>Emblem</span>
          <div className="seg wrap">
            {EMBLEMS.map((g) => (
              <button key={g || 'none'} className={value.emblem === g ? 'on' : ''} onClick={() => patch({ emblem: g })}>{g || 'None'}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- rows and controls ----------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="pref-section"><h4>{title}</h4>{children}</section>;
}

/**
 * One setting. Label and description on the left, the control on the right — and it takes
 * itself out of the page when a search is running and it is not a match, which is what makes
 * the search box work without a second copy of every setting in a lookup table.
 */
function Row({ label, hint, keywords, children, wide, indent }: {
  label: string;
  hint?: string;
  keywords?: string;
  children: React.ReactNode;
  /** The control needs the full width — a grid of swatches rather than a segmented button. */
  wide?: boolean;
  /** A setting that only means anything while the one above it is on. */
  indent?: boolean;
}) {
  const q = useContext(Query);
  const hay = useMemo(
    () => `${label} ${hint ?? ''} ${keywords ?? ''}`.toLowerCase(),
    [label, hint, keywords],
  );
  if (q && !hay.includes(q)) return null;
  return (
    <div className={`pref-row ${wide ? 'wide' : ''} ${indent ? 'indent' : ''}`}>
      <div className="pref-label">
        <span>{label}</span>
        {hint && <em>{hint}</em>}
      </div>
      <div className="pref-control">{children}</div>
    </div>
  );
}

function Toggle({ label, on, onChange, disabled }: {
  label: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} disabled={disabled}
      onClick={() => onChange(!on)} aria-pressed={on} aria-label={label}>
      <span className="knob" />
    </button>
  );
}

function Seg({ value, options, onChange }: {
  value: string; options: [string, string][]; onChange: (v: string) => void;
}) {
  return (
    <div className="seg wrap">
      {options.map(([val, lbl]) => (
        <button key={val} className={value === val ? 'on' : ''}
          aria-pressed={value === val} onClick={() => onChange(val)}>{lbl}</button>
      ))}
    </div>
  );
}
