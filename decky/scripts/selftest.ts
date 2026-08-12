// Headless proof the engine holds up: run the simulator over every classic.
import { catalog } from '../src/games/catalog';
import { simulate } from '../src/engine/simulator';

let failed = false;

for (const game of catalog) {
  const report = simulate(game, 4, 1000);
  console.log(`\n${game.meta.name} — bot self-play (1000 games, 4 players)`);
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
