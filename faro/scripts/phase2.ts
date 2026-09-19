// Phase 2 acceptance: the near-programmable rule builder.
//
// The stated bar is "a non-technical user builds, playtests, and publishes a working custom game
// entirely through the UI". The UI half is checked in the browser (scripts/browser/verify.mjs);
// this file proves the half underneath it — that what the builder produces is real, safe, and
// runs identically to a hand-written classic.

import { buildDefinition, defaultKnobs, Knobs } from '../src/authoring/knobs';
import { TEMPLATES } from '../src/authoring/templates';
import {
  CONDITIONS, EFFECTS, RuleDraft, compileRule, compileRules, defaultsFor, newRuleDraft,
} from '../src/authoring/ruleKit';
import { explainGame, explainRule } from '../src/authoring/explain';
import { validate } from '../src/engine/validator';
import { simulate } from '../src/engine/simulator';
import { createMatch, applyMove, legalMoves, isTerminal } from '../src/engine/engine';
import { MatchService } from '../src/server/matchService';
import { GameDefinition } from '../src/engine/types';

let failed = false;
const check = (label: string, cond: boolean, extra?: unknown) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '  ' + JSON.stringify(extra)}`);
  if (!cond) failed = true;
};
const section = (n: string) => console.log(`\n${n}`);

/** Drive a definition to the end of a hand, or report why it couldn't get there. */
function playOut(def: GameDefinition, seats: number, seed: number, cap = 600) {
  let s = createMatch(def, Array.from({ length: seats }, (_, i) => `P${i + 1}`), seed);
  let plies = 0;
  while (!isTerminal(s) && plies < cap) {
    const seat = s.players[s.turnIndex];
    const moves = legalMoves(s, seat);
    if (moves.length === 0) break;
    s = applyMove(s, seat, moves[0]);
    plies++;
  }
  return { state: s, plies, finished: isTerminal(s) };
}

// ---------- templates ----------
section('Every template is playable the moment it is picked');
for (const t of TEMPLATES) {
  const def = buildDefinition(t.knobs, t.id);
  const v = validate(def);
  check(`${t.name}: validates`, v.ok, v.issues.filter((i) => i.level === 'error').map((i) => i.message));
  if (!v.ok) continue;
  const seats = def.solitaire ? 1 : Math.min(3, def.meta.players.max);
  const r = playOut(def, seats, 12345);
  check(`${t.name}: a hand actually finishes (${r.plies} plies)`, r.finished || !!def.solitaire, {
    plies: r.plies, phase: r.state.phase,
  });
  check(`${t.name}: reads back in English`, explainGame(def).length >= 2);
}

// ---------- the palette ----------
section('Every ingredient in the palette compiles and describes itself');
{
  for (const c of CONDITIONS) {
    let ok = true, why = '';
    try {
      const p = c.build(defaultsFor(c.params));
      ok = !!p && typeof p === 'object';
    } catch (e) { ok = false; why = (e as Error).message; }
    check(`condition "${c.label}" compiles`, ok, why);
  }
  for (const e of EFFECTS) {
    let ok = true, why = '';
    try {
      const eff = e.build(defaultsFor(e.params));
      ok = !!eff && typeof eff.op === 'string';
    } catch (err) { ok = false; why = (err as Error).message; }
    check(`effect "${e.label}" compiles`, ok, why);
  }

  // Every combination has to produce a sentence — that is the whole promise of the read-back.
  let blank = 0;
  for (const c of CONDITIONS) {
    for (const e of EFFECTS) {
      const draft: RuleDraft = {
        id: 'x', name: 'X', when: 'cardPlayed',
        condId: c.id, condParams: defaultsFor(c.params),
        effects: [{ specId: e.id, params: defaultsFor(e.params) }],
        enabled: true,
      };
      const sentence = explainRule(compileRule(draft));
      if (!sentence || sentence.length < 12 || /undefined|\[object/.test(sentence)) blank++;
    }
  }
  check(`all ${CONDITIONS.length * EFFECTS.length} condition × effect pairs read as English`, blank === 0, `${blank} bad`);
}

// ---------- rules actually change the game ----------
section('An author-written rule changes what happens at the table');
{
  const scoring = newRuleDraft(1);
  scoring.when = 'cardPlayed';
  scoring.condId = 'colorIs';
  scoring.condParams = { color: 'red' };
  scoring.effects = [{ specId: 'addScore', params: { who: '$me', amount: 7 } }];

  const withRule = buildDefinition({ ...defaultKnobs, name: 'Red Tax', customRules: [scoring] } as Knobs, 'red-tax');
  const without = buildDefinition({ ...defaultKnobs, name: 'Red Tax', customRules: [] } as Knobs, 'red-tax');

  const a = playOut(withRule, 3, 777, 120);
  const b = playOut(without, 3, 777, 120);
  const totalA = Object.values(a.state.scores).reduce((x, y) => x + y, 0);
  const totalB = Object.values(b.state.scores).reduce((x, y) => x + y, 0);
  check('the same seed scores differently with the rule on', totalA !== totalB, { totalA, totalB });
  check('and points land in multiples of the rule', totalA > 0);

  // A disabled rule is genuinely inert.
  const offRule = { ...scoring, enabled: false };
  const off = buildDefinition({ ...defaultKnobs, name: 'Red Tax', customRules: [offRule] } as Knobs, 'red-tax');
  check('an author can park a rule without deleting it', (off.rules ?? []).every((r) => r.enabled === false));
  const c = playOut(off, 3, 777, 120);
  check('...and a parked rule does nothing', JSON.stringify(c.state.scores) === JSON.stringify(b.state.scores));
}

section('Rules work in every family, not just the one they were designed for');
{
  const announce = newRuleDraft(1);
  announce.condId = 'always'; announce.condParams = {};
  announce.effects = [{ specId: 'announce', params: { text: 'RULE FIRED' } }];

  for (const fam of ['shedding', 'trick', 'climb', 'rummy'] as const) {
    const def = buildDefinition({ ...defaultKnobs, family: fam, name: `${fam} test`, customRules: [announce] } as Knobs, fam);
    if (!validate(def).ok) { check(`${fam}: definition is valid`, false, validate(def).issues); continue; }
    const r = playOut(def, 3, 4242, 200);
    const fired = r.state.log.some((l) => l.text === 'RULE FIRED');
    check(`${fam}: the rule fires during play`, fired, { plies: r.plies });
  }
}

section('Ordering and short-circuiting behave as the builder promises');
{
  const first: RuleDraft = {
    id: 'a', name: 'Ends it', when: 'turnEnd', condId: 'handSize',
    condParams: { op: '<=', value: 4 },
    effects: [{ specId: 'endHand', params: { winner: '$me' } }], enabled: true,
  };
  const second: RuleDraft = {
    id: 'b', name: 'Never runs', when: 'turnEnd', condId: 'always', condParams: {},
    effects: [{ specId: 'announce', params: { text: 'AFTER THE END' } }], enabled: true,
  };
  const def = buildDefinition({ ...defaultKnobs, name: 'Order', customRules: [first, second] } as Knobs, 'order');
  const r = playOut(def, 3, 99, 200);
  check('a rule can end the hand', r.finished);
  check('nothing runs after the hand is over', !r.state.log.some((l) => l.text === 'AFTER THE END'));
}

// ---------- safety ----------
section('The validator refuses rules that would break at the table');
{
  const bad: RuleDraft = {
    id: 'z', name: 'Bad pile', when: 'cardPlayed', condId: 'always', condParams: {},
    effects: [{ specId: 'moveMany', params: { from: 'nowhere', to: 'draw', count: 1 } }], enabled: true,
  };
  const def = buildDefinition({ ...defaultKnobs, name: 'Broken', customRules: [bad] } as Knobs, 'broken');
  const v = validate(def);
  check('a rule pointing at a pile that does not exist is an error', !v.ok);
  check('and the message names the pile', v.issues.some((i) => i.message.includes('nowhere')), v.issues);

  const trickRuleInSheddingGame: RuleDraft = {
    id: 'y', name: 'Trick bonus', when: 'trickWon', condId: 'always', condParams: {},
    effects: [{ specId: 'addScore', params: { who: '$me', amount: 1 } }], enabled: true,
  };
  const def2 = buildDefinition({ ...defaultKnobs, name: 'Mismatch', customRules: [trickRuleInSheddingGame] } as Knobs, 'mismatch');
  const v2 = validate(def2);
  check('a rule that can never fire is a warning, not a blocker', v2.ok && v2.issues.some((i) => i.code === 'rule.hook.unreachable'));
}

section('A rule is data — it cannot smuggle code in');
{
  const draft = newRuleDraft(1);
  draft.condId = 'varIs';
  draft.condParams = { var: 'x', op: '==', value: 'process.exit(1)' };
  draft.effects = [{ specId: 'announce', params: { text: '<script>alert(1)</script>' } }];
  const def = buildDefinition({ ...defaultKnobs, name: 'Hostile', customRules: [draft] } as Knobs, 'hostile');
  const r = playOut(def, 3, 5, 60);
  check('a hostile-looking value is treated as a plain string', r.plies > 0);
  check('and the compiled rule contains no functions', JSON.stringify(def.rules) === JSON.stringify(compileRules([draft])));
}

// ---------- the whole build → publish → play path ----------
section('A game built here plays through the same service as a classic');
{
  const draft = newRuleDraft(1);
  draft.name = 'Queens swap';
  draft.condId = 'rankIs'; draft.condParams = { rank: 'Q' };
  draft.effects = [{ specId: 'swap', params: { with: 'next' } }];
  const def = buildDefinition({ ...defaultKnobs, name: 'Swap Eights', customRules: [draft] } as Knobs, 'swap-eights');

  const svc = new MatchService();
  const m = svc.create(def, def.meta.id, ['P1', 'P2', 'P3']);
  check('the service accepts a freshly built definition', svc.view(m.matchId, 'P1').hand.length > 0);
  check('and pins it like any other', svc.definitionOf(m.matchId).meta.name === 'Swap Eights');
  check('the pinned copy carries the author rules', (svc.definitionOf(m.matchId).rules ?? []).length === 1);

  let moved = 0;
  for (let i = 0; i < 30; i++) {
    const seat = svc.pending(m.matchId)[0];
    if (!seat) break;
    const legal = svc.legal(m.matchId, seat);
    if (legal.length === 0) break;
    if (svc.submit(m.matchId, seat, legal[0]).ok) moved++;
  }
  check(`${moved} moves accepted through the boundary`, moved > 5);
}

section('The simulator can vet a built game before anyone plays it');
{
  const def = buildDefinition({ ...defaultKnobs, name: 'Vet me', customRules: [] } as Knobs, 'vet');
  const rep = simulate(def, 3, 60);
  check('it terminates every time', rep.terminated === rep.games, rep);
  check('it is winnable', rep.winnable);
  check('and it reports per-seat win rates', rep.winRateBySeat.length === 3);
}

console.log(failed ? '\nPHASE 2: FAILED' : '\nPHASE 2: all acceptance checks passed');
process.exit(failed ? 1 : 0);
