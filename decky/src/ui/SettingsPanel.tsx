import { useSettings } from '../settings/SettingsContext';
import { useDismissable } from './useEscape';
import {
  ACCENTS, AccentId, BACKS, CardBack, CardFace, CustomBack, FACES, FELTS, Settings, TableFelt,
} from '../settings/settings';

const DEFAULT_CUSTOM_BACK: CustomBack = { pattern: 'lattice', ink: '#d6af5c', ground: '#123b28', emblem: '♠' };

const PATTERNS: [CustomBack['pattern'], string][] = [
  ['lattice', 'Lattice'], ['stripe', 'Stripe'], ['dots', 'Dots'],
  ['checker', 'Checker'], ['wave', 'Wave'], ['plain', 'Plain'],
];
const EMBLEMS = ['', '♠', '♥', '♦', '♣', '★', '✦', '❖', '⚜'];

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

// The customization drawer: appearance + gameplay, applied live and persisted.
export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, set, reset } = useSettings();
  const ref = useDismissable(open, onClose);
  if (!open) return null;

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer glass" ref={ref} role="dialog" aria-modal="true" aria-label="Customize"
        onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2>Customize</h2>
          <div className="drawer-head-actions">
            <button className="ghost sm" onClick={reset}>Reset all</button>
            <button className="ghost sm" onClick={onClose}>Done</button>
          </div>
        </div>

        <Group title="Theme">
          <Seg label="Mode" value={settings.theme} onChange={(v) => set('theme', v)}
            options={[['light', 'Light'], ['dark', 'Dark'], ['system', 'System']]} />
          <Field label="Accent color">
            <div className="swatches">
              {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
                <button key={id} title={ACCENTS[id].name}
                  className={`swatch ${settings.accent === id ? 'on' : ''}`}
                  style={{ background: `linear-gradient(135deg, ${ACCENTS[id].emerald}, ${ACCENTS[id].green})` }}
                  onClick={() => set('accent', id)} />
              ))}
            </div>
          </Field>
          <Seg label="Text size" value={settings.textSize} onChange={(v) => set('textSize', v)}
            options={[['s', 'Small'], ['m', 'Default'], ['l', 'Large'], ['xl', 'Largest']]} />
          <Toggle label="Easier-to-read text" on={settings.legibleText} onChange={(v) => set('legibleText', v)} />
          <p className="set-note">Heavier strokes, more space between letters, no italics.</p>
          <Seg label="Interface density" value={settings.density} onChange={(v) => set('density', v)}
            options={[['comfortable', 'Comfortable'], ['compact', 'Compact']]} />
        </Group>

        <Group title="The table">
          <div className="felt-pick">
            {(Object.keys(FELTS) as TableFelt[]).map((id) => (
              <button key={id}
                className={`felt-opt ${settings.tableFelt === id ? 'on' : ''}`}
                onClick={() => set('tableFelt', id)}
                aria-pressed={settings.tableFelt === id}>
                <span className="felt-swatch" data-felt={id}>
                  <span className="felt" />
                  {id === 'mahogany' && <><i className="well" style={{ left: '18%' }} /><i className="well" style={{ left: '50%' }} /><i className="well" style={{ left: '82%' }} /></>}
                  {id === 'vegas' && <em className="vg-mini" />}
                  {id === 'parlour' && <em className="pl-mini" />}
                  {id === 'midnight' && <em className="mn-mini" />}
                </span>
                <span className="felt-name">{FELTS[id].name}</span>
                <span className="felt-blurb">{FELTS[id].blurb}</span>
              </button>
            ))}
          </div>
        </Group>

        <Group title="Cards">
          <div className="field"><span>Card face</span>
            <div className="swatches faces">
              {(Object.keys(FACES) as CardFace[]).map((f) => (
                <button key={f} className={`swatch ${settings.cardFace === f ? 'on' : ''}`}
                  title={FACES[f].note} aria-pressed={settings.cardFace === f}
                  onClick={() => set('cardFace', f)}>
                  <span className={`sw-card card face f-${f} ${f === 'block' || f === 'neon' ? 'black' : 'red'}`}>
                    <span className="corner tl">A<span>♥</span></span>
                  </span>
                  <em>{FACES[f].name}</em>
                </button>
              ))}
            </div>
          </div>
          <p className="set-note">{FACES[settings.cardFace].note}</p>

          <div className="field"><span>Card back</span>
            <div className="swatches backs">
              {(Object.keys(BACKS) as Exclude<CardBack, 'custom'>[]).map((bk) => (
                <button key={bk} className={`swatch ${settings.cardBack === bk ? 'on' : ''}`}
                  title={BACKS[bk].name} aria-pressed={settings.cardBack === bk}
                  onClick={() => set('cardBack', bk)}>
                  <span className="sw-back" data-back={bk}>{bk === 'monogram' ? '♠' : ''}</span>
                  <em>{BACKS[bk].name}</em>
                </button>
              ))}
              <button className={`swatch ${settings.cardBack === 'custom' ? 'on' : ''}`}
                aria-pressed={settings.cardBack === 'custom'}
                onClick={() => { if (!settings.customBack) set('customBack', DEFAULT_CUSTOM_BACK); set('cardBack', 'custom'); }}>
                <span className="sw-back mine" data-cbpattern={settings.customBack?.pattern}
                  style={settings.customBack ? { ['--cb-ink' as string]: settings.customBack.ink, ['--cb-ground' as string]: settings.customBack.ground } : undefined}>
                  {settings.customBack?.emblem || '+'}
                </span>
                <em>Yours</em>
              </button>
            </div>
          </div>
          {settings.cardBack === 'custom' && (
            <BackDesigner value={settings.customBack ?? DEFAULT_CUSTOM_BACK} onChange={(v) => set('customBack', v)} />
          )}

          <Seg label="Card size" value={settings.cardSize} onChange={(v) => set('cardSize', v)}
            options={[['s', 'Small'], ['m', 'Medium'], ['l', 'Large']]} />
          <div className="field"><span>The table</span>
            <div className="swatches tables">
              {(Object.keys(FELTS) as TableFelt[]).map((t) => (
                <button key={t} className={`swatch wide ${settings.tableFelt === t ? 'on' : ''}`}
                  title={FELTS[t].blurb} aria-pressed={settings.tableFelt === t}
                  onClick={() => set('tableFelt', t)}>
                  <span className="felt-swatch" data-felt={t}><span className="fs-rail"><span className="fs-felt" /></span></span>
                  <em>{FELTS[t].name}</em>
                </button>
              ))}
            </div>
          </div>
          <p className="set-note">{FELTS[settings.tableFelt].blurb}</p>
        </Group>

        <Group title="Motion & background">
          <Toggle label="Ambient 3D background" on={settings.ambient3d} onChange={(v) => set('ambient3d', v)} />
          <Toggle label="Glowing orbs" on={settings.orbs} onChange={(v) => set('orbs', v)} disabled={!settings.ambient3d} />
          <Toggle label="Perspective grid" on={settings.grid} onChange={(v) => set('grid', v)} disabled={!settings.ambient3d} />
          <Toggle label="Floating cards" on={settings.floaties} onChange={(v) => set('floaties', v)} disabled={!settings.ambient3d} />
          <Seg label="Motion" value={settings.motion} onChange={(v) => set('motion', v)}
            options={[['full', 'Full'], ['reduced', 'Reduced']]} />
        </Group>

        <Group title="Gameplay">
          <Field label="Your name">
            <input value={settings.playerName} maxLength={16} onChange={(e) => set('playerName', e.target.value || 'You')} />
          </Field>
          <Seg label="Opponent names" value={settings.botLabels ? 'bot' : 'seat'} onChange={(v) => set('botLabels', v === 'bot')}
            options={[['bot', 'Bot 2, Bot 3…'], ['seat', 'P2, P3…']]} />
          <Field label={`Default seats: ${settings.defaultSeats}`}>
            <input type="range" min={2} max={6} value={settings.defaultSeats} onChange={(e) => set('defaultSeats', +e.target.value)} />
          </Field>
          <Seg label="Bot speed" value={settings.botSpeed} onChange={(v) => set('botSpeed', v)}
            options={[['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']]} />
          <Seg label="Bot difficulty" value={settings.botDiff} onChange={(v) => set('botDiff', v)}
            options={[['random', 'Easy'], ['smart', 'Smart']]} />
        </Group>

        <Group title="Play experience">
          <Seg label="Legal-move highlight" value={settings.highlight} onChange={(v) => set('highlight', v)}
            options={[['glow', 'Glow'], ['outline', 'Outline'], ['lift', 'Lift'], ['off', 'Off']]} />
          <Seg label="Auto-sort hand" value={settings.sort} onChange={(v) => set('sort', v)}
            options={[['off', 'Off'], ['rank', 'By rank'], ['suit', 'By suit']]} />
          <Toggle label="Confirm before playing" on={settings.confirmPlays} onChange={(v) => set('confirmPlays', v)} />
          <Toggle label="Show game log" on={settings.showLog} onChange={(v) => set('showLog', v)} />
          <Toggle label="Sound effects" on={settings.sound} onChange={(v) => set('sound', v)} />
        </Group>
      </aside>
    </div>
  );
}

// ---------- controls ----------

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="cust-group"><div className="cust-group-title">{title}</div>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="cust-field"><span>{label}</span>{children}</div>;
}

function Toggle({ label, on, onChange, disabled }: { label: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={`cust-field row ${disabled ? 'disabled' : ''}`}>
      <span>{label}</span>
      <button className={`toggle ${on ? 'on' : ''}`} disabled={disabled} onClick={() => onChange(!on)} aria-pressed={on}><span className="knob" /></button>
    </div>
  );
}

function Seg<K extends keyof Settings>({ label, value, options, onChange }:
  { label: string; value: Settings[K] | string; options: [string, string][]; onChange: (v: never) => void }) {
  return (
    <div className="cust-field">
      <span>{label}</span>
      <div className="seg wrap">
        {options.map(([val, lbl]) => (
          <button key={val} className={value === val ? 'on' : ''} onClick={() => onChange(val as never)}>{lbl}</button>
        ))}
      </div>
    </div>
  );
}
