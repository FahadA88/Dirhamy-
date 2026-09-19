import { useSettings } from '../settings/SettingsContext';

// Chips, drawn.
//
// A betting game's money was three text pills — "Pot · 240", "Your chips · 1180" — which is a
// spreadsheet of the one thing at the table that is supposed to be physical. Chips are what a
// betting game looks like; a number is what its log looks like.
//
// The colours are the casino set (white 1, red 5, green 25, black 100, purple 500) and they do
// NOT follow the accent, for the same reason a printed deck does not: they are a convention a
// player already reads, and re-tinting them to whatever hue somebody picked in Settings would
// throw away the only thing that makes a stack legible at a glance.

interface Denom { value: number; ink: string; edge: string; ring: string }

const DENOMS: Denom[] = [
  { value: 500, ink: '#4b2d7a', edge: '#33194f', ring: '#d6c7ee' },
  { value: 100, ink: '#232427', edge: '#0f1012', ring: '#cfd2d8' },
  { value: 25,  ink: '#1c7a45', edge: '#12522e', ring: '#cfeadb' },
  { value: 5,   ink: '#b0302f', edge: '#7d1e1d', ring: '#f3d3d2' },
  { value: 1,   ink: '#e7e4dc', edge: '#b9b4a8', ring: '#7c766a' },
];

/** Break an amount into stacks, largest first. Capped so a big pot is a handful of tall stacks
 *  rather than four hundred discs: past the cap the stack keeps its height and the number
 *  beside it carries the rest, which is exactly what a real tray does. */
function stacksFor(amount: number, maxPerStack = 5): { denom: Denom; count: number }[] {
  const out: { denom: Denom; count: number }[] = [];
  let left = Math.max(0, Math.floor(amount));
  for (const denom of DENOMS) {
    if (left < denom.value) continue;
    const n = Math.floor(left / denom.value);
    left -= n * denom.value;
    out.push({ denom, count: Math.min(n, maxPerStack) });
    if (out.length === 3) break;   // three stacks reads as money; six reads as noise
  }
  return out;
}

export function ChipStack({ amount, label }: { amount: number; label: string }) {
  const { settings } = useSettings();
  const n = Math.max(0, Math.floor(amount));

  if (settings.chipStyle === 'text' || n === 0) {
    return <span className="chip">{label} · {n}</span>;
  }

  const stacks = stacksFor(n);
  return (
    <span className={`chip chipstack s-${settings.chipStyle}`}>
      <span className="cs-piles" aria-hidden="true">
        {stacks.map(({ denom, count }) => (
          <span key={denom.value} className="cs-pile" style={{ ['--cs-n' as string]: String(count - 1) }}>
            {Array.from({ length: count }, (_, i) => (
              <i key={i} className="cs-chip"
                style={{
                  ['--chip-ink' as string]: denom.ink,
                  ['--chip-edge' as string]: denom.edge,
                  ['--chip-ring' as string]: denom.ring,
                  ['--chip-i' as string]: String(i),
                }} />
            ))}
          </span>
        ))}
      </span>
      <span className="cs-text">{label} · {n}</span>
    </span>
  );
}
