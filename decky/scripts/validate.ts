// Prove the validator passes the classics and catches broken definitions.
import { catalog } from '../src/games/catalog';
import { crazyEights } from '../src/games/crazyEights';
import { validate } from '../src/engine/validator';
import { GameDefinition } from '../src/engine/types';

let failed = false;

console.log('Classics should validate clean:');
for (const g of catalog) {
  const r = validate(g);
  console.log(`  ${r.status.toUpperCase().padEnd(6)} ${g.meta.name}  (${r.issues.length} issues)`);
  if (!r.ok) { failed = true; r.issues.forEach((i) => console.log(`     ! ${i.message}`)); }
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
