// Worklist: "a digital scoreboard look for the trick readout — no digital font asset within the
// self-hosted-font policy." This app's own font policy (see styles.css) is @font-face, self-
// hosted: Outfit and Bodoni Moda, nothing pulled from a type foundry's CDN. A seven-segment
// digital face is exactly the kind of font a foundry sells and this app has never bought one of
// — so rather than reach outside that policy, or fake it with a monospace font that isn't
// actually seven-segment, this draws the segments themselves: seven bars per digit, lit or not,
// the same construction a real LCD or LED readout uses. No font, no asset, no license — just
// CSS, the same material every other card mark and table dressing in this app is made of.

const SEGMENTS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc',
  '5': 'afgcd', '6': 'afgecd', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  '-': 'g',
};
const SEG_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;

function Digit({ ch }: { ch: string }) {
  const lit = SEGMENTS[ch] ?? '';
  return (
    <span className="sevenseg" aria-hidden="true">
      {SEG_IDS.map((s) => <i key={s} className={`seg seg-${s} ${lit.includes(s) ? 'on' : ''}`} />)}
    </span>
  );
}

/** A number (or a short numeric string, "12/5") drawn as seven-segment digits. Anything that
 *  isn't a digit or a dash — the slash in "12/5", say — passes through as ordinary text, so a
 *  caller can hand this a whole readout rather than splitting it into pieces first. */
export function SevenSegmentNumber({ value, label }: { value: number | string; label?: string }) {
  const str = String(value);
  return (
    <span className="sevenseg-group" role="img" aria-label={label ?? str}>
      {str.split('').map((ch, i) => (/[0-9-]/.test(ch) ? <Digit key={i} ch={ch} /> : <span key={i} className="sevenseg-punct">{ch}</span>))}
    </span>
  );
}
