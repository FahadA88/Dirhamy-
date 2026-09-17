// Prove the validator passes the classics and catches broken definitions.
import { catalog } from '../src/games/catalog';
import { crazyEights } from '../src/games/crazyEights';
import { validate } from '../src/engine/validator';
import { GameDefinition } from '../src/engine/types';

let failed = false;

/*
  A warning has been wrong here before and nobody noticed for a release: Switch and Trade Winds
  both shipped with "leaves a thin draw pile at max players", correctly detected, and then never
  printed anywhere a human would read it — `r.ok` only looks at ERRORS, so a game with nothing
  but warnings logged as a bare issue count and the count was never once looked at.

  Every issue on every premade game gets printed now, not folded into a number. Warnings do not
  fail the build — some are advisory judgement calls an author can reasonably accept — but they
  are never allowed to be silent again, and the count at the bottom is there so a scrollback full
  of green lines cannot hide the one game near the top that had something to say.
*/
console.log('Classics should validate clean:');
let warnCount = 0;
for (const g of catalog) {
  const r = validate(g);
  console.log(`  ${r.status.toUpperCase().padEnd(6)} ${g.meta.name}  (${r.issues.length} issues)`);
  for (const i of r.issues) {
    if (i.level === 'error') failed = true; else warnCount++;
    console.log(`     ${i.level === 'error' ? '!' : '~'} ${i.message}`);
  }
}
if (warnCount > 0) {
  console.log(`\n${warnCount} warning${warnCount === 1 ? '' : 's'} above, on games that are shipping anyway —`
    + ' each is an accepted trade-off, not an oversight, but they earn a second look on request.');
}

console.log('\nBroken definitions should be caught:');

// 1) references a tag that does not exist
const badTag: GameDefinition = JSON.parse(JSON.stringify(crazyEights));
badTag.actions[0].when = { cardHasTag: 'nonexistent' } as any;
report('unknown tag', validate(badTag), 'tag.missing');

// 2) win condition unreachable — remove the action that sheds cards
const noShed: GameDefinition = JSON.parse(JSON.stringify(crazyEights));
noShed.actions = noShed.actions.filter((a) => a.id !== 'playCard');
report('unreachable win', validate(noShed), 'win.unreachable');

// 3) deals more cards than the deck holds
const overDeal: GameDefinition = JSON.parse(JSON.stringify(crazyEights));
(overDeal.setup.find((s) => s.op === 'deal') as any).countPerPlayer = 20;
report('over-deal', validate(overDeal), 'deck.overdeal');

// 4) references a missing zone
const badZone: GameDefinition = JSON.parse(JSON.stringify(crazyEights));
(badZone.actions[0].effects[0] as any).to = 'ghostZone';
report('missing zone', validate(badZone), 'zone.missing');

function report(name: string, r: ReturnType<typeof validate>, expectedCode: string) {
  const caught = r.issues.some((i) => i.level === 'error' && i.code === expectedCode);
  console.log(`  ${caught ? 'PASS' : 'FAIL'}  ${name} → expected error "${expectedCode}" ${caught ? 'raised' : 'MISSING'}`);
  if (!caught) failed = true;
}

process.exit(failed ? 1 : 0);
