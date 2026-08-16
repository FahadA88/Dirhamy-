import { useSettings } from '../settings/SettingsContext';
import { useDismissable } from './useEscape';
import { ACCENTS, AccentId, FELTS, Settings, TableFelt } from '../settings/settings';

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
          <Seg label="Card back" value={settings.cardBack} onChange={(v) => set('cardBack', v)}
            options={[['stripes', 'Stripes'], ['grid', 'Grid'], ['dots', 'Dots'], ['solid', 'Solid']]} />
          <Seg label="Card size" value={settings.cardSize} onChange={(v) => set('cardSize', v)}
            options={[['s', 'Small'], ['m', 'Medium'], ['l', 'Large']]} />
          <Seg label="Suit colors" value={settings.fourColor ? 'four' : 'classic'} onChange={(v) => set('fourColor', v === 'four')}
            options={[['classic', 'Classic (2)'], ['four', 'Four-color']]} />
          <Seg label="Table surface" value={settings.surface} onChange={(v) => set('surface', v)}
            options={[['soft', 'Soft'], ['glass', 'Glass'], ['plain', 'Plain']]} />
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
