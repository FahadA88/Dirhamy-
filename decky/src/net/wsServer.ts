import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { MatchService, Seat } from '../server/matchService';
import { Request, Response, TableEvent } from './protocol';
import { handle, mutates, eventFor } from './dispatch';
import { GameDefinition } from '../engine/types';
import { handleAuthor, canAuthor, authorModels, AuthorRequest } from './authorEndpoint';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

// A real host.
//
// This is the same MatchService the browser runs in-process, put behind a socket. Nothing about
// the rules changes — that is the whole point of having built the boundary first. What changes
// is the trust story: with the service over here, the browser no longer holds the hands of
// people it is playing against, and a tampered client is a client that gets its moves refused.
//
// Tables are keyed by invite code as well as match id, because a code is what a person can read
// out loud, and matchmaking is a queue of codes.

export interface HostOptions {
  port?: number;
  /** Games this host will deal. A table can only be opened for a definition the host knows. */
  catalog?: GameDefinition[];
  /**
   * A built frontend (`vite build`'s `dist/`) to serve alongside the API, so one process is a
   * complete deployable site — no separate static host, no CORS, no endpoint to pin at build
   * time. Omit to run API/WS only, as the test suite does.
   */
  staticDir?: string;
}

interface Table {
  matchId: string;
  code: string;
  sockets: Map<WebSocket, string | null>;   // socket -> seat it claims (null = spectator)
  open: boolean;                            // still accepting players
  /**
   * The secret that must accompany a `hello` for a given seat. Issued once, when the seat is
   * opened or joined, and handed back only in that one response — never broadcast, never
   * re-derivable from the invite code. Without this, the invite code (which the whole table
   * knows) would double as a credential for reading or moving as any other seat too.
   */
  seatTokens: Map<string, string>;
}

function randomToken(): string {
  return randomBytes(16).toString('hex');
}

/** Requests that name a seat and must come from the socket that helloed as that exact seat. */
const SEATED_KINDS = new Set([
  'view', 'legal', 'submit', 'setSeat', 'requestTakeback', 'agreeTakeback',
  'declineTakeback', 'hint', 'quickUndo',
]);

export class GameHost {
  readonly service = new MatchService();
  private tables = new Map<string, Table>();   // by invite code
  private byMatch = new Map<string, Table>();
  private queue: string[] = [];                // invite codes waiting for a quick-play partner
  private catalog: GameDefinition[];
  private staticDir?: string;
  /**
   * Block and mute lists, kept against an opaque code so somebody can carry them between their
   * own devices. In memory: this is a convenience, and losing it costs somebody a re-block, not
   * a game. A deployment that wants it durable swaps this Map for a table.
   */
  private safety = new Map<string, { blocked: string[]; muted: string[] }>();
  private wss?: WebSocketServer;
  private http?: ReturnType<typeof createServer>;

  constructor(opts: HostOptions = {}) {
    this.catalog = opts.catalog ?? [];
    this.staticDir = opts.staticDir;
  }

  // ----- table lifecycle -----

  /** Open a table. Returns the invite code a person can read out, and a token for every seat
   *  that starts out remote (the host's own seat) — the caller already knows which one is theirs. */
  openTable(
    definition: GameDefinition, seats: Seat[], gameId?: string,
  ): { matchId: string; code: string; seatTokens: Record<string, string> } {
    const summary = this.service.create(definition, gameId ?? definition.meta.id, seats);
    const table: Table = {
      matchId: summary.matchId, code: summary.inviteCode, sockets: new Map(), open: true,
      seatTokens: new Map(),
    };
    for (const s of seats) if (s.kind === 'remote') table.seatTokens.set(s.id, randomToken());
    this.tables.set(table.code, table);
    this.byMatch.set(table.matchId, table);
    // The very first seat to act might already be a bot's (an all-bot filler table, or a game
    // whose dealer/opener isn't seat 0) — step it before anyone has sent a single message.
    this.stepBots(table);
    return { matchId: table.matchId, code: table.code, seatTokens: Object.fromEntries(table.seatTokens) };
  }

  /** Take an open seat at a table, by code. This is what an invite link resolves to. */
  join(code: string, name: string): { matchId: string; seat: string; token: string } | { error: string } {
    const table = this.tables.get(code.toUpperCase());
    if (!table) return { error: 'No table with that code.' };
    const seats = this.service.seats(table.matchId);
    // A bot seat is the vacancy: bots fill empty chairs until a person arrives to claim one.
    const free = seats.find((s) => s.kind === 'bot');
    if (!free) return { error: 'That table is full.' };
    this.service.setSeat(table.matchId, free.id, { kind: 'remote', name, connected: true });
    const token = randomToken();
    table.seatTokens.set(free.id, token);
    this.broadcast(table, { type: 'seats', matchId: table.matchId, at: Date.now() });
    this.stepBots(table);
    return { matchId: table.matchId, seat: free.id, token };
  }

  /**
   * Advance every bot seat that's ready to move, right now, without waiting for a client to ask.
   * A browser tab's own bot-loop deliberately does nothing for a remote table (bots belong to the
   * host, not to a guest's tab) — so without this, a hosted table with any bot seat would simply
   * sit still forever the moment it became a bot's turn, since nobody would ever be left to step
   * it. Broadcasts after every bot move so watching clients see each one land, not just the end.
   */
  private stepBots(table: Table): void {
    // A hard cap, not a real limit — every family's own stalemate/no-legal-move handling is what
    // actually ends a runaway sequence. This just guarantees a bug elsewhere can't wedge the host.
    for (let i = 0; i < 500; i++) {
      let r: { moved: boolean; seat?: string };
      try { r = this.service.botStep(table.matchId); } catch { break; }
      if (!r.moved) break;
      let waitingOn: string[] = [];
      try { waitingOn = this.service.summaryOf(table.matchId).waitingOn; } catch { break; }
      this.broadcast(table, { type: 'changed', matchId: table.matchId, waitingOn, at: Date.now() });
    }
  }

  /**
   * Public quick-play: take the oldest table still waiting, or open one and wait.
   * Deliberately the same join path — matchmaking is a way of finding a code, not a second
   * kind of game.
   */
  quickPlay(
    definition: GameDefinition, name: string, seatCount = 4,
  ): { matchId: string; seat: string; code: string; hosted: boolean; token: string } {
    while (this.queue.length > 0) {
      const code = this.queue[0];
      const r = this.join(code, name);
      if ('error' in r) { this.queue.shift(); continue; }
      const stillFree = this.service.seats(r.matchId).some((s) => s.kind === 'bot');
      if (!stillFree) this.queue.shift();
      return { ...r, code, hosted: false };
    }
    const seats: Seat[] = Array.from({ length: seatCount }, (_, i) => ({
      id: `P${i + 1}`,
      name: i === 0 ? name : `Seat ${i + 1}`,
      kind: i === 0 ? 'remote' : 'bot',
      difficulty: 'smart' as const,
      connected: i === 0,
    }));
    const t = this.openTable(definition, seats);
    this.queue.push(t.code);
    return { matchId: t.matchId, seat: 'P1', code: t.code, hosted: true, token: t.seatTokens.P1 };
  }

  closeTable(code: string): void {
    const table = this.tables.get(code);
    if (!table) return;
    this.broadcast(table, { type: 'ended', matchId: table.matchId, at: Date.now() });
    for (const sock of table.sockets.keys()) sock.close();
    this.service.end(table.matchId);
    this.tables.delete(code);
    this.byMatch.delete(table.matchId);
    this.queue = this.queue.filter((c) => c !== code);
  }

  // ----- transport -----

  listen(port = 8787): Promise<number> {
    this.http = createServer((req, res) => this.rest(req, res));
    this.wss = new WebSocketServer({ server: this.http });

    this.wss.on('connection', (sock) => {
      sock.on('message', (raw) => {
        let msg: { id: number; body: Request };
        try { msg = JSON.parse(String(raw)); } catch { return; }
        const req = msg.body;
        const table = this.byMatch.get(req.matchId);
        const refuse = (error: string) => sock.send(JSON.stringify({ id: msg.id, body: { ok: false, error }, reply: true }));

        // A seat is a secret once opened or joined: hello must present the exact token that
        // request was handed back, and every later request naming a seat must come from the
        // socket that helloed as it — otherwise the invite code, which the whole table knows,
        // would double as a credential for reading or moving as anyone else's hand.
        if (req.kind === 'hello') {
          if (table && req.seat) {
            const expected = table.seatTokens.get(req.seat);
            if (expected === undefined || expected !== req.token) {
              refuse('That seat needs the token it was issued when it was opened or joined.');
              return;
            }
          }
        } else if (table && SEATED_KINDS.has(req.kind)) {
          if (table.sockets.get(sock) !== (req as { seat?: string }).seat) {
            refuse('Say hello for this seat on this connection first.');
            return;
          }
        }

        if (req.kind === 'hello' && table) {
          table.sockets.set(sock, req.seat);
          if (req.seat) this.service.touch(req.matchId, req.seat, true);
        }

        const res: Response = handle(this.service, req);
        sock.send(JSON.stringify({ id: msg.id, body: res, reply: true }));

        if (res.ok && mutates(req) && table) {
          this.broadcast(table, eventFor(this.service, req));
          // Whatever just happened may have handed the turn to a bot seat (or several, for a
          // simultaneous-pass family) — step them now rather than waiting for another message.
          this.stepBots(table);
        }
      });

      sock.on('close', () => {
        for (const table of this.tables.values()) {
          const seat = table.sockets.get(sock);
          if (seat === undefined) continue;
          table.sockets.delete(sock);
          // A dropped player is not a forfeit. The seat stays theirs and the match waits — that
          // is the whole difference between async and "you lose if your train goes in a tunnel".
          if (seat) this.service.touch(table.matchId, seat, false);
          this.broadcast(table, { type: 'seats', matchId: table.matchId, at: Date.now() });
        }
      });
    });

    return new Promise((resolve) => {
      this.http!.listen(port, () => resolve((this.http!.address() as { port: number }).port));
    });
  }

  async stop(): Promise<void> {
    for (const t of [...this.tables.keys()]) this.closeTable(t);
    this.wss?.close();
    await new Promise<void>((r) => this.http ? this.http.close(() => r()) : r());
  }

  private broadcast(table: Table, e: TableEvent): void {
    const payload = JSON.stringify({ id: 0, body: e, event: true });
    for (const sock of table.sockets.keys()) {
      if (sock.readyState === sock.OPEN) sock.send(payload);
    }
  }

  /** A tiny REST surface so opening and joining a table doesn't require a socket first. */
  private rest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const json = (code: number, body: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
      });
      res.end();
      return;
    }
    if (url.pathname === '/health') {
      // The models are named here, not the key. The interface can then offer a real choice
      // instead of a list it hopes the host understands.
      json(200, { ok: true, tables: this.tables.size, canAuthor: canAuthor(), author: authorModels() });
      return;
    }

    // The game writer. Served at /api/author as well as /author so a site behind a proxy that
    // routes /api/* to the host does not need a rewrite rule.
    if ((url.pathname === '/author' || url.pathname === '/api/author') && req.method === 'POST') {
      body(req, (data) => {
        handleAuthor(data as AuthorRequest).then((r) => {
          json(r.status, r.error ? { error: r.error } : { text: r.text });
        });
      });
      return;
    }
    // Carrying a safety list between devices. The code is the credential; see safety.ts.
    if (url.pathname === '/safety' && req.method === 'GET') {
      const code = (url.searchParams.get('code') ?? '').trim().toUpperCase();
      if (code.length < 8) { json(400, { error: 'A sync code is required.' }); return; }
      json(200, { lists: this.safety.get(code) ?? { blocked: [], muted: [] } });
      return;
    }
    if (url.pathname === '/safety' && req.method === 'POST') {
      body(req, (data) => {
        const { code, lists } = data as { code?: string; lists?: { blocked?: string[]; muted?: string[] } };
        const key = (code ?? '').trim().toUpperCase();
        if (key.length < 8) { json(400, { error: 'A sync code is required.' }); return; }
        // Bounded on the way in — this is a list of names somebody blocked, not a store.
        const clean = (xs: unknown): string[] => Array.isArray(xs)
          ? xs.filter((x): x is string => typeof x === 'string' && x.length <= 60).slice(0, 500)
          : [];
        this.safety.set(key, { blocked: clean(lists?.blocked), muted: clean(lists?.muted) });
        json(200, { ok: true });
      });
      return;
    }
    if (url.pathname === '/games') { json(200, this.catalog.map((g) => ({ id: g.meta.id, name: g.meta.name }))); return; }

    if (url.pathname === '/open' && req.method === 'POST') {
      body(req, (data) => {
        const { gameId, seats } = data as { gameId: string; seats: Seat[] };
        const def = this.catalog.find((g) => g.meta.id === gameId);
        if (!def) { json(404, { error: `This host does not know the game "${gameId}".` }); return; }
        json(200, this.openTable(def, seats));
      });
      return;
    }
    if (url.pathname === '/join' && req.method === 'POST') {
      body(req, (data) => {
        const { code, name } = data as { code: string; name: string };
        const r = this.join(code, name);
        json('error' in r ? 400 : 200, r);
      });
      return;
    }
    if (url.pathname === '/quickplay' && req.method === 'POST') {
      body(req, (data) => {
        const { gameId, name, seats } = data as { gameId: string; name: string; seats?: number };
        const def = this.catalog.find((g) => g.meta.id === gameId);
        if (!def) { json(404, { error: `This host does not know the game "${gameId}".` }); return; }
        json(200, this.quickPlay(def, name, seats ?? 4));
      });
      return;
    }
    if (this.staticDir && (req.method === 'GET' || req.method === 'HEAD')) {
      this.serveStatic(url.pathname, res);
      return;
    }
    json(404, { error: 'Not found.' });
  }

  /** Serves the built frontend. Any path without a file extension falls back to index.html —
   * this is a single-page app with no server-side routes of its own. */
  private serveStatic(pathname: string, res: ServerResponse): void {
    const dir = this.staticDir!;
    const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const hasExt = extname(safe) !== '';
    const target = join(dir, hasExt ? safe : 'index.html');
    readFile(target).then((buf) => {
      res.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' });
      res.end(buf);
    }).catch(() => {
      readFile(join(dir, 'index.html')).then((buf) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(buf);
      }).catch(() => { res.writeHead(404); res.end('Not found.'); });
    });
  }
}

function body(req: IncomingMessage, fn: (data: unknown) => void): void {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    try { fn(raw ? JSON.parse(raw) : {}); } catch { fn({}); }
  });
}
