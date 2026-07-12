import React, { useState } from "react";
import { fmtAED } from "../engine/types";

export function Chip({ kind, children }: { kind: "pos" | "neg" | "neutral" | "gold"; children: React.ReactNode }) {
  return <span className={`chip ${kind}`}>{children}</span>;
}

export function DeltaChip({ value, suffix = "" }: { value: number; suffix?: string }) {
  const kind = value > 0 ? "pos" : value < 0 ? "neg" : "neutral";
  const arrow = value > 0 ? "↑" : value < 0 ? "↓" : "·";
  return (
    <span className={`chip ${kind}`}>
      {arrow} {Math.abs(value).toLocaleString("en-US")}
      {suffix}
    </span>
  );
}

export function Sparkline({ points, concerning = false }: { points: number[]; concerning?: boolean }) {
  if (points.length < 2) points = [0, ...points, 0];
  const w = 120, h = 32;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - 4 - ((p - min) / span) * (h - 8)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} aria-hidden>
      <path d={path} fill="none" stroke={concerning ? "#b8860b" : "#0F4C3A"} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={wide ? { maxWidth: 680 } : undefined} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function MoneyInput({
  value, onChange, max, context, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  max?: number;
  context?: string;
  placeholder?: string;
}) {
  return (
    <div className="money-input">
      <span className="prefix">AED</span>
      <input
        className="input"
        inputMode="numeric"
        placeholder={placeholder ?? "0"}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
      />
      {max !== undefined && <span className="ctx">of {fmtAED(max)}</span>}
      {context && <span className="ctx">{context}</span>}
    </div>
  );
}

/** Impulse-check confirm: fires warn flow if amount > 20% of spend balance. */
export function useImpulseCheck() {
  const [pending, setPending] = useState<{ label: string; amount: number; run: () => void } | null>(null);
  const check = (label: string, amount: number, spendBalance: number, run: () => void) => {
    if (amount > spendBalance * 0.2 && amount > 50) setPending({ label, amount, run });
    else run();
  };
  const dialog = pending ? (
    <Modal title="Big purchase — you sure?" onClose={() => setPending(null)}>
      <p>
        <b>{pending.label}</b> costs {fmtAED(pending.amount)} — that's over 20% of your current Spend
        balance. The 24-hour rule says most impulse buys don't survive a pause.
      </p>
      <div className="actions">
        <button className="btn" onClick={() => setPending(null)}>Let me think</button>
        <button
          className="btn primary"
          onClick={() => {
            pending.run();
            setPending(null);
          }}
        >
          Buy anyway
        </button>
      </div>
    </Modal>
  ) : null;
  return { check, dialog };
}

export function SimDisclaimer() {
  return (
    <p className="disclaimer">
      This is a simulation for learning. Not real investing or financial advice.
    </p>
  );
}
