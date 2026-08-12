// Headless proof the engine holds up: run the simulator over Crazy Eights.
import { crazyEights } from '../src/games/crazyEights';
import { simulate } from '../src/engine/simulator';

const report = simulate(crazyEights, 4, 1000);
console.log('Crazy Eights — bot self-play report');
console.log(JSON.stringify(report, null, 2));

const ok =
  report.terminated === report.games &&
  report.winnable &&
  report.maxMovesHit === 0;

if (!ok) {
  console.error('\nFAIL: game did not reliably terminate/win.');
  process.exit(1);
}
console.log('\nPASS: all games terminated with a winner, no move-cap hits.');
