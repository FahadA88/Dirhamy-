import React, { useState } from "react";
import { useGame } from "../state/GameContext";
import { FRIENDS, getFriend } from "../data/friends";
import { respondInvitation } from "../engine/engine";
import { fmtAED } from "../engine/types";

export default function Friends() {
  const { game, apply, pushNotice } = useGame();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  if (!game) return null;

  const pending = game.invitations.filter((i) => i.status === "pending");
  const past = game.invitations.filter((i) => i.status !== "pending").slice(0, 10);

  const send = (invId: string) => {
    const text = (drafts[invId] ?? "").trim();
    if (!text) { pushNotice("Type a reply first — anything you'd actually say."); return; }
    apply((prev) => {
      const res = respondInvitation(prev, invId, text);
      if (res.error) return res;
      const o = res.outcome!;
      const friend = getFriend(prev.invitations.find((i) => i.id === invId)!.friendId);
      return {
        state: res.state,
        notice: `${friend.name}: "${o.friendLine}" ${o.cost > 0 ? `(−${fmtAED(o.cost)})` : ""} Social ${o.socialDelta >= 0 ? "+" : ""}${o.socialDelta}.`,
      };
    });
    setDrafts((d) => ({ ...d, [invId]: "" }));
  };

  return (
    <div>
      <h2 style={{ fontSize: 28 }}>Friends</h2>
      <p className="muted mt8 mb24">
        Reply in your own words — a counter-offer, a cheaper plan, a kind no. What you say (and spend) shapes things.
      </p>

      <div className="city-grid mb24">
        {FRIENDS.map((f) => (
          <div className="card" key={f.id}>
            <div className="chat-card">
              <div className="f-avatar" style={{ background: f.color }}>{f.name[0]}</div>
              <div>
                <b>{f.name}</b>
                <p className="muted small">{f.archetype}</p>
                <p className="small mt8">
                  {game.friends[f.id].warmth >= 70 ? "Close these days" : game.friends[f.id].warmth >= 45 ? "Solid" : "A little distant lately"}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="section-head"><h2 style={{ fontSize: 20 }}>Invitations</h2></div>
      {pending.length === 0 && <p className="muted">Quiet week so far. Invitations arrive with each new sim-week{game.stats.social < 40 ? " — though friends have been inviting you less lately" : ""}.</p>}
      {pending.map((inv) => {
        const f = getFriend(inv.friendId);
        const draft = drafts[inv.id] ?? "";
        return (
          <div className="card mt16" key={inv.id}>
            <div className="chat-card">
              <div className="f-avatar" style={{ background: f.color }}>{f.name[0]}</div>
              <div style={{ flex: 1 }}>
                <b>{f.name}</b> <span className="muted small">· sim-week {inv.week}</span>
                <div className="bubble mt8">{inv.text}</div>
                <div className="reply-chips mt8">
                  <button className="reply-chip" onClick={() => setDrafts({ ...drafts, [inv.id]: "Yes, I'm in — let's do it!" })}>Accept as-is</button>
                  <button className="reply-chip" onClick={() => setDrafts({ ...drafts, [inv.id]: `How about something cheaper instead — maybe around AED ${inv.altCost}?` })}>Suggest cheaper alternative</button>
                  <button className="reply-chip" onClick={() => setDrafts({ ...drafts, [inv.id]: "Sorry, I can't this time — saving up. Next time for sure!" })}>Decline politely</button>
                </div>
                <div className="row mt8">
                  <input
                    className="input"
                    maxLength={200}
                    placeholder="Reply in your own words (200 chars)…"
                    value={draft}
                    onChange={(e) => setDrafts({ ...drafts, [inv.id]: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && send(inv.id)}
                  />
                  <button className="btn primary" onClick={() => send(inv.id)}>Send</button>
                </div>
                <p className="muted small mt8 money">Their plan costs {fmtAED(inv.cost)} · your Spend balance is {fmtAED(game.buckets.spend)}</p>
              </div>
            </div>
          </div>
        );
      })}

      {past.length > 0 && (
        <>
          <div className="section-head"><h2 style={{ fontSize: 20 }}>Recent history</h2></div>
          {past.map((inv) => (
            <div className="card mt8" key={inv.id}>
              <div className="row between">
                <span className="small"><b>{getFriend(inv.friendId).name}</b> — {inv.text}</span>
                <span className="chip neutral">{inv.status}</span>
              </div>
              {inv.resolution && <p className="muted small mt8">{inv.resolution}</p>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
