import { createContext, useContext, useMemo, useState } from 'react';
import { useSettings } from '../settings/SettingsContext';
import { useDismissable } from './useEscape';
import { resetFirstRun } from './FirstRun';
import { Confirm } from './Confirm';
import { adoptSyncCode, pullSafety, pushSafety, syncCode } from '../social/safety';
import { hostInfo } from '../net/host';
import { ENGINE_CHANGELOG } from '../engine/changelog';
import { canSpeak } from './speech';
import {
  ACCENTS, AVATARS, AccentId, BACKS, CardBack, CardFace, CustomBack, CustomFelt, FACES, FELTS,
  MAX_BACK_IMAGE, MyLook, Settings, TableFelt, THEME_PACKS,
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

const DEFAULT_CUSTOM_BACK: CustomBack = { pattern: 'lattice', ink: '#d6af5c', ground: '#123b28', emblem: '♠', image: null };

/** A green cloth in a dark rail — a plain table to start from before you change it. */
const DEFAULT_FELT: CustomFelt = { cloth: '#1c6b46', rail: '#241a12' };

/** Saved settings only ever held 'smart' or 'random'; the picker now offers three tiers. */
function tierOfDiff(d: Settings['botDiff']): 'easy' | 'normal' | 'hard' {
  if (d === 'random' || d === 'easy') return 'easy';
  if (d === 'normal') return 'normal';
  return 'hard';
}

const PATTERNS: [CustomBack['pattern'], string][] = [
  ['lattice', 'Lattice'], ['stripe', 'Stripe'], ['dots', 'Dots'],
  ['checker', 'Checker'], ['wave', 'Wave'], ['plain', 'Plain'],
];
const EMBLEMS = ['', '♠', '♥', '♦', '♣', '★', '✦', '❖', '⚜'];

type SectionId = 'look' | 'table' | 'cards' | 'you' | 'play' | 'opponents' | 'motion' | 'access' | 'about';

const SECTIONS: { id: SectionId; label: string; mark: string; blurb: string }[] = [
  { id: 'look', label: 'Appearance', mark: '◐', blurb: 'Light or dark, and the accent through the site.' },
  { id: 'table', label: 'The table', mark: '▤', blurb: 'What you play on.' },
  { id: 'cards', label: 'Cards', mark: '🂠', blurb: 'Faces, backs, and one you draw yourself.' },
  { id: 'you', label: 'You', mark: '☺', blurb: 'Your name, face and colour at the table.' },
  { id: 'play', label: 'Playing', mark: '▶', blurb: 'How the table behaves while you play.' },
  { id: 'opponents', label: 'Opponents', mark: '☻', blurb: 'Who you play against and how fast.' },
  { id: 'motion', label: 'Motion & sound', mark: '♪', blurb: 'Animation, background, audio.' },
  { id: 'access', label: 'Accessibility', mark: '◎', blurb: 'Text, contrast, and reducing movement.' },
  { id: 'about', label: 'About', mark: 'ⓘ', blurb: 'What this is, and what it is not.' },
];

/** The live search term, so a row can decide for itself whether it is a match. */
const Query = createContext('');

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, set, reset } = useSettings();
  const ref = useDismissable(open, onClose);
  const [section, setSection] = useState<SectionId>('look');
  const [query, setQuery] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  if (!open) return null;

  return (
    // Click-outside-to-close is supplementary — the ref below wires Escape, and there's a real
    // Close button inside. The scrim is the dimmed rest of the page, not a control.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div className="prefs-scrim" onClick={onClose}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
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
            <button className="ghost sm" onClick={() => setConfirmingReset(true)}>Reset all</button>
            <button className="primary sm" onClick={onClose}>Done</button>
          </div>
        </header>

        {confirmingReset && (
          <Confirm
            title="Reset every setting?"
            body="This puts your theme, table, cards, and everything else here back to how it started — including any custom card back or table cloth you’ve made. It can’t be undone."
            confirmLabel="Reset everything"
            onConfirm={() => { reset(); setConfirmingReset(false); }}
            onCancel={() => setConfirmingReset(false)}
          />
        )}

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
    case 'you': return <YouSection s={s} set={set} />;
    case 'play': return <PlaySection s={s} set={set} />;
    case 'opponents': return <OpponentsSection s={s} set={set} />;
    case 'motion': return <MotionSection s={s} set={set} />;
    case 'access': return <AccessSection s={s} set={set} />;
    case 'about': return <AboutSection />;
  }
}

function LookSection({ s, set }: { s: Settings; set: Setter }) {
  // A pack writes four settings at once. Whichever one matches all four is shown as current;
  // change any of them afterwards and no pack is highlighted, which is the honest answer.
  const activePack = THEME_PACKS.find((p) => p.accent === s.accent && p.tableFelt === s.tableFelt
    && p.cardBack === s.cardBack && p.cardFace === s.cardFace);
  const mine = s.myLooks ?? [];
  const activeMine = mine.find((p) => p.accent === s.accent && p.tableFelt === s.tableFelt
    && p.cardBack === s.cardBack && p.cardFace === s.cardFace);
  // Mixed something nobody made a button for yet. A preset used to be the only way back to a
  // combination once you moved past it — pick another pack and the mix you had was just gone,
  // with no record it ever existed. This is that record.
  const unsaved = !activePack && !activeMine;
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  function saveMix() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const look: MyLook = {
      id: `mine-${Date.now().toString(36)}`, name: trimmed,
      accent: s.accent, tableFelt: s.tableFelt, cardBack: s.cardBack, cardFace: s.cardFace,
    };
    set('myLooks', [...mine, look]);
    setNaming(false); setName('');
  }
  return (
    <>
      <Row label="A whole look" hint="Sets the accent, cloth, back and face together. Everything stays editable afterwards." keywords="theme pack preset season look style bundle" wide>
        <div className="swatches packs">
          {THEME_PACKS.map((p) => (
            <button key={p.id} className={`swatch wide ${activePack?.id === p.id ? 'on' : ''}`}
              title={p.blurb} aria-pressed={activePack?.id === p.id}
              onClick={() => {
                set('accent', p.accent); set('tableFelt', p.tableFelt);
                set('cardBack', p.cardBack); set('cardFace', p.cardFace);
              }}>
              <span className="pack-swatch" data-felt={p.tableFelt}>
                <span className="pk-dot" style={{ background: ACCENTS[p.accent].emerald }} />
              </span>
              <em>{p.name}</em>
            </button>
          ))}
          {mine.map((p) => (
            <button key={p.id} className={`swatch wide mine ${activeMine?.id === p.id ? 'on' : ''}`}
              title={`Your own look: ${p.name}`} aria-pressed={activeMine?.id === p.id}
              onClick={() => {
                set('accent', p.accent); set('tableFelt', p.tableFelt);
                set('cardBack', p.cardBack); set('cardFace', p.cardFace);
              }}>
              <span className="pack-swatch" data-felt={p.tableFelt}>
                <span className="pk-dot" style={{ background: ACCENTS[p.accent].emerald }} />
              </span>
              <em>{p.name}</em>
              <span className="mine-del" role="button" tabIndex={0} aria-label={`Forget the look "${p.name}"`}
                onClick={(e) => { e.stopPropagation(); set('myLooks', mine.filter((m) => m.id !== p.id)); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); set('myLooks', mine.filter((m) => m.id !== p.id)); } }}
              >×</span>
            </button>
          ))}
          {unsaved && (
            naming ? (
              <form className="swatch wide save-mix" onSubmit={(e) => { e.preventDefault(); saveMix(); }}>
                {/* This is the case autoFocus is meant for: the field only exists because the
                    user just clicked "Save as new look", so focus was already headed here — it
                    never steals it on page load or from anywhere the user didn't just ask. */}
                {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Name this look" maxLength={24} aria-label="Name for this look" />
                <div className="save-mix-actions">
                  <button type="submit" className="primary sm" disabled={!name.trim()}>Save</button>
                  <button type="button" className="ghost sm" onClick={() => { setNaming(false); setName(''); }}>Cancel</button>
                </div>
              </form>
            ) : (
              <button className="swatch wide save-mix-cta" onClick={() => setNaming(true)}>
                <span className="pk-plus" aria-hidden="true">+</span>
                <em>Save this mix</em>
              </button>
            )
          )}
        </div>
      </Row>
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
  const felt = s.customFelt ?? DEFAULT_FELT;
  return (
    <>
      <Row label="Cloth" hint={FELTS[s.tableFelt].blurb} keywords="felt table green baize surface" wide>
        <div className="swatches tables">
          {(Object.keys(FELTS) as TableFelt[]).map((t) => (
            <button key={t} className={`swatch wide ${s.tableFelt === t ? 'on' : ''}`}
              title={FELTS[t].blurb} aria-pressed={s.tableFelt === t}
              onClick={() => {
                set('tableFelt', t);
                if (t === 'custom' && !s.customFelt) set('customFelt', DEFAULT_FELT);
              }}>
              <span className="felt-swatch" data-felt={t}><span className="fs-rail"><span className="fs-felt" /></span></span>
              <em>{FELTS[t].name}</em>
            </button>
          ))}
        </div>
      </Row>
      {/* Only asked once you have said you want your own — no point crowding the panel otherwise. */}
      {s.tableFelt === 'custom' && (
        <Row label="Your cloth" hint="The colour of the felt and the rail around it." keywords="custom felt colour color cloth rail mine" indent>
          <div className="cust-colours">
            <label><span>Cloth</span><input type="color" value={felt.cloth}
              onChange={(e) => set('customFelt', { ...felt, cloth: e.target.value })} /></label>
            <label><span>Rail</span><input type="color" value={felt.rail}
              onChange={(e) => set('customFelt', { ...felt, rail: e.target.value })} /></label>
          </div>
        </Row>
      )}
    </>
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

      <Row label="Sort your hand" hint="Auto picks whatever order actually suits the game — suit-grouped for a trick game, by rank for a climbing game, and so on." keywords="order arrange rank suit auto">
        <Seg value={s.sort} onChange={(v) => set('sort', v as Settings['sort'])}
          options={[['auto', 'Auto'], ['off', 'As dealt'], ['rank', 'By rank'], ['suit', 'By suit']]} />
      </Row>
    </>
  );
}

/** Who you are at the table. Name, face and colour, kept together and away from the rules. */
function YouSection({ s, set }: { s: Settings; set: Setter }) {
  return (
    <>
      <Row label="Your name" keywords="player name you">
        <input className="pref-text" value={s.playerName} maxLength={16}
          onChange={(e) => set('playerName', e.target.value || 'You')} />
      </Row>
      <Row label="Your face" hint="Shown beside your name at the table." keywords="avatar icon emoji face picture you" wide>
        <div className="swatches avatars">
          {AVATARS.map((g) => (
            <button key={g} className={`swatch glyph ${s.avatar === g ? 'on' : ''}`}
              aria-label={`Avatar ${g}`} aria-pressed={s.avatar === g}
              onClick={() => set('avatar', g)}>{g}</button>
          ))}
        </div>
      </Row>
      <Row label="Your colour" hint="Tints what belongs to you at the table." keywords="colour color seat you player">
        <div className="swatches inline">
          {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
            <button key={id} title={ACCENTS[id].name} aria-label={ACCENTS[id].name}
              aria-pressed={s.playerColor === id}
              className={`swatch dot ${s.playerColor === id ? 'on' : ''}`}
              style={{ background: `linear-gradient(135deg, ${ACCENTS[id].emerald}, ${ACCENTS[id].green})` }}
              onClick={() => set('playerColor', id)} />
          ))}
        </div>
      </Row>
    </>
  );
}

function PlaySection({ s, set }: { s: Settings; set: Setter }) {
  return (
    <>
      <Row label="Show legal moves" hint="How a card you are allowed to play is marked." keywords="highlight glow outline hint legal">
        <Seg value={s.highlight} onChange={(v) => set('highlight', v as Settings['highlight'])}
          options={[['glow', 'Glow'], ['outline', 'Outline'], ['lift', 'Lift'], ['off', 'Off']]} />
      </Row>
      <Row label="Confirm before playing" hint="Tap once to pick the card, again to play it." keywords="confirm double tap mistake">
        <Toggle on={s.confirmPlays} onChange={(v) => set('confirmPlays', v)} label="Confirm before playing" />
      </Row>
      <Row label="Play a forced move" hint="When you have exactly one legal move, it plays itself instead of waiting to be told to." keywords="forced auto single only legal move">
        <Toggle on={s.autoPlayForced} onChange={(v) => set('autoPlayForced', v)} label="Play a forced move automatically" />
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
      <Row label="Undo a misclick" hint="A few seconds to take a move back before the table moves on. Solo play only — online, the others have already seen it." keywords="undo takeback mistake misclick grace">
        <Seg value={String(s.undoGraceMs)} onChange={(v) => set('undoGraceMs', +v)}
          options={[['0', 'Off'], ['3000', '3s'], ['6000', '6s'], ['10000', '10s']]} />
      </Row>
      <Row label="Turn clock" hint="A countdown on every turn. Running out plays a legal move for you rather than forfeiting." keywords="timer clock countdown speed chess blitz">
        <Seg value={String(s.turnSeconds)} onChange={(v) => set('turnSeconds', +v)}
          options={[['0', 'Off'], ['15', '15s'], ['30', '30s'], ['60', '60s']]} />
      </Row>
    </>
  );
}

function OpponentsSection({ s, set }: { s: Settings; set: Setter }) {
  return (
    <>
      <Row label="How they are named" hint="Named draws from a house pool — the same opponent keeps the same name for the whole match, never mid-hand." keywords="bot bots names labels seats opponents named personality character">
        <Seg value={s.botNaming} onChange={(v) => set('botNaming', v as Settings['botNaming'])}
          options={[['bot', 'Bot 2, Bot 3…'], ['seat', 'P2, P3…'], ['named', 'Mara, Théo…']]} />
      </Row>
      <Row label="How fast they play" hint="Instant is useful when you are testing a game you built." keywords="bot bots speed slow fast pace opponents">
        <Seg value={s.botSpeed} onChange={(v) => set('botSpeed', v as Settings['botSpeed'])}
          options={[['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']]} />
      </Row>
      <Row label="How well they play" hint="Easy throws cards away. Normal plays well but slips. Sharp always takes its best line." keywords="bot bots difficulty hard easy normal smart random opponents tier">
        <Seg value={tierOfDiff(s.botDiff)} onChange={(v) => set('botDiff', v as Settings['botDiff'])}
          options={[['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Sharp']]} />
      </Row>
    </>
  );
}

function MotionSection({ s, set }: { s: Settings; set: Setter }) {
  return (
    <>
      <Row label="Animation" hint="Match device follows your system's reduce-motion setting. Reduced keeps the game and drops the flourishes, including the deal." keywords="motion animation reduce deal shuffle system vestibular">
        <Seg value={s.motion} onChange={(v) => set('motion', v as Settings['motion'])}
          options={[['system', 'Match device'], ['full', 'Full'], ['reduced', 'Reduced']]} />
      </Row>
      <Row label="Animation speed" hint="How quickly cards deal and flip. Nothing to do with how fast the bots think." keywords="speed fast slow deal flip animation pace" indent>
        <Seg value={s.animSpeed} onChange={(v) => set('animSpeed', v as Settings['animSpeed'])}
          options={[['relaxed', 'Relaxed'], ['normal', 'Normal'], ['brisk', 'Brisk']]} />
      </Row>
      <Row label="Card sounds" hint="Short tones when a card plays, draws or wins." keywords="audio sound mute volume card play draw win">
        <Toggle on={s.cardSounds} onChange={(v) => set('cardSounds', v)} label="Card sounds" />
      </Row>
      <Row label="Interface sounds" hint="A tone on a selection, or a refusal — the table itself, not the cards on it." keywords="audio sound mute volume interface ui click select refuse">
        <Toggle on={s.uiSounds} onChange={(v) => set('uiSounds', v)} label="Interface sounds" />
      </Row>
      <Row label="Volume" hint="Applies to both categories above." keywords="audio sound volume loud quiet">
        <div className="pref-range">
          <input type="range" min={0} max={100} step={5} value={s.soundVolume}
            aria-label="Sound volume"
            disabled={!s.cardSounds && !s.uiSounds}
            onChange={(e) => set('soundVolume', +e.target.value)} />
          <b>{s.soundVolume}</b>
        </div>
      </Row>
      <Row label="Haptics" hint="A short buzz for your turn starting, a move being refused, and taking a trick. Only does anything on a device with a vibration motor and a browser that exposes it — Android Chrome and Firefox, not iOS Safari." keywords="vibrate buzz haptic feedback phone mobile">
        <Toggle on={s.haptics} onChange={(v) => set('haptics', v)} label="Haptics" />
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
      <Row
        label="See it as"
        hint="Filters the whole app through a colour-vision deficiency, so a choice like the one above can be checked rather than taken on faith. Turn it back off when you’re done — it applies everywhere, not just here."
        keywords="colourblind colorblind deficiency protanopia deuteranopia tritanopia simulate preview accessibility"
        wide
      >
        <Seg value={s.colorVisionSim} onChange={(v) => set('colorVisionSim', v as Settings['colorVisionSim'])}
          options={[['off', 'Off'], ['protanopia', 'Protanopia'], ['deuteranopia', 'Deuteranopia'], ['tritanopia', 'Tritanopia']]} />
      </Row>
      <Row label="Animation" hint="The same control as in Motion & sound — here because it is the one people look for." keywords="motion reduce vestibular system">
        <Seg value={s.motion} onChange={(v) => set('motion', v as Settings['motion'])}
          options={[['system', 'Match device'], ['full', 'Full'], ['reduced', 'Reduced']]} />
      </Row>
      <Row label="One-handed mode" hint="On a narrow phone, moves a bid, a bet or an offer below your hand instead of the centre of the felt — closer to where a thumb holding the phone actually reaches." keywords="one hand thumb reach mobile phone bid bet offer">
        <Toggle on={s.oneHandedMode} onChange={(v) => set('oneHandedMode', v)} label="One-handed mode" />
      </Row>
      <Row
        label="Carry your block list to another device"
        hint="Type this code on your other device to bring your blocks and mutes with you. Anyone who has the code can read and change that list, so treat it like a password."
        keywords="sync block mute safety devices code transfer"
        wide
      >
        <SyncCode />
      </Row>
      <Row label="Show the introduction again" hint="The three cards you saw the first time." keywords="intro tutorial onboarding help first run again">
        <button className="ghost sm" onClick={() => resetFirstRun()}>Show it</button>
      </Row>
      {/* Item 92 of the audit pass: canSpeak() existed for exactly this — hiding a setting that
          cannot do anything — but nothing ever called it, so the toggle showed up even in a
          browser with no speechSynthesis to speak through. */}
      {canSpeak() && (
        <Row label="Read the table aloud" hint="Speaks each move and your hand through the browser's own voice. Separate from a screen reader, which is always supported." keywords="speech speak voice audio blind narrate tts">
          <Toggle on={s.speak} onChange={(v) => set('speak', v)} label="Read the table aloud" />
        </Row>
      )}
    </>
  );
}

function AboutSection() {
  return (
    <>
      <Row label="What this is" wide keywords="about engine data-driven interpreter">
        <p className="about-p">
          Decky plays cards. One interpreter reads a game's rules and runs it — the same
          interpreter for all twenty-something games in the shelf and for anything built in
          Create. There is no per-game code hiding underneath; a game here is a description,
          not a program.
        </p>
      </Row>
      <Row label="The rules are data" wide keywords="about eval custom rules trust">
        <p className="about-p">
          A rule reads as when this happens, if that is true, then do this — never a script.
          Nothing a game defines is ever executed as code, including anything written by the
          AI game-writer in Create. A definition is also fixed the moment a table is dealt, so
          a game cannot change under you partway through a match.
        </p>
      </Row>
      <Row label="A fair deal" wide keywords="about fairness commit reveal seed hash random shuffle">
        <p className="about-p">
          Before a hand is dealt, the server commits to the shuffle it is about to use by
          publishing a hash of its secret seed — fixed before a single card moves, checkable
          against the seed once the hand is revealed. The shuffle cannot be steered afterward
          to suit how the deal turns out.
        </p>
      </Row>
      <Row label="No money" wide keywords="about gambling betting stakes real money">
        <p className="about-p">
          Nothing here is played for money, and nothing ever will be. Chips, pots and bids in
          the poker-family games are scorekeeping, not currency.
        </p>
      </Row>
      <Row label="What’s changed" wide keywords="about changelog rules updates history version">
        <p className="about-p">
          Rules are data, and data changes. A new game, a rules fix or a scoring change lands
          here — not every visual tweak, just the ones that change how a game actually plays.
        </p>
        <ul className="changelog">
          {ENGINE_CHANGELOG.map((c, i) => (
            <li key={i}><span className="cl-date mono">{c.date}</span><span>{c.summary}</span></li>
          ))}
        </ul>
      </Row>
    </>
  );
}

/**
 * The sync code, and somewhere to type a different one.
 *
 * Deliberately not automatic. Syncing a block list is a thing somebody chooses to do, and doing
 * it silently in the background would mean a list leaving this device without being asked.
 */
function SyncCode() {
  const [code, setCode] = useState(() => syncCode());
  const [entry, setEntry] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  async function run(fn: (base: string) => Promise<boolean>, okText: string) {
    setStatus('Working…');
    const host = await hostInfo();
    if (!host.up) { setStatus('No host is running, so there is nowhere to sync to.'); return; }
    setStatus(await fn(host.base) ? okText : 'That did not work.');
  }

  return (
    <div className="sync">
      <div className="sync-code" aria-label={`Your sync code is ${code.split('').join(' ')}`}>{code}</div>
      <div className="sync-actions">
        <button className="ghost sm" onClick={() => void run(pushSafety, 'Sent.')}>Upload mine</button>
        <button className="ghost sm" onClick={() => void run(pullSafety, 'Merged in.')}>Fetch</button>
      </div>
      <div className="sync-entry">
        <input className="pref-text" placeholder="Use another device's code" value={entry}
          aria-label="Another device's sync code"
          onChange={(e) => setEntry(e.target.value.toUpperCase())} />
        <button className="ghost sm" disabled={entry.trim().length < 8}
          onClick={() => { adoptSyncCode(entry); setCode(entry.trim().toUpperCase()); setEntry(''); setStatus('Code changed. Fetch to pull that list in.'); }}>
          Use it
        </button>
      </div>
      {status && <p className="muted sync-status" role="status">{status}</p>}
    </div>
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
  const [imgError, setImgError] = useState<string | null>(null);
  return (
    <div className="designer">
      <div className="dz-preview">
        <span className="sw-back big mine" data-cbpattern={value.pattern}
          style={{
            ['--cb-ink' as string]: value.ink,
            ['--cb-ground' as string]: value.ground,
            ['--cb-image' as string]: value.image ? `url("${value.image}")` : 'none',
          }}>
          {value.image ? '' : value.emblem}
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
              <button key={g || 'none'} className={value.emblem === g ? 'on' : ''}
                aria-label={g ? `Emblem ${g}` : undefined} aria-pressed={value.emblem === g}
                onClick={() => patch({ emblem: g })}>{g || 'None'}</button>
            ))}
          </div>
        </div>
        <div className="field"><span>Picture</span>
          <div className="dz-image">
            <label className="ghost sm file-btn">
              {value.image ? 'Replace' : 'Upload'}
              <input type="file" accept="image/*" onChange={(e) => readBackImage(e, patch, setImgError)} />
            </label>
            {value.image && (
              <button className="ghost sm" onClick={() => patch({ image: null })}>Remove</button>
            )}
            {imgError ? <em className="warn-text" role="alert">{imgError}</em> : <em className="muted">A picture covers the pattern.</em>}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Reads a chosen picture into the setting as a data URI. Everything here rides in localStorage
 * next to the rest of the preferences, so an oversized file is refused rather than silently
 * blowing the whole store away.
 */
function readBackImage(
  e: React.ChangeEvent<HTMLInputElement>,
  patch: (p: Partial<CustomBack>) => void,
  onError: (message: string | null) => void,
): void {
  const file = e.target.files?.[0];
  e.target.value = '';           // so choosing the same file twice still fires
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const data = typeof reader.result === 'string' ? reader.result : '';
    if (!data) return;
    if (data.length > MAX_BACK_IMAGE) {
      // A blocking alert() was the only place in Settings that didn't use the panel's own
      // inline status styling — shown in place instead, the same as every other error here.
      onError('That picture is too big to keep. Try one under about 300 KB.');
      return;
    }
    onError(null);
    patch({ image: data });
  };
  reader.readAsDataURL(file);
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
