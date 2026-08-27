import { useEffect, useRef, useState } from 'react';
import { GameDefinition } from '../engine/types';
import { Seat } from '../server/matchService';
import { useSettings } from '../settings/SettingsContext';
import { hostInfo, HostInfo } from '../net/host';
import { WebSocketApi, joinRemoteTable, openRemoteTable, quickPlay } from '../net/wsClient';
import { RemoteTableClient } from '../net/tableClient';

// Playing with other people.
//
// The transport and the host for this have existed and been tested since phase 3 — a real
// WebSocket server, invite codes, matchmaking, reconnection with backoff. What was missing was
// any way to reach it from the interface, so none of it was reachable by a person. This is that
// way in: host a table and read out the code, type somebody else's code, or be matched with
// whoever else is waiting.
//
// Everything here degrades to nothing when no host answers. A browser with no server behind it
// still plays every game against bots, and simply never offers to play with anybody.

type Stage = 'choose' | 'hosting' | 'joining' | 'waiting' | 'error';

export interface OnlineSession {
  client: RemoteTableClient;
  seat: string;
  code: string;
  seats: Seat[];
}

export function OnlineTable({ def, onStart, onCancel }: {
  def: GameDefinition;
  onStart: (session: OnlineSession) => void;
  onCancel: () => void;
}) {
  const { settings } = useSettings();
  const [host, setHost] = useState<HostInfo | null>(null);
  const [stage, setStage] = useState<Stage>('choose');
  const [code, setCode] = useState('');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [seatCount, setSeatCount] = useState(Math.max(2, def.meta.players.min));
  const [copied, setCopied] = useState(false);
  // Kept so leaving the screen closes the socket rather than orphaning it.
  const apiRef = useRef<WebSocketApi | null>(null);

  useEffect(() => { void hostInfo().then(setHost); }, []);
  useEffect(() => () => { apiRef.current?.close(); }, []);

  /** Connect, take the seat the host gave us, and read the opening position once. */
  async function enter(info: HostInfo, matchId: string, seat: string, inviteCode: string, token: string) {
    const api = new WebSocketApi(info.ws);
    apiRef.current = api;
    await api.identify(matchId, seat, token);
    const view = await api.view(matchId, seat);
    const legal = view.isYourTurn ? await api.legal(matchId, seat) : [];
    const summary = await api.summary(matchId);
    const client = new RemoteTableClient(matchId, api, seat, { matchId, view, legal });
    // The socket now belongs to the client, which closes it when the table ends.
    apiRef.current = null;
    onStart({ client, seat, code: inviteCode, seats: summary.seats });
  }

  async function doHost() {
    if (!host?.up) return;
    setStage('hosting');
    setError('');
    // One seat for us, the rest left open for people to take. A seat nobody claims is played
    // by a bot, so a table that never fills up still works.
    const seats: Seat[] = Array.from({ length: seatCount }, (_, i) => ({
      id: `P${i + 1}`,
      name: i === 0 ? settings.playerName : `Open ${i + 1}`,
      kind: i === 0 ? 'remote' : 'bot',
      difficulty: 'normal',
    }));
    const r = await openRemoteTable(host.base, def.meta.id, seats);
    if ('error' in r) { setError(r.error); setStage('error'); return; }
    setCode(r.code);
    setStage('waiting');
    try {
      await enter(host, r.matchId, 'P1', r.code, r.seatTokens.P1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the table.');
      setStage('error');
    }
  }

  async function doJoin() {
    if (!host?.up || typed.trim().length === 0) return;
    setStage('joining');
    setError('');
    const r = await joinRemoteTable(host.base, typed.trim().toUpperCase(), settings.playerName);
    if ('error' in r) { setError(r.error); setStage('error'); return; }
    try {
      await enter(host, r.matchId, r.seat, typed.trim().toUpperCase(), r.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the table.');
      setStage('error');
    }
  }

  async function doQuick() {
    if (!host?.up) return;
    setStage('joining');
    setError('');
    const r = await quickPlay(host.base, def.meta.id, settings.playerName, seatCount);
    if ('error' in r) { setError(r.error); setStage('error'); return; }
    setCode(r.code);
    try {
      await enter(host, r.matchId, r.seat, r.code, r.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the table.');
      setStage('error');
    }
  }

  function copyLink() {
    const link = `${window.location.origin}${window.location.pathname}?table=${code}`;
    void navigator.clipboard?.writeText(link).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => { /* a browser that will not copy is not worth an error */ },
    );
  }

  if (host === null) {
    return <Shell def={def} onCancel={onCancel}><p className="muted">Looking for a table host…</p></Shell>;
  }

  if (!host.up) {
    return (
      <Shell def={def} onCancel={onCancel}>
        <div className="online-none">
          <p className="on-mark" aria-hidden="true">⚡</p>
          <h3>No host is running</h3>
          <p className="muted">
            Playing with other people needs a server to referee. Everything else — every game,
            against bots or passing one device around — works without one.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell def={def} onCancel={onCancel}>
      {stage === 'error' && (
        <div className="online-error" role="alert">
          <b>That did not work.</b>
          <p className="muted">{error}</p>
          <button className="ghost sm" onClick={() => { setStage('choose'); setError(''); }}>Try again</button>
        </div>
      )}

      {stage === 'waiting' && (
        <div className="online-wait">
          <span className="muted">Your table is open. Read this out, or send the link.</span>
          <div className="invite-code" aria-label={`Invite code ${code.split('').join(' ')}`}>
            {code.split('').map((ch, i) => <span key={i}>{ch}</span>)}
          </div>
          <div className="invite-actions">
            <button className="ghost sm" onClick={copyLink}>{copied ? 'Copied' : 'Copy link'}</button>
          </div>
          <p className="muted">
            Any seat nobody takes is played by a bot, so you are never stuck waiting.
          </p>
        </div>
      )}

      {(stage === 'hosting' || stage === 'joining') && (
        <p className="muted">{stage === 'hosting' ? 'Opening a table…' : 'Joining…'}</p>
      )}

      {stage === 'choose' && (
        <div className="online-choices">
          <section className="online-card">
            <h4>Open a table</h4>
            <p className="muted">You get a code to give people.</p>
            <div className="field"><span>Seats</span>
              <div className="seg wrap">
                {Array.from(
                  { length: def.meta.players.max - def.meta.players.min + 1 },
                  (_, i) => def.meta.players.min + i,
                ).map((n) => (
                  <button key={n} className={seatCount === n ? 'on' : ''} onClick={() => setSeatCount(n)}>{n}</button>
                ))}
              </div>
            </div>
            <button className="primary" onClick={doHost}>Open it →</button>
          </section>

          <section className="online-card">
            <h4>Join a table</h4>
            <p className="muted">Type the code somebody gave you.</p>
            <input
              className="pref-text code-input"
              value={typed}
              maxLength={8}
              placeholder="ABCD"
              aria-label="Invite code"
              onChange={(e) => setTyped(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') void doJoin(); }}
            />
            <button className="primary" disabled={!typed.trim()} onClick={doJoin}>Join →</button>
          </section>

          <section className="online-card">
            <h4>Quick play</h4>
            <p className="muted">Be matched with whoever else is waiting for this game.</p>
            <button className="primary" onClick={doQuick}>Find a table →</button>
          </section>
        </div>
      )}
    </Shell>
  );
}

function Shell({ def, onCancel, children }: {
  def: GameDefinition; onCancel: () => void; children: React.ReactNode;
}) {
  return (
    <div className="online-setup">
      <div className="crumbs">
        <button className="ghost" onClick={onCancel}>← All games</button>
        <span className="crumb-title">{def.meta.name} · play with people</span>
      </div>
      <div className="panel glass">{children}</div>
    </div>
  );
}
