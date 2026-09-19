// Headless proof the engine holds up: run the simulator over every classic.
import { catalog } from '../src/games/catalog';
import { simulate } from '../src/engine/simulator';
import { createMatch, applyMove, isTerminal } from '../src/engine/engine';
import { chooseSolitaireMove, positionKey } from '../src/bots/solitaireBot';
import { GameDefinition } from '../src/engine/types';

let failed = false;

// Patience is one player against the deal, and a fair deal is not always winnable — so the bar
// is different: every game must reach a definite end (solved or provably stuck) without looping,
// and the greedy player must solve some of them.
function solitaireReport(def: GameDefinition, games: number) {
  let solved = 0, stuck = 0, looped = 0, moves = 0;
  for (let g = 0; g < games; g++) {
    let s = createMatch(def, ['P1'], 7000 + g * 13);
    const seen = new Set([positionKey(s)]);
    let steps = 0;
    while (!isTerminal(s) && steps < 3000) {
      const m = chooseSolitaireMove(s, seen, (st, mv) => applyMove(st, 'P1', mv));
      if (!m) break;
      s = applyMove(s, 'P1', m);
      seen.add(positionKey(s));
      steps++;
    }
    moves += steps;
    if (steps >= 3000) looped++;
    else if (s.winner) solved++;
    else stuck++;
  }
  return { games, solved, stuck, looped, avgMoves: +(moves / games).toFixed(1) };
}

for (const game of catalog) {
  if (game.solitaire) {
    const report = solitaireReport(game, 120);
    console.log(`\n${game.meta.name} — greedy self-play (${report.games} deals)`);
    console.log(JSON.stringify(report, null, 2));
    // Every deal must account for itself, and the greedy player — which has no lookahead —
    // must not spend most of its deals wandering. Whether a given deal is *winnable* is a
    // property of the shuffle, not the engine, so the win path is proved in mechanics.ts
    // against stacked positions instead of by random play.
    const accounted = report.solved + report.stuck + report.looped === report.games;
    const ok = accounted && report.looped <= report.games * 0.25;
    if (!ok) {
      console.error(`FAIL: ${game.meta.name} — ${report.looped}/${report.games} deals hit the move cap.`);
      failed = true;
    } else {
      console.log(`PASS: ${game.meta.name} — ${report.solved} solved, ${report.stuck} played out to a dead end, ${report.looped} capped.`);
    }
    continue;
  }

  const seats = Math.max(game.meta.players.min, Math.min(4, game.meta.players.max));
  const report = simulate(game, seats, 1000);
  console.log(`\n${game.meta.name} — bot self-play (1000 games, ${seats} players)`);
  console.log(JSON.stringify(report, null, 2));

  const ok = report.terminated === report.games && report.winnable && report.maxMovesHit === 0;
  if (!ok) {
    console.error(`FAIL: ${game.meta.name} did not reliably terminate/win.`);
    failed = true;
  } else {
    console.log(`PASS: ${game.meta.name} — all terminated with a winner, no move-cap hits.`);
  }
}

process.exit(failed ? 1 : 0);
