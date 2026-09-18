// What each shipped game ACTUALLY implements, read out of its definition.
//
// An accuracy audit that works from memory of what the code does is an audit of the memory.
// This prints the rule-bearing fields of every game in the catalog so a divergence table can be
// written against the code rather than against an impression of it.
import { catalog } from '../src/games/catalog';
import { GameDefinition } from '../src/engine/types';

const only = process.argv[2]?.toLowerCase();

function deckOf(d: GameDefinition): string {
  const k = d.deck;
  const bits: string[] = [k.base];
  if (k.deckCount && k.deckCount > 1) bits.push(`x${k.deckCount}`);
  if (k.includeJokers) bits.push(`+${k.jokerCount ?? 2} joker`);
  if (k.excludeRanks?.length) bits.push(`no ${k.excludeRanks.join('')}`);
  if ((k as Record<string, unknown>).excludeSuits) bits.push(`suits only ${JSON.stringify((k as Record<string, unknown>).excludeSuits)} removed`);
  if (k.rankOrder) bits.push(`order ${k.rankOrder.join('')}`);
  if (k.tags && Object.keys(k.tags).length) {
    for (const [t, v] of Object.entries(k.tags)) bits.push(`${t}=${Array.isArray(v) ? v.join('') : JSON.stringify(v)}`);
  }
  return bits.join(' ');
}

function dealOf(d: GameDefinition): string {
  const step = (d.setup ?? []).find((s) => s.op === 'deal' || s.op === 'dealAll') as Record<string, unknown> | undefined;
  if (!step) return '—';
  if (step.op === 'dealAll') return 'the whole pack';
  const bits = [`${step.countPerPlayer}`];
  if (step.countByPlayers) bits.push(`by seats ${JSON.stringify(step.countByPlayers)}`);
  const grow = Number(step.growPerHand ?? 0);
  if (grow) bits.push(`${grow > 0 ? '+' : ''}${grow}/hand`);
  const others = (d.setup ?? []).filter((s) => s.op === 'move' || (s.op === 'deal' && s !== step));
  for (const o of others as Record<string, unknown>[]) bits.push(`${o.count ?? o.countPerPlayer} → ${o.to}`);
  return bits.join(', ');
}

function scoringOf(d: GameDefinition): string {
  const s = d.scoring;
  const bits = [`${s.winner}`];
  if (s.target != null) bits.push(`to ${s.target}`);
  if (s.handsCap) bits.push(`${s.handsCap} hands max`);
  if (s.bust != null) bits.push(`bust at ${s.bust}`);
  const cp = s.cardPoints ?? {};
  const priced = Object.entries(cp).filter(([, v]) => v !== 0);
  if (priced.length) bits.push(`cards ${priced.map(([k, v]) => `${k}=${v}`).join(' ')}`);
  return bits.join(', ');
}

function familyOf(d: GameDefinition): [string, string] {
  const FAMS = ['trick', 'rummy', 'climb', 'fish', 'war', 'solitaire', 'bluff', 'reflex',
    'poker', 'pit', 'kent', 'set', 'maid', 'layout', 'swap'] as const;
  for (const f of FAMS) {
    const cfg = (d as unknown as Record<string, unknown>)[f];
    if (cfg) return [f, JSON.stringify(cfg)];
  }
  return ['shedding', JSON.stringify((d as unknown as Record<string, unknown>).shedding ?? {})];
}

let n = 0;
for (const g of catalog) {
  if (only && !g.meta.name.toLowerCase().includes(only)) continue;
  n++;
  const [fam, cfg] = familyOf(g);
  console.log(`\n### ${g.meta.name}  [${fam}]  ${g.meta.players.min}-${g.meta.players.max}${g.meta.players.step && g.meta.players.step > 1 ? ` step ${g.meta.players.step}` : ''}`);
  console.log(`  deck:    ${deckOf(g)}`);
  console.log(`  deal:    ${dealOf(g)}`);
  console.log(`  scoring: ${scoringOf(g)}`);
  console.log(`  rules:   ${cfg}`);
  const pass = (g as unknown as Record<string, unknown>).handPass as Record<string, unknown> | undefined;
  const tf = g.turnFlow as unknown as Record<string, unknown>;
  const flow = [`${tf.order}`, `starts ${tf.startPlayer}`];
  if (pass) flow.push(`pass ${pass.count} ${Array.isArray(pass.rotation) ? (pass.rotation as string[]).join('/') : pass.direction}`);
  console.log(`  flow:    ${flow.join(', ')}`);
  if (g.rules?.length) console.log(`  custom:  ${g.rules.length} rule(s): ${g.rules.map((r) => r.id).join(', ')}`);
  // Anything else at the top level that carries a rule, so nothing hides from the audit.
  const KNOWN = new Set(['schemaVersion', 'meta', 'deck', 'zones', 'setup', 'turnFlow', 'actions',
    'triggers', 'endConditions', 'scoring', 'rules', 'handPass',
    'trick', 'rummy', 'climb', 'fish', 'war', 'solitaire', 'bluff', 'reflex', 'poker', 'pit',
    'kent', 'set', 'maid', 'layout', 'swap', 'shedding']);
  const extra = Object.entries(g as unknown as Record<string, unknown>)
    .filter(([k, v]) => !KNOWN.has(k) && v !== undefined);
  if (extra.length) console.log(`  other:   ${extra.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('  ')}`);
}
console.log(`\n${n} game(s).`);
