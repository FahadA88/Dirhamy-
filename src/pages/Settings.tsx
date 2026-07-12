import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGame } from "../state/GameContext";
import { Modal } from "../components/ui";

export const AVATAR_COLORS = ["#0F4C3A", "#C9A961", "#5B7268", "#8A6A1F", "#1A1A1A", "#3D6B58"];

export default function Settings() {
  const { game, account, resetGame, signOut, updateProfile, pushNotice } = useGame();
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"solo" | "live" | null>(null);
  const nav = useNavigate();
  if (!game || !account) return null;

  return (
    <div>
      <h2 style={{ fontSize: 28 }}>Account & Settings</h2>

      <div className="card lg mt24">
        <b>Profile</b>
        <label className="field mt16">Display name</label>
        <input className="input" value={game.displayName} onChange={(e) => updateProfile({ displayName: e.target.value })} style={{ maxWidth: 320 }} />
        <label className="field mt16">Avatar color</label>
        <div className="swatches">
          {AVATAR_COLORS.map((c) => (
            <button key={c} className={`swatch ${game.avatarColor === c ? "sel" : ""}`} style={{ background: c }} onClick={() => updateProfile({ avatarColor: c })} />
          ))}
        </div>
      </div>

      <div className="card lg mt24">
        <b>Connected account</b>
        <p className="muted small mt8">
          {account.provider === "google" ? "Google (demo sign-in)" : "Email & password"} — {account.email}
        </p>
      </div>

      <div className="card lg mt24">
        <b>Mode</b>
        <p className="muted small mt8">
          Currently <b>{game.mode === "solo" ? "Solo (turn-based)" : "Live (1 real day = 1 sim-week)"}</b>.
          Switching modes resets your current run.
        </p>
        <div className="row mt16">
          <button className="btn" disabled={game.mode === "solo"} onClick={() => setConfirmMode("solo")}>Switch to Solo</button>
          <button className="btn" disabled={game.mode === "live"} onClick={() => setConfirmMode("live")}>Switch to Live</button>
        </div>
      </div>

      <div className="card lg mt24" style={{ borderColor: "#b8860b" }}>
        <b>Reset simulation</b>
        <p className="muted small mt8">Wipes balances, investments, history, badges — everything. Starts over at week 1 with AED 2,500.</p>
        <button className="btn mt16" onClick={() => setConfirmReset(true)}>Reset simulation…</button>
      </div>

      <button className="btn mt24" onClick={() => { signOut(); nav("/"); }}>Sign out</button>

      {confirmReset && (
        <Modal title="Reset everything?" onClose={() => setConfirmReset(false)}>
          <p>This deletes your entire run. There's no undo — just like real bankruptcy, minus the paperwork.</p>
          <div className="actions">
            <button className="btn" onClick={() => setConfirmReset(false)}>Keep my run</button>
            <button className="btn primary" onClick={() => { resetGame(); nav("/onboarding"); }}>Reset</button>
          </div>
        </Modal>
      )}
      {confirmMode && (
        <Modal title={`Switch to ${confirmMode === "solo" ? "Solo" : "Live"} mode?`} onClose={() => setConfirmMode(null)}>
          <p>Switching modes resets your current run and starts a fresh simulation in {confirmMode === "solo" ? "turn-based Solo" : "auto-advancing Live"} mode.</p>
          <div className="actions">
            <button className="btn" onClick={() => setConfirmMode(null)}>Cancel</button>
            <button className="btn primary" onClick={() => { resetGame(); pushNotice("Run reset — set up your new simulation."); nav("/onboarding", { state: { mode: confirmMode } }); }}>
              Switch & reset
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
