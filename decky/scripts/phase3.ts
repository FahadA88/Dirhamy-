// Phase 3 acceptance: multiplayer, async first, real-time layered on the same model.
//
// The stated bar is "the same game runs correctly async and real-time with no rule drift".
// The last section proves it the only way worth proving: the identical definition and seed,
// driven once in-process and once over a real WebSocket, compared ply by ply from every seat.

import { GameHost } from '../src/net/wsServer';
import { WebSocketApi, openRemoteTable, joinRemoteTable, quickPlay } from '../src/net/wsClient';
import { LocalApi } from '../src/net/localApi';
import { MatchService, Seat } from '../src/server/matchService';
import { crazyEights } from '../src/games/crazyEights';
import { hearts } from '../src/games/hearts';
import { catalog } from '../src/games/catalog';

let failed = false;
const check = (label: string, cond: boolean, extra?: unknown) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '  ' + JSON.stringify(extra)}`);
  if (!cond) failed = true;
};
const section = (n: string) => console.log(`\n${n}`);

const seatsFor = (kinds: Seat['kind'][]): Seat[] =>
  kinds.map((kind, i) => ({ id: `P${i + 1}`, name: `Seat ${i + 1}`, kind, difficulty: 'smart' as const }));

async function main() {
  // ---------- async foundations ----------
  section('Async: a table remembers who is sitting where');
  {
    const svc = new MatchService();
    const m = svc.create(crazyEights, 'ce', seatsFor(['local', 'local', 'remote', 'bot']));
    const seats = svc.seats(m.matchId);
    check('four seats, with kinds', seats.length === 4 && seats[3].kind === 'bot');
    check('pass-and-play is just two local seats', seats.filter((s) => s.kind === 'local').length === 2);
    check('an invite code is issued', /^[A-Z2-9]{6}$/.test(m.inviteCode), m.inviteCode);
    check('the summary says who it is waiting on', m.waitingOn.length > 0, m.waitingOn);

    svc.touch(m.matchId, 'P3', false);
    check('a seat can be marked away without losing it', svc.seats(m.matchId)[2].connected === false);
    svc.touch(m.matchId, 'P3', true);
    check('...and marked back', svc.seats(m.matchId)[2].connected === true);
  }

  section('Async: every move is kept as a readable history');
  {
    const svc = new MatchService();
    const m = svc.create(crazyEights, 'ce', seatsFor(['local', 'bot', 'bot']));
    for (let i = 0; i < 6; i++) {
      const seat = svc.summaryOf(m.matchId).waitingOn[0];
      if (!seat) break;
      const legal = svc.legal(m.matchId, seat);
      if (!legal.length) break;
      svc.submit(m.matchId, seat, legal[0]);
    }
    const h = svc.history(m.matchId);
    check(`${h.length} moves recorded`, h.length >= 5, h.length);
    check('numbered in order', h.every((r, i) => r.n === i + 1));
    check('each carries the seat and a sentence', h.every((r) => !!r.seat && r.text.length > 3), h[0]);
  }

  section('Async: a match survives being abandoned and picked up later');
  {
    const svc = new MatchService();
    const m = svc.create(hearts, 'hearts', seatsFor(['local', 'remote', 'remote', 'remote']));
    const before = JSON.stringify(svc.view(m.matchId, 'P1'));
    // Everybody leaves.
    for (const s of ['P1', 'P2', 'P3', 'P4']) svc.touch(m.matchId, s, false);
    check('nobody is connected', svc.seats(m.matchId).every((s) => !s.connected));
    check('the position is untouched', JSON.stringify(svc.view(m.matchId, 'P1')) === before);
    check('and it still says whose move it is', svc.summaryOf(m.matchId).waitingOn.length > 0);
  }

  // ---------- consent-based takeback ----------
  section('A takeback needs the table to agree');
  {
    const svc = new MatchService();
    const m = svc.create(crazyEights, 'ce', seatsFor(['local', 'remote', 'remote']));
    // The log is deliberately NOT part of this comparison: a takeback writes a line saying it
    // happened, which is the point. What must be identical is the position.
    const board = (p: string) => {
      const { log, ...rest } = svc.view(m.matchId, p);
      void log;
      return JSON.stringify(rest);
    };
    const seat = svc.summaryOf(m.matchId).waitingOn[0];
    const before = board(seat);
    svc.submit(m.matchId, seat, svc.legal(m.matchId, seat)[0]);
    const after = board(seat);
    check('a move changed the board', before !== after);

    const req = svc.requestTakeback(m.matchId, seat);
    check('the request names who must agree', !!req && req.needed.length === 2, req);
    const first = svc.agreeTakeback(m.matchId, req!.needed[0]);
    check('one agreement is not enough', !first.applied);
    check('the board has not moved back yet', board(seat) === after);
    const second = svc.agreeTakeback(m.matchId, req!.needed[1]);
    check('the last agreement applies it', second.applied);
    check('and the board is exactly as it was', board(seat) === before);
    check('and the table is told it happened', svc.view(m.matchId, seat).log.some((l) => /take that move back/.test(l.text)));

    svc.submit(m.matchId, seat, svc.legal(m.matchId, seat)[0]);
    svc.requestTakeback(m.matchId, seat);
    svc.declineTakeback(m.matchId, seat);
    check('a declined request leaves the move standing', svc.pendingTakeback(m.matchId) === null);
  }

  section('Free undo is not offered at a table with opponents');
  {
    const svc = new MatchService();
    const m = svc.create(crazyEights, 'ce', seatsFor(['local', 'bot', 'bot']));
    svc.submit(m.matchId, 'P1', svc.legal(m.matchId, 'P1')[0]);
    check('canUndo is false with opponents', !svc.canUndo(m.matchId));
  }

  // ---------- spectating ----------
  section('A spectator sees the table but nobody’s cards');
  {
    const svc = new MatchService();
    const m = svc.create(hearts, 'hearts', seatsFor(['local', 'bot', 'bot', 'bot']));
    const spec = svc.spectate(m.matchId);
    const player = svc.view(m.matchId, 'P1');
    check('a player holds cards', player.hand.length === 13);
    check('a spectator holds none', spec.hand.length === 0, spec.hand.length);
    check('but can see the seats', spec.players.length === 4);
    check('and every hand is a count, not a card', spec.players.every((p) => p.handCount === 13));
    const json = JSON.stringify(spec);
    check('no hand zone leaks into the spectator view',
      !json.includes('hand:P1') && !json.includes('hand:P2'));
  }

  // ---------- bots fill seats ----------
  section('Bots fill empty seats, at the difficulty the seat says');
  {
    const svc = new MatchService();
    const m = svc.create(crazyEights, 'ce', [
      { id: 'P1', name: 'You', kind: 'local' },
      { id: 'P2', name: 'Easy', kind: 'bot', difficulty: 'random' },
      { id: 'P3', name: 'Hard', kind: 'bot', difficulty: 'smart' },
    ]);
    let steps = 0;
    for (let i = 0; i < 40; i++) {
      const waiting = svc.summaryOf(m.matchId).waitingOn;
      if (waiting.length === 0) break;
      if (waiting.includes('P1')) {
        const legal = svc.legal(m.matchId, 'P1');
        if (!legal.length) break;
        svc.submit(m.matchId, 'P1', legal[0]);
      } else {
        const r = svc.botStep(m.matchId);   // no humanSeats argument — reads the seat table
        if (!r.moved) break;
        steps++;
      }
    }
    check(`bots moved ${steps} times without being told who they are`, steps > 5);
  }

  // ---------- a real host ----------
  section('A real WebSocket host deals the same games');
  const host = new GameHost({ catalog });
  const port = await host.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}`;
  {
    const health = await (await fetch(`${base}/health`)).json();
    check('the host is up', health.ok === true);

    const opened = await openRemoteTable(base, 'classic-crazy-eights', seatsFor(['remote', 'bot', 'bot']));
    check('a table opens over HTTP', 'code' in opened, opened);
    const code = (opened as { code: string }).code;

    const joined = await joinRemoteTable(base, code, 'Ada');
    check('a second person joins by code', 'seat' in joined, joined);
    check('they took a bot seat', (joined as { seat: string }).seat === 'P2');

    const full = await joinRemoteTable(base, code, 'Grace');
    const overflow = await joinRemoteTable(base, code, 'Alan');
    check('the third join takes the last seat', 'seat' in full, full);
    check('and a fourth is turned away', 'error' in overflow && /full/i.test((overflow as { error: string }).error), overflow);

    const nosuch = await joinRemoteTable(base, 'ZZZZZZ', 'Nobody');
    check('a wrong code is refused', 'error' in nosuch);
  }

  section('Quick-play pairs strangers into the same table');
  {
    const a = await quickPlay(base, 'classic-crazy-eights', 'Ada', 3);
    const b = await quickPlay(base, 'classic-crazy-eights', 'Bob', 3);
    check('the first player opens a table', 'hosted' in a && a.hosted === true, a);
    check('the second joins the same one', 'matchId' in b && 'matchId' in a && b.matchId === a.matchId, { a, b });
    check('and takes a different seat', 'seat' in a && 'seat' in b && a.seat !== b.seat, { a, b });
  }

  section('Two clients on one socket table see their own hand and nobody else’s');
  {
    const opened = await openRemoteTable(base, 'classic-hearts', seatsFor(['remote', 'remote', 'bot', 'bot']));
    const { matchId, code } = opened as { matchId: string; code: string };
    await joinRemoteTable(base, code, 'Bob');

    const alice = new WebSocketApi(wsUrl);
    const bob = new WebSocketApi(wsUrl);
    await alice.identify(matchId, 'P1');
    await bob.identify(matchId, 'P2');

    const aView = await alice.view(matchId, 'P1');
    const bView = await bob.view(matchId, 'P2');
    check('each client got 13 cards', aView.hand.length === 13 && bView.hand.length === 13);
    check('the hands are different', JSON.stringify(aView.hand) !== JSON.stringify(bView.hand));

    // The wire itself must not carry somebody else's hand.
    const wire = JSON.stringify(aView);
    check('the wire carries no opponent hand', !wire.includes('hand:P2'));

    // A live push: Bob should hear about Alice's move without asking.
    const heard: number[] = [];
    bob.subscribe(matchId, () => heard.push(Date.now()));
    const seat = (await alice.summary(matchId)).waitingOn.find((s) => s === 'P1');
    if (seat) {
      const legal = await alice.legal(matchId, 'P1');
      if (legal.length) await alice.submit(matchId, 'P1', legal[0]);
    }
    await new Promise((r) => setTimeout(r, 250));
    check('the other client was pushed the change', heard.length > 0, heard.length);

    const spec = await bob.spectate(matchId);
    check('spectating over the wire hides every hand', spec.hand.length === 0);

    alice.close();
    bob.close();
  }

  // ---------- the headline ----------
  section('No rule drift: the same game, async and real-time, ply by ply');
  {
    // Same definition, same server seed, same moves — one match in-process, one over a socket.
    const seats = seatsFor(['local', 'local', 'local']);
    const svc = new MatchService();
    const localSummary = svc.create(crazyEights, 'ce', seats, 'fixed-client', 'fixed-server');
    const localApi = new LocalApi(svc);

    const remoteSummary = host.service.create(crazyEights, 'ce', seats, 'fixed-client', 'fixed-server');
    const remote = new WebSocketApi(wsUrl);
    // The host only pushes events for tables it opened; the drift check only needs the verbs.
    const rid = remoteSummary.matchId;

    let same = true;
    let plies = 0;
    let why = '';
    for (const p of ['P1', 'P2', 'P3']) {
      const a = JSON.stringify(await localApi.view(localSummary.matchId, p));
      const b = JSON.stringify(await remote.view(rid, p));
      if (a !== b) { same = false; why = `${p} was dealt differently`; }
    }
    check('both tables were dealt identically', same, why);

    for (let i = 0; i < 30 && same; i++) {
      const waiting = (await localApi.summary(localSummary.matchId)).waitingOn;
      const rWaiting = (await remote.summary(rid)).waitingOn;
      if (JSON.stringify(waiting) !== JSON.stringify(rWaiting)) { same = false; why = `turn order diverged at ply ${i}`; break; }
      const seat = waiting[0];
      if (!seat) break;

      const aMoves = await localApi.legal(localSummary.matchId, seat);
      const bMoves = await remote.legal(rid, seat);
      if (JSON.stringify(aMoves) !== JSON.stringify(bMoves)) { same = false; why = `legal moves diverged at ply ${i}`; break; }
      if (aMoves.length === 0) break;

      const ra = await localApi.submit(localSummary.matchId, seat, aMoves[0]);
      const rb = await remote.submit(rid, seat, aMoves[0]);
      if (ra.ok !== rb.ok) { same = false; why = `one accepted and the other refused at ply ${i}`; break; }

      for (const p of ['P1', 'P2', 'P3']) {
        const a = JSON.stringify(await localApi.view(localSummary.matchId, p));
        const b = JSON.stringify(await remote.view(rid, p));
        if (a !== b) { same = false; why = `view for ${p} diverged at ply ${i}`; break; }
      }
      if (!same) break;
      plies++;
    }
    check(`${plies} plies driven in-process and over the wire, identical throughout`, same && plies > 8, why || `only ${plies} plies`);
    remote.close();
  }

  section('A dropped connection loses nothing');
  {
    const opened = await openRemoteTable(base, 'classic-crazy-eights', seatsFor(['remote', 'bot', 'bot']));
    const { matchId } = opened as { matchId: string };
    const client = new WebSocketApi(wsUrl);
    await client.identify(matchId, 'P1');
    const legal = await client.legal(matchId, 'P1');
    if (legal.length) await client.submit(matchId, 'P1', legal[0]);
    const before = JSON.stringify(await client.view(matchId, 'P1'));
    client.close();

    await new Promise((r) => setTimeout(r, 120));
    const back = new WebSocketApi(wsUrl);
    await back.identify(matchId, 'P1');
    const after = JSON.stringify(await back.view(matchId, 'P1'));
    check('reconnecting resumes the same position', before === after);
    check('and the seat is marked present again', host.service.seats(matchId)[0].connected === true);
    back.close();
  }

  await host.stop();
  console.log(failed ? '\nPHASE 3: FAILED' : '\nPHASE 3: all acceptance checks passed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
