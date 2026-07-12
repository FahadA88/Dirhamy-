import React, { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useGame } from "../state/GameContext";
import { AVATAR_COLORS } from "./Settings";

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M21.35 11.1H12v2.9h5.35c-.5 2.5-2.6 4.3-5.35 4.3a5.8 5.8 0 1 1 0-11.6c1.5 0 2.8.55 3.85 1.45l2.1-2.1A8.7 8.7 0 1 0 12 20.7c5 0 8.7-3.5 8.7-8.7 0-.3-.1-.6-.15-.9z" />
    </svg>
  );
}

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const { signIn, signUp, signInGoogle } = useGame();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const error = mode === "login" ? await signIn(email, password) : await signUp(email, password);
    if (error) setErr(error);
    else nav(mode === "login" ? "/app" : "/onboarding");
  };

  const google = async () => {
    await signInGoogle();
    nav("/app");
  };

  return (
    <div className="auth-split">
      <div className="auth-visual">
        <blockquote>
          "Financial independence isn't a number in an account. It's the quiet confidence of knowing
          you can handle whatever Tuesday brings."
        </blockquote>
        <cite>— Dirhamy, a simulator for exactly that</cite>
      </div>
      <div className="auth-form">
        <div className="auth-box">
          <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
          {err && <div className="auth-err">{err}</div>}
          <button className="btn" onClick={google}>
            <GoogleMark /> Continue with Google <span className="muted small">(demo)</span>
          </button>
          <div className="divider">or continue with email</div>
          <form onSubmit={submit}>
            <label className="field">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            <label className="field">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={mode === "signup" ? 6 : 1} />
            <button className="btn primary" type="submit">
              {mode === "login" ? "Log in" : "Get started"}
            </button>
          </form>
          <p className="muted small mt16">
            {mode === "login" ? (
              <>New here? <Link to="/signup">Create an account</Link></>
            ) : (
              <>Already have an account? <Link to="/login">Log in</Link></>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

const INTRO_SCREENS = [
  {
    title: "You're 16, living in the UAE.",
    body: "You've got a part-time job paying AED 2,000 a month. Your parents cover rent and food — everything else is on you: your phone, your fun, your future.",
  },
  {
    title: "The city is open.",
    body: "Shops, gigs, courses, friends, a weekly newspaper with tips that are only sometimes right. You get 5 actions per sim-week — time is a budget too.",
  },
  {
    title: "Every dirham compounds.",
    body: "Spend, save, invest — the sliders are yours. In a year of sim-time you'll see exactly what your habits build. No real money, real lessons.",
  },
];

export function Onboarding() {
  const { account, startGame } = useGame();
  const nav = useNavigate();
  const loc = useLocation();
  const presetMode = (loc.state as { mode?: "solo" | "live" } | null)?.mode;
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [mode, setMode] = useState<"solo" | "live">(presetMode ?? "solo");

  if (!account) return <Navigate to="/signup" replace />;

  // step 0: name+avatar, steps 1-3: intro, step 4: mode
  return (
    <div className="onboard">
      <div className="card lg">
        {step === 0 && (
          <>
            <h2 style={{ fontSize: 26, marginBottom: 16 }}>First, who's playing?</h2>
            <label className="field">Display name</label>
            <input className="input mb16" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={24} />
            <label className="field">Avatar color</label>
            <div className="swatches">
              {AVATAR_COLORS.map((c) => (
                <button key={c} className={`swatch ${color === c ? "sel" : ""}`} style={{ background: c }} onClick={() => setColor(c)} />
              ))}
            </div>
            <div className="actions" style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn primary" disabled={!name.trim()} onClick={() => setStep(1)}>Continue</button>
            </div>
          </>
        )}
        {step >= 1 && step <= 3 && (
          <>
            <p className="muted small mb8">{step} of 3</p>
            <h2 style={{ fontSize: 26, marginBottom: 16 }}>{INTRO_SCREENS[step - 1].title}</h2>
            <p style={{ lineHeight: 1.7 }}>{INTRO_SCREENS[step - 1].body}</p>
            <div className="actions" style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
              <button className="btn ghost" onClick={() => setStep(step - 1)}>Back</button>
              <button className="btn primary" onClick={() => setStep(step + 1)}>{step === 3 ? "Choose your mode" : "Next"}</button>
            </div>
          </>
        )}
        {step === 4 && (
          <>
            <h2 style={{ fontSize: 26, marginBottom: 16 }}>How do you want time to move?</h2>
            <div className="grid2">
              <button className="card hoverable" style={{ textAlign: "left", borderColor: mode === "solo" ? "#0F4C3A" : undefined, borderWidth: mode === "solo" ? 1 : 1 }} onClick={() => setMode("solo")}>
                <b>Solo Mode</b>
                <p className="muted small mt8">Turn-based. You click "Next Week" whenever you're ready. Good for thinking things through.</p>
                {mode === "solo" && <span className="chip pos mt8">Selected</span>}
              </button>
              <button className="card hoverable" style={{ textAlign: "left", borderColor: mode === "live" ? "#0F4C3A" : undefined }} onClick={() => setMode("live")}>
                <b>Live Mode</b>
                <p className="muted small mt8">1 real day = 1 sim-week. The world moves without you and you catch up on return. Like life.</p>
                {mode === "live" && <span className="chip pos mt8">Selected</span>}
              </button>
            </div>
            <div className="actions" style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
              <button className="btn ghost" onClick={() => setStep(3)}>Back</button>
              <button
                className="btn primary"
                onClick={() => {
                  startGame(name.trim(), color, mode);
                  nav("/app");
                }}
              >
                Start with AED 2,500
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
