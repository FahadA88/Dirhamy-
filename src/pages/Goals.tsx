import React, { useState } from "react";
import { useGame } from "../state/GameContext";
import { addGoal, cancelGoal, cancelReservation, completeReservation } from "../engine/engine";
import { fmtAED } from "../engine/types";
import { MoneyInput } from "../components/ui";

export default function Goals() {
  const { game, apply } = useGame();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [weekly, setWeekly] = useState("");
  if (!game) return null;

  return (
    <div>
      <h2 style={{ fontSize: 28 }}>Goals & Reservations</h2>

      <div className="card lg mt24">
        <b>New saving goal</b>
        <p className="muted small mt8">Name it, set a target and a weekly amount — it funds itself from Spend each sim-week.</p>
        <div className="grid2 mt16">
          <div>
            <label className="field">Goal name</label>
            <input className="input" placeholder="e.g. New laptop fund" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="field">Target</label>
            <MoneyInput value={target} onChange={setTarget} />
          </div>
        </div>
        <div className="grid2 mt16">
          <div>
            <label className="field">Weekly amount</label>
            <MoneyInput value={weekly} onChange={setWeekly} context="/week" />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              className="btn primary"
              onClick={() => {
                const err = apply((p) => addGoal(p, name, parseInt(target || "0", 10), parseInt(weekly || "0", 10)));
                if (!err) { setName(""); setTarget(""); setWeekly(""); }
              }}
            >
              Create goal
            </button>
          </div>
        </div>
      </div>

      <div className="section-head"><h2 style={{ fontSize: 20 }}>Active goals</h2></div>
      {game.goals.length === 0 && <p className="muted">No goals yet. A goal is just a decision with a progress bar.</p>}
      <div className="city-grid">
        {game.goals.map((g) => (
          <div className="card" key={g.id}>
            <div className="row between">
              <b>{g.name}</b>
              {g.completedWeek ? <span className="chip pos">Done</span> : <span className="chip neutral money">{fmtAED(g.weeklyAmount)}/wk</span>}
            </div>
            <div className="progress mt16"><div style={{ width: `${Math.min(100, (g.saved / g.target) * 100)}%` }} /></div>
            <p className="small mt8 money">{fmtAED(g.saved)} of {fmtAED(g.target)}</p>
            {!g.completedWeek && (
              <button className="btn small mt8" onClick={() => apply((p) => cancelGoal(p, g.id))}>Remove</button>
            )}
          </div>
        ))}
      </div>

      <div className="section-head"><h2 style={{ fontSize: 20 }}>Reservations</h2><span className="muted small">Max 3 · started from any item over AED 300</span></div>
      {game.reservations.length === 0 && <p className="muted">Nothing reserved. Find something over AED 300 in the shops and choose "Reserve & Save".</p>}
      <div className="city-grid">
        {game.reservations.map((r) => {
          const price = r.salePrice ?? r.price;
          const ready = r.saved >= price;
          return (
            <div className="card" key={r.id}>
              <div className="row between">
                <b>{r.itemName}</b>
                {r.salePrice && <span className="chip gold">On sale — {fmtAED(r.salePrice)}</span>}
              </div>
              <div className={`progress mt16 ${r.salePrice ? "gold" : ""}`}><div style={{ width: `${Math.min(100, (r.saved / price) * 100)}%` }} /></div>
              <p className="small mt8 money">{fmtAED(r.saved)} of {fmtAED(price)} · {fmtAED(r.weeklyAmount)}/week</p>
              <div className="item-actions mt8">
                {ready && <button className="btn primary small" onClick={() => apply((p) => completeReservation(p, r.id))}>Buy it</button>}
                <button className="btn small" onClick={() => apply((p) => cancelReservation(p, r.id))}>Cancel (refund to Spend)</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
