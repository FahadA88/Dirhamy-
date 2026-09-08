// Phase 5 acceptance: onboarding, leaderboards, and trust & safety.
//
// The safety checks matter most here, because a filter that looks strict and isn't is worse than
// no filter — it produces confidence rather than safety. So the tests go after the ways people
// actually get things past a substring check.

import { checkName, checkText, report, reports, hasReported, toggleBlock, isBlocked, toggleMute, isMuted } from '../src/social/safety';
import { recordResult, leaderboard, mySummary, currentStreak, allResults } from '../src/social/records';
import { explainGame } from '../src/authoring/explain';
import { catalog } from '../src/games/catalog';
import { MatchService } from '../src/server/matchService';
import { crazyEights } from '../src/games/crazyEights';

let failed = false;
const check = (label: string, cond: boolean, extra?: unknown) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '  ' + JSON.stringify(extra)}`);
  if (!cond) failed = true;
};
const section = (n: string) => console.log(`\n${n}`);

// Stand in for the browser.
const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
  key: (i: number) => Array.from(mem.keys())[i] ?? null,
  get length() { return mem.size; },
};

// ---------- onboarding ----------
section('Every game can explain itself, including one nobody wrote a blurb for');
{
  for (const def of catalog) {
    const lines = explainGame(def);
    const bad = lines.some((l) => !l || /undefined|\[object|NaN/.test(l));
    check(`${def.meta.name}: reads as sentences`, lines.length >= 2 && !bad, lines);
  }
}

section('A beginner hint can only suggest a legal move');
{
  const svc = new MatchService();
  const m = svc.create(crazyEights, 'ce', ['P1', 'P2', 'P3']);
  let checked = 0;
  for (let i = 0; i < 25; i++) {
    const seat = svc.summaryOf(m.matchId).waitingOn[0];
    if (!seat) break;
    const legal = svc.legal(m.matchId, seat);
    if (legal.length === 0) break;
    const hint = svc.hint(m.matchId, seat);
    if (hint) {
      const isLegal = legal.some((l) => JSON.stringify(l) === JSON.stringify(hint));
      if (!isLegal) { check('a hint was not legal', false, { hint, legal }); break; }
      checked++;
    }
    svc.submit(m.matchId, seat, legal[0]);
  }
  check(`${checked} hints, every one a move the service would accept`, checked > 8);
}

// ---------- leaderboards ----------
section('Leaderboards count finished games, not clicks');
{
  // Everyone at the table appears in every result, winner first — a player who lost still
  // played, which is the whole basis of a win rate.
  const play = (winner: string) => {
    const seats = ['You', 'Bot 2', 'Bot 3'];
    const order = [winner, ...seats.filter((n) => n !== winner)];
    recordResult({
      gameId: 'g1', gameName: 'Test Game', at: Date.now(), seats: 3,
      standings: order.map((name, i) => ({ name, score: 30 - i * 10, isYou: name === 'You' })),
      youWon: winner === 'You',
    });
  };

  play('You'); play('You'); play('Bot 2'); play('You');
  const board = leaderboard('g1');
  check('three players on the board', board.length === 3, board.map((b) => b.name));
  check('the winner is top', board[0].name === 'You', board[0]);
  check('win rate is per game played, not raw wins', Math.abs(board[0].winRate - 0.75) < 0.001, board[0]);

  check('the current streak counts back from the last game', currentStreak('g1') === 1, currentStreak('g1'));
  play('You'); play('You');
  check('...and grows with consecutive wins', currentStreak('g1') === 3, currentStreak('g1'));

  const me = mySummary();
  check('the summary knows how much you have played', me.played === 6, me);
  check('and which game you play most', me.favouriteGame === 'Test Game', me);

  recordResult({
    gameId: 'g2', gameName: 'Other', at: Date.now(), seats: 2,
    standings: [{ name: 'Bot 2', score: 1, isYou: false }, { name: 'You', score: 0, isYou: true }],
    youWon: false,
  });
  check('a per-game board ignores other games', leaderboard('g1').length === 3);
  check('the overall board includes everything', allResults().length === 7, allResults().length);
}

// ---------- safety ----------
section('Name screening catches what a substring check would miss');
{
  check('a plain name is fine', checkName('Midnight Rummy').ok);
  check('a rude name is refused', !checkName('Shit Game').ok);
  check('...and its leetspeak spelling too', !checkName('Sh1t G4me').ok, checkName('Sh1t G4me'));
  check('...and with punctuation shoved in', !checkName('S.h.i.t Game').ok);
  check('a slur is refused however it is dressed up', !checkName('n1gger deluxe').ok);

  check('nothing can pretend to be official', !checkName('Decky Official').ok);
  check('...including a near-miss', !checkName('deckyhearts').ok, checkName('deckyhearts'));
  check('...or a moderator', !checkName('Moderator Picks').ok);
  // Reserved words are only barred at the START — a name is only impersonating if it leads
  // with the claim. "Card Support Group" is somebody's game, not a helpdesk.
  check('a reserved word later in a name is allowed',
    checkName('Card Support Group').ok, checkName('Card Support Group'));
  check('and so is one used as an ordinary word',
    checkName('The Great Admin Caper').ok, checkName('The Great Admin Caper'));

  check('a name that is too short is refused', !checkName('x').ok);
  check('a name that is far too long is refused', !checkName('a'.repeat(60)).ok);
  check('links are refused', !checkName('Play at example.com').ok);

  check('review text is screened the same way', !checkText('this is shit').ok);
  check('ordinary criticism is not', checkText('I did not enjoy this much.').ok);
}

section('Reporting, blocking and muting');
{
  check('nothing is reported yet', !hasReported('custom-x'));
  report('game', 'custom-x', 'broken', 'It deals zero cards.');
  check('the report is recorded', hasReported('custom-x'));
  check('with its reason and note', reports()[0].reason === 'broken' && reports()[0].note.length > 0, reports()[0]);

  check('nobody is blocked', !isBlocked('Mallory'));
  check('blocking returns its new state', toggleBlock('Mallory') === true);
  check('and sticks', isBlocked('Mallory'));
  check('unblocking works', toggleBlock('Mallory') === false && !isBlocked('Mallory'));

  toggleMute('Loud Person');
  check('muting is separate from blocking', isMuted('Loud Person') && !isBlocked('Loud Person'));
}

console.log(failed ? '\nPHASE 5: FAILED' : '\nPHASE 5: all acceptance checks passed');
process.exit(failed ? 1 : 0);
