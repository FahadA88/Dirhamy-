import React, { useState } from "react";
import { useGame } from "../state/GameContext";
import { donate } from "../engine/engine";
import { fmtAED, NISAB } from "../engine/types";
import { MoneyInput } from "../components/ui";

const CAUSES = ["Education", "Food security", "Medical aid", "Environmental"];

export default function Give() {
  const { game, apply } = useGame();
  const [cause, setCause] = useState(CAUSES[0]);
  const [amount, setAmount] = useState("");
  const [zakatAmount, setZakatAmount] = useState("");
  if (!game) return null;

  const zakatBase = game.buckets.save + game.buckets.investCash + game.holdings.reduce((a, h) => a + h.value, 0);
  const zakatDue = zakatBase > NISAB;
  const suggested = Math.round(zakatBase * 0.025);
  const givenTotal = game.txns.filter((t) => t.category === "Giving").reduce((a, t) => a - t.amount, 0);

  return (
    <div>
      <h2 style={{ fontSize: 28 }}>Give</h2>
      <p className="muted mt8 mb24 money">Total given so far: {fmtAED(givenTotal)}</p>

      <div className="grid2">
        <div className="card lg">
          <b>Charity donation</b>
          <p className="muted small mt8">Pick a cause, enter any amount. There are no preset buttons on purpose.</p>
          <label className="field mt16">Cause</label>
          <select className="input" value={cause} onChange={(e) => setCause(e.target.value)}>
            {CAUSES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <label className="field mt16">Amount</label>
          <MoneyInput value={amount} onChange={setAmount} max={game.buckets.spend} />
          <button
            className="btn primary mt16"
            onClick={() => {
              const err = apply((p) => donate(p, cause, parseInt(amount || "0", 10)));
              if (!err) setAmount("");
            }}
          >
            Donate
          </button>
        </div>

        {zakatDue && (
          <div className="card lg" style={{ borderColor: "#C9A961" }}>
            <b>Zakat</b>
            <p className="muted small mt8">
              Your Save + Invest holdings ({fmtAED(zakatBase)}) exceed the simplified nisab of {fmtAED(NISAB)}.
              The traditional rate is 2.5% — {fmtAED(suggested)} — but the amount is yours to decide.
            </p>
            <label className="field mt16">Amount</label>
            <MoneyInput value={zakatAmount} onChange={setZakatAmount} context={`2.5% ≈ ${fmtAED(suggested)}`} />
            <button
              className="btn gold mt16"
              onClick={() => {
                const err = apply((p) => donate(p, "Zakat", parseInt(zakatAmount || "0", 10), true));
                if (!err) setZakatAmount("");
              }}
            >
              Pay zakat
            </button>
            <p className="disclaimer">
              Zakat is a pillar of Islamic finance — a form of purification of wealth. This app shows a
              simplified educational version. Real zakat depends on specific circumstances and should
              involve knowledgeable guidance.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
