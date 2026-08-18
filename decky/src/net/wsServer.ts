import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { MatchService, Seat } from '../server/matchService';
import { Request, Response, TableEvent } from './protocol';
import { handle, mutates, eventFor } from './dispatch';
import { GameDefinition } from '../engine/types';
import { handleAuthor, canAuthor, AuthorRequest } from './authorEndpoint';

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
}

interface Table {
  matchId: string;
  code: string;
  sockets: Map<WebSocket, string | null>;   // socket -> seat it claims (null = spectator)
  open: boolean;                            // still accepting players
}

export class GameHost {
  readonly service = new MatchService();
  private tables = new Map<string, Table>();   // by invite code
  private byMatch = new Map<string, Table>();
  private queue: string[] = [];                // invite codes waiting for a quick-play partner
  private catalog: GameDefinition[];
  private wss?: WebSocketServer;
  private http?: ReturnType<typeof createServer>;

  constructor(opts: HostOptions = {}) {
    this.catalog = opts.catalog ?? [];
  }

  // ----- table lifecycle -----

  /** Open a table. Returns the invite code a person can read out. */
  openTable(definition: GameDefinition, seats: Seat[], gameId?: string): { matchId: string; code: string } {
    const summary = this.service.create(definition, gameId ?? definition.meta.id, seats);
    const table: Table = { matchId: summary.matchId, code: summary.inviteCode, sockets: new Map(), open: true };
    this.tables.set(table.code, table);
    this.byMatch.set(table.matchId, table);
    return { matchId: table.matchId, code: table.code };
  }

  /** Take an open seat at a table, by code. This is what an invite link resolves to. */
  join(code: string, name: string): { matchId: string; seat: string } | { error: string } {
    const table = this.tables.get(code.toUpperCase());
    if (!table) return { error: 'No table with that code.' };
    const seats = this.service.seats(table.matchId);
    // A bot seat is the vacancy: bots fill empty chairs until a person arrives to claim one.
    const free = seats.find((s) => s.kind === 'bot');
    if (!free) return { error: 'That table is full.' };
    this.service.setSeat(table.matchId, free.id, { kind: 'remote', name, connected: true });
    this.broadcast(table, { type: 'seats', matchId: table.matchId, at: Date.now() });
    return { matchId: table.matchId, seat: free.id };
  }

  /**
   * Public quick-play: take the oldest table still waiting, or open one and wait.
   * Deliberately the same join path — matchmaking is a way of finding a code, not a second
   * kind of game.
   */
  quickPlay(definition: GameDefinition, name: string, seatCount = 4): { matchId: string; seat: string; code: string; hosted: boolean } {
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
    return { matchId: t.matchId, seat: 'P1', code: t.code, hosted: true };
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

        if (req.kind === 'hello' && table) {
          table.sockets.set(sock, req.seat);
          if (req.seat) this.service.touch(req.matchId, req.seat, true);
        }

        const res: Response = handle(this.service, req);
        sock.send(JSON.stringify({ id: msg.id, body: res, reply: true }));

        if (res.ok && mutates(req) && table) {
          this.broadcast(table, eventFor(this.service, req));
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
    if (url.pathname === '/health') { json(200, { ok: true, tables: this.tables.size, canAuthor: canAuthor() }); return; }

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
    json(404, { error: 'Not found.' });
  }
}

function body(req: IncomingMessage, fn: (data: unknown) => void): void {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    try { fn(raw ? JSON.parse(raw) : {}); } catch { fn({}); }
  });
}
