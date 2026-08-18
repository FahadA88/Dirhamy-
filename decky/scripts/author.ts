// The authoring pipeline, without a model.
//
// A stub provider stands in for Claude and returns scripted replies — good JSON, bad JSON,
// invented ingredients, a game that never ends. What is under test is not the model; it is
// everything that happens after it, which is the part that decides whether an AI-written game
// is safe to hand somebody.

import { authorGame, extractJson, parseAuthored, compose, AuthorProvider } from '../src/authoring/author';
import { authorSpec } from '../src/authoring/spec';
import { simulate } from '../src/engine/simulator';
import { validate } from '../src/engine/validator';

let failed = false;
const ok = (label: string, cond: boolean, extra?: unknown) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : `  ${JSON.stringify(extra ?? '')}`}`);
  if (!cond) failed = true;
};

/** Replies in order, so a test can make the model fail and then recover. */
function scripted(replies: string[]): AuthorProvider {
  let i = 0;
  return { name: 'scripted', async complete() { return replies[Math.min(i++, replies.length - 1)]; } };
}

const CRAZY_EIGHTS = JSON.stringify({
  name: 'Eights', description: 'Match the pile. Eights are wild.',
  knobs: { family: 'shedding', handSize: 7, matchSuit: true, matchRank: true, wildRanks: ['8'], canAlwaysDraw: true, minPlayers: 2, maxPlayers: 4 },
  rules: [], notes: [],
});

const ENDLESS = JSON.stringify({
  name: 'Endless', description: 'Every card you play makes you draw two.',
  knobs: { family: 'shedding', handSize: 7, matchSuit: true, matchRank: true, reshuffleWhenEmpty: true },
  rules: [{ id: 'r1', name: 'Endless', when: 'cardPlayed', condId: 'always', condParams: {},
    effects: [{ specId: 'draw', params: { who: '$me', count: 2 } }] }],
  notes: [],
});

console.log('\nThe briefing is generated from the code, not typed out');
{
  const spec = authorSpec();
  ok('every condition id appears', ['always', 'suitIs', 'rankIs', 'handSize', 'holds'].every((id) => spec.includes(`"${id}"`)));
  ok('every effect id appears', ['addScore', 'announce', 'skipNext', 'reveal', 'endHand'].every((id) => spec.includes(`"${id}"`)));
  ok('every hook appears', ['cardPlayed', 'turnStart', 'trickWon', 'drawPileEmpty'].every((h) => spec.includes(`"${h}"`)));
  ok('all seven families are described', ['shedding', 'trick', 'climb', 'fish', 'rummy', 'war', 'solitaire'].every((f) => spec.includes(`"${f}"`)));
}

console.log('\nReading a reply');
{
  ok('plain JSON', (extractJson('{"a":1}') as { a: number }).a === 1);
  ok('fenced JSON', (extractJson('```json\n{"a":2}\n```') as { a: number }).a === 2);
  ok('JSON after a sentence', (extractJson('Here you go:\n{"a":3}') as { a: number }).a === 3);
  let threw = false;
  try { extractJson('no object here'); } catch { threw = true; }
  ok('prose with no object is an error', threw);
}

console.log('\nAnything invented is caught, not passed through');
{
  const { authored, problems } = parseAuthored({
    name: 'Bad', knobs: { family: 'shedding', teleport: true },
    rules: [
      { name: 'made up', when: 'cardPlayed', condId: 'summonDragon', effects: [{ specId: 'addScore' }] },
      { name: 'bad hook', when: 'onTuesday', condId: 'always', effects: [{ specId: 'addScore' }] },
      { name: 'bad effect', when: 'cardPlayed', condId: 'always', effects: [{ specId: 'explode' }] },
      { name: 'fine', when: 'cardPlayed', condId: 'rankIs', condParams: { rank: '8' }, effects: [{ specId: 'announce', params: { text: 'hi' } }] },
    ],
  });
  ok('an invented knob is reported', problems.some((p) => p.includes('teleport')), problems);
  ok('an invented condition is reported', problems.some((p) => p.includes('summonDragon')), problems);
  ok('an invented hook is reported', problems.some((p) => p.includes('onTuesday')), problems);
  ok('an invented effect is reported', problems.some((p) => p.includes('explode')), problems);
  ok('the one good rule survives', authored.rules.length === 1 && authored.rules[0].name === 'fine');
  ok('the invented knob is not in the knobs', !('teleport' in authored.knobs));
}

console.log('\nA good description becomes a playable game');
{
  const r = await authorGame('Crazy Eights for three', scripted([CRAZY_EIGHTS]));
  ok('it succeeded', r.ok, r.error);
  ok('a definition came back', !!r.definition);
  ok('the definition validates', r.definition ? validate(r.definition).ok : false);
  ok('it was actually played', (r.report?.games ?? 0) > 0);
  ok('every game finished', r.report ? r.report.terminated === r.report.games : false, r.report);
  ok('and somebody won', r.report?.winnable === true);
  ok('the stages are on the record', r.steps.some((s) => s.stage === 'playtesting') && r.steps.some((s) => s.stage === 'done'));
}

console.log('\nBad JSON is sent back to be fixed, not shown to the user');
{
  const r = await authorGame('Eights', scripted(['I would love to help!', CRAZY_EIGHTS]));
  ok('it recovered on the second try', r.ok, r.error);
  ok('the repair is on the record', r.steps.some((s) => s.stage === 'repairing'));
}

console.log('\nA game that never ends is rejected, not shipped');
{
  // Every card you play makes you draw two, so a hand only ever grows and nobody can go out.
  // The engine always offers a draw, which makes most "broken" games limp to a finish anyway —
  // it takes a rule actively working against the win condition to genuinely stall.
  const r = await authorGame('a game that cannot end', scripted([ENDLESS]));
  ok('it did not ship', !r.ok);
  ok('and the reason is the playtest', /never ended/.test(r.error ?? ''), r.error);
  ok('no definition is handed back', !r.definition);
}

console.log('\nThe model recovers from its own broken game');
{
  const r = await authorGame('Eights', scripted([ENDLESS, CRAZY_EIGHTS]));
  ok('the second attempt is accepted', r.ok, r.error);
}

console.log('\nWhat the model could not express is kept and shown');
{
  const withNotes = JSON.stringify({
    name: 'Bluff', description: 'Claim a rank, play face down, get challenged.',
    knobs: { family: 'shedding', handSize: 7, matchSuit: true, matchRank: true, canAlwaysDraw: true },
    rules: [],
    notes: ['There is no way to claim a rank or to challenge a claim, so this is a plain matching game.'],
  });
  const r = await authorGame('Bluff', scripted([withNotes]));
  ok('the game still came back', r.ok, r.error);
  ok('the honest note survived', r.notes.some((n) => n.includes('challenge')), r.notes);
}

console.log('\nA model that cannot be reached fails cleanly');
{
  const dead: AuthorProvider = { name: 'dead', async complete() { throw new Error('no model configured'); } };
  const r = await authorGame('anything', dead);
  ok('it reports the reason', !r.ok && (r.error ?? '').includes('no model configured'), r.error);
  ok('and does not pretend to have a game', !r.definition);
}

console.log('\nA composed game is a real game');
{
  const { authored } = parseAuthored(JSON.parse(CRAZY_EIGHTS));
  const { def } = compose(authored);
  const rep = simulate(def, 3, 60);
  ok('three-handed, every game ends', rep.terminated === rep.games, rep);
  ok('no seat runs away with it',
    rep.winRateBySeat.every((w) => w > 0.15 && w < 0.6), rep.winRateBySeat);
}

console.log(failed ? '\nAUTHOR: FAILED' : '\nAUTHOR: the pipeline refuses anything it cannot play');
process.exit(failed ? 1 : 0);
