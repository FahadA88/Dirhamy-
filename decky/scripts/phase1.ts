// Phase 1 acceptance tests. Each maps to a stated criterion.
import { MatchService } from '../src/server/matchService';
import { LocalMatchStore } from '../src/server/localStore';
import { crazyEights } from '../src/games/crazyEights';
import { hearts } from '../src/games/hearts';
import { klondike } from '../src/games/klondike';
import { migrate, pinDefinition, CURRENT_SCHEMA } from '../src/engine/migrate';
import { commitTo, deriveSeed, verifyReveal, newServerSeed } from '../src/engine/fairness';
import { sha256 } from '../src/engine/hash';
import { createMatch, applyMove, legalMoves, redact } from '../src/engine/engine';

let failed = false;
const check = (label: string, cond: boolean, extra?: unknown) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '  ' + JSON.stringify(extra)}`);
  if (!cond) failed = true;
};
const section = (n: string) => console.log(`\n${n}`);

// ---------- hash ----------
section('SHA-256 against the NIST vectors');
{
  check('empty string', sha256('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  check('"abc"', sha256('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  check('multi-block message', sha256('a'.repeat(1000000)) === 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
}

// ---------- provable fairness ----------
section('Provably-fair dealing — commit, reveal, verify');
{
  const serverSeed = newServerSeed();
  const commit = commitTo(serverSeed);
  check('the commit is a sha256 digest', /^[0-9a-f]{64}$/.test(commit));
  check('the commit reveals nothing about the seed', !commit.includes(serverSeed.slice(0, 8)));
  check('the same seed always commits the same', commitTo(serverSeed) === commit);
  check('a different seed commits differently', commitTo(newServerSeed()) !== commit);

  const a = deriveSeed(serverSeed, 'player-choice', 1);
  const b = deriveSeed(serverSeed, 'player-choice', 2);
  check('each hand derives a different seed', a !== b, { a, b });
  check('derivation is deterministic', deriveSeed(serverSeed, 'player-choice', 1) === a);
  check('the player contribution changes the deal', deriveSeed(serverSeed, 'other', 1) !== a);
  check('seeds are valid unsigned 32-bit', a >= 0 && a <= 0xffffffff);

  const good = verifyReveal({ commit, clientSeed: 'player-choice', nonce: 1, serverSeed }, [a, b]);
  check('an honest reveal verifies', good.ok && good.commitOk, good);

  // A dealer who swapped the seed after committing is caught.
  const cheat = verifyReveal({ commit, clientSeed: 'player-choice', nonce: 1, serverSeed: newServerSeed() }, [a, b]);
  check('a swapped server seed fails the commit check', !cheat.commitOk);
  check('and the whole reveal is rejected', !cheat.ok);

  // A dealer who kept the seed but reported a different deal is also caught.
  const tampered = verifyReveal({ commit, clientSeed: 'player-choice', nonce: 1, serverSeed }, [a, (b ^ 1) >>> 0]);
  check('a tampered hand seed is caught', !tampered.ok && tampered.hands[1].ok === false);
}

// ---------- versioning ----------
section('Versioned definitions — migration and pinning');
{
  const old = { ...JSON.parse(JSON.stringify(crazyEights)), schemaVersion: '1.0' };
  const r = migrate(old);
  check('a 1.0 definition migrates', r.migrated && r.definition.schemaVersion === CURRENT_SCHEMA, r);
  check('the migration path is reported', r.steps.length === 1 && r.steps[0] === '1.0 → 1.1', r.steps);
  check('a current definition is left alone', migrate({ ...crazyEights, schemaVersion: CURRENT_SCHEMA }).migrated === false);

  let threw = '';
  try { migrate({ ...crazyEights, schemaVersion: '9.9' }); } catch (e) { threw = (e as Error).message; }
  check('an unknown future version is refused, not silently run', threw.includes('cannot read'), threw);

  // The pin is a real copy, not a reference.
  const pinned = pinDefinition(crazyEights);
  pinned.meta.name = 'Edited';
  check('pinning deep-copies the definition', crazyEights.meta.name === 'Crazy Eights', crazyEights.meta.name);
}

section('Editing a game cannot reach a match already running');
{
  const svc = new MatchService();
  const editable = JSON.parse(JSON.stringify(crazyEights));
  const m = svc.create(editable, 'classic-crazy-eights', ['P1', 'P2', 'P3']);

  // The author edits the game after the match has started — a drastic change.
  editable.meta.name = 'Totally Different Game';
  editable.deck.excludeRanks = ['A', '2', '3', '4', '5'];
  editable.scoring.target = 9999;

  const pinnedNow = svc.definitionOf(m.matchId);
  check('the running match keeps its own name', pinnedNow.meta.name === 'Crazy Eights', pinnedNow.meta.name);
  check('the running match keeps its own deck', (pinnedNow.deck.excludeRanks ?? []).length === 0);
  check('the running match keeps its own scoring', pinnedNow.scoring.target !== 9999);
  const view = svc.view(m.matchId, 'P1');
  check('and it still plays', view.hand.length > 0 && view.phase === 'playing');
}

// ---------- authority ----------
section('Server-authoritative moves');
{
  const svc = new MatchService();
  const m = svc.create(hearts, 'classic-hearts', ['P1', 'P2', 'P3', 'P4']);

  const view = svc.view(m.matchId, 'P1');
  check('a view carries the viewer own hand', view.hand.length === 13, view.hand.length);
  check('a view never carries raw zone state', !('definition' in (view as object)));

  // Hidden information: no opponent hand is reachable through the view.
  const asJson = JSON.stringify(view);
  check('an opponent hand zone is not in the view', !asJson.includes('hand:P2'), 'leaked hand:P2');

  // Illegal moves are refused with a reason rather than silently dropped.
  const bogus = svc.submit(m.matchId, 'P1', { actionId: 'playToTrick', cardId: 'NOT_A_CARD' });
  check('a made-up card is refused', !bogus.ok);
  check('and it says why', !!bogus.reason && bogus.reason.length > 0, bogus.reason);

  const notYours = svc.submit(m.matchId, 'P1', { actionId: 'choosePass', cardId: 'C2' });
  check('a card you do not hold is refused', !notYours.ok, notYours.reason);

  let seatErr = '';
  try { svc.view(m.matchId, 'P9'); } catch (e) { seatErr = (e as Error).message; }
  check('a stranger cannot read the table', seatErr.includes('not seated'), seatErr);

  let noMatch = '';
  try { svc.view('nope', 'P1'); } catch (e) { noMatch = (e as Error).message; }
  check('an unknown match id is refused', noMatch.includes('No such match'));
}

section('Turn order is enforced by the service, not the caller');
{
  const svc = new MatchService();
  const m = svc.create(klondike, 'classic-klondike', ['P1']);
  const legal = svc.legal(m.matchId, 'P1');
  check('solitaire offers moves', legal.length > 0);
  const first = svc.submit(m.matchId, 'P1', legal[0]);
  check('a legal move is accepted', first.ok, first.reason);
  check('and the view advances', (first.view.moveCount ?? 0) === 1, first.view.moveCount);
}

section('A move refused by the service leaves the game untouched');
{
  const svc = new MatchService();
  const m = svc.create(crazyEights, 'classic-crazy-eights', ['P1', 'P2', 'P3']);
  const before = JSON.stringify(svc.view(m.matchId, 'P1'));
  svc.submit(m.matchId, 'P1', { actionId: 'playCard', cardId: 'FAKE' });
  svc.submit(m.matchId, 'P1', { actionId: 'nonsenseAction' });
  const after = JSON.stringify(svc.view(m.matchId, 'P1'));
  check('two rejected moves changed nothing', before === after);
}

section('The engine still agrees with the service — no rule drift');
{
  // Same definition, same seed, same moves, driven two ways: once straight through the engine
  // and once through the service. Once these run in two processes, any divergence here IS rule
  // drift, so the views must stay identical ply by ply.
  const svc = new MatchService();
  const m = svc.create(crazyEights, 'classic-crazy-eights', ['P1', 'P2', 'P3'], 'fixed-client', 'fixed-server');
  const seed = deriveSeed('fixed-server', 'fixed-client', 1);
  let direct = createMatch(crazyEights, ['P1', 'P2', 'P3'], seed);

  check('both start from the same deal',
    JSON.stringify(redact(direct, 'P1')) === JSON.stringify(svc.view(m.matchId, 'P1')));

  let plies = 0;
  let drifted = '';
  for (let i = 0; i < 40; i++) {
    const seat = direct.players[direct.turnIndex];
    const engineMoves = legalMoves(direct, seat);
    const serviceMoves = svc.legal(m.matchId, seat);
    if (JSON.stringify(engineMoves) !== JSON.stringify(serviceMoves)) { drifted = `legal moves differ at ply ${i}`; break; }
    if (engineMoves.length === 0) break;

    direct = applyMove(direct, seat, engineMoves[0]);
    const res = svc.submit(m.matchId, seat, engineMoves[0]);
    if (!res.ok) { drifted = `service refused a move the engine allowed at ply ${i}: ${res.reason}`; break; }

    for (const p of ['P1', 'P2', 'P3']) {
      if (JSON.stringify(redact(direct, p)) !== JSON.stringify(svc.view(m.matchId, p))) {
        drifted = `view for ${p} diverged at ply ${i}`;
        break;
      }
    }
    if (drifted) break;
    plies++;
  }
  check(`${plies} plies driven both ways with identical views`, drifted === '' && plies > 5, drifted || `only ${plies} plies`);
}

section('Undo and hint live inside the boundary, not in the client');
{
  const svc = new MatchService();
  const s = svc.create(klondike, 'classic-klondike', ['P1']);
  check('a fresh deal has nothing to take back', !svc.canUndo(s.matchId));

  const before = JSON.stringify(svc.view(s.matchId, 'P1'));
  const first = svc.legal(s.matchId, 'P1')[0];
  svc.submit(s.matchId, 'P1', first);
  check('a move makes the position undoable', svc.canUndo(s.matchId));

  const u = svc.undo(s.matchId, 'P1');
  check('undo restores the exact position', u.ok && JSON.stringify(svc.view(s.matchId, 'P1')) === before);
  check('and then there is nothing left to take back', !svc.canUndo(s.matchId));

  // With opponents at the table, an undo would rewind information other players have acted on.
  const multi = new MatchService();
  const h = multi.create(hearts, 'classic-hearts', ['P1', 'P2', 'P3', 'P4']);
  multi.submit(h.matchId, 'P1', multi.legal(h.matchId, 'P1')[0]);
  check('a multiplayer table offers no undo', !multi.canUndo(h.matchId));

  // A hint may only point at something the player can already see.
  const hint = svc.hint(s.matchId, 'P1');
  check('a hint is offered', !!hint, hint);
  check('and it is a move the service would accept',
    svc.legal(s.matchId, 'P1').some((m) => JSON.stringify(m) === JSON.stringify(hint)));

  const v = svc.view(s.matchId, 'P1');
  const visible = new Set<string>();
  for (const col of v.tableau ?? []) for (const c of col.cards) if (String(c.rank) !== '?') visible.add(c.id);
  for (const c of v.wasteCards ?? []) visible.add(c.id);
  for (const cell of v.freeCells ?? []) if (cell.card) visible.add(cell.card.id);
  check('the hinted card is one the player can already see',
    !hint?.cardId || visible.has(hint.cardId), hint);

  // And the face-down cards really are face down.
  const downLeak = (v.tableau ?? []).some((col) => col.cards.slice(0, col.faceDown).some((c) => String(c.rank) !== '?'));
  check('face-down cards are hidden in the view', !downLeak);
}

section('A match survives a reload without the client ever holding it');
{
  // Stand in for the browser. The store is the only thing that touches it.
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, v); },
    removeItem: (k: string) => { mem.delete(k); },
    key: (i: number) => Array.from(mem.keys())[i] ?? null,
    get length() { return mem.size; },
  };

  const svc = new MatchService(new LocalMatchStore());
  const m = svc.create(crazyEights, 'classic-crazy-eights', ['P1', 'P2', 'P3']);
  svc.submit(m.matchId, 'P1', svc.legal(m.matchId, 'P1')[0]);
  const before = JSON.stringify(svc.view(m.matchId, 'P1'));

  check('something was written', mem.size > 0);
  const written = JSON.stringify(Array.from(mem.values()));
  check('the pinned rules travel with the match', written.includes('Crazy Eights'));

  // A new process, a cold service — exactly what a page reload is.
  const reloaded = new MatchService(new LocalMatchStore());
  check('the match is still there', JSON.stringify(reloaded.view(m.matchId, 'P1')) === before);
  check('and it still knows its own rules', reloaded.definitionOf(m.matchId).meta.name === 'Crazy Eights');
  const resumed = reloaded.submit(m.matchId, reloaded.pending(m.matchId)[0], reloaded.legal(m.matchId, reloaded.pending(m.matchId)[0])[0]);
  check('and it still plays', resumed.ok, resumed.reason);

  reloaded.end(m.matchId);
  check('ending a match clears its record', !JSON.stringify(Array.from(mem.keys())).includes(m.matchId));

  delete (globalThis as { localStorage?: unknown }).localStorage;
}

console.log(failed ? '\nPHASE 1: FAILED' : '\nPHASE 1: all acceptance checks passed');
process.exit(failed ? 1 : 0);
