import React, { useState } from "react";
import { Lock } from "lucide-react";
import { useGame } from "../state/GameContext";
import { ASSETS, TIER_RULES, tierUnlocked } from "../data/investments";
import { fmtAED, monthOf, netWorth } from "../engine/types";
import { invest, sellInvestment, transferBuckets } from "../engine/engine";
import { Modal, MoneyInput, SimDisclaimer } from "../components/ui";

export default function Investments() {
  const { game, apply } = useGame();
  const [investing, setInvesting] = useState<string | null>(null);
  const [selling, setSelling] = useState<string | null>(null);
  const [riskConfirm, setRiskConfirm] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [topup, setTopup] = useState("");
  if (!game) return null;

  const m = monthOf(game.week);
  const nw = netWorth(game);
  const holding = (id: string) => game.holdings.find((h) => h.assetId === id);

  const startInvest = (assetId: string) => {
    const def = ASSETS.find((a) => a.id === assetId)!;
    if (def.riskWarning && !holding(assetId)?.invested) setRiskConfirm(assetId);
    else { setAmount(""); setInvesting(assetId); }
  };

  const confirmInvest = () => {
    if (!investing) return;
    const err = apply((p) => invest(p, investing, parseInt(amount || "0", 10)));
    if (!err) setInvesting(null);
  };
  const confirmSell = () => {
    if (!selling) return;
    const err = apply((p) => sellInvestment(p, selling, parseInt(amount || "0", 10)));
    if (!err) setSelling(null);
  };

  return (
    <div>
      <h2 style={{ fontSize: 28 }}>Investments</h2>
      <div className="row mt8" style={{ flexWrap: "wrap" }}>
        <span className="chip neutral money">Invest bucket: {fmtAED(game.buckets.investCash)}</span>
        <span className="chip neutral money">Invested: {fmtAED(game.holdings.reduce((a, h) => a + h.value, 0))}</span>
        <span className="chip neutral money">Net worth: {fmtAED(nw)}</span>
      </div>

      <div className="card mt16">
        <b>Top up your Invest bucket from Save</b>
        <div className="row mt8" style={{ maxWidth: 420 }}>
          <MoneyInput value={topup} onChange={setTopup} max={game.buckets.save} />
          <button
            className="btn"
            onClick={() => {
              apply((p) => transferBuckets(p, "save", "investCash", parseInt(topup || "0", 10)));
              setTopup("");
            }}
          >
            Move
          </button>
        </div>
        <p className="muted small mt8">New income is allocated on the Dashboard with the Spend / Save / Invest sliders.</p>
      </div>

      {[1, 2, 3, 4].map((tier) => {
        const rule = TIER_RULES.find((r) => r.tier === tier)!;
        const unlocked = tierUnlocked(tier as 1 | 2 | 3 | 4, m, nw);
        return (
          <div key={tier}>
            <div className="section-head">
              <h2 style={{ fontSize: 20 }}>
                Tier {tier} {!unlocked && <Lock size={16} strokeWidth={1.5} style={{ marginLeft: 8 }} />}
              </h2>
              <span className="muted small">{rule.label}</span>
            </div>
            <div className="city-grid">
              {ASSETS.filter((a) => a.tier === tier).map((a) => {
                const h = holding(a.id);
                const locked = h?.lockedUntilWeek && h.lockedUntilWeek > game.week;
                return (
                  <div className="card hoverable" key={a.id} style={{ opacity: unlocked ? 1 : 0.5 }}>
                    <div className="row between">
                      <b>{a.name}</b>
                      {a.halal && <span className="chip pos">Halal</span>}
                    </div>
                    <p className="muted small mt8">{a.blurb}</p>
                    <p className="small mt8 money">
                      Avg {a.avgMoPct}%/mo · range {a.minMoPct}% to {a.maxMoPct}%
                      {a.lockMonths ? ` · locked ${a.lockMonths} mo` : ""}
                    </p>
                    {h && h.value > 0 && (
                      <p className="mt8 money">
                        <b>{fmtAED(h.value)}</b>{" "}
                        <span className={`chip ${h.value >= h.invested ? "pos" : "neg"}`}>
                          {h.value >= h.invested ? "+" : "−"}{fmtAED(Math.abs(h.value - h.invested)).replace("AED ", "AED ")}
                        </span>
                        {locked && <span className="chip neutral">locked until wk {h.lockedUntilWeek}</span>}
                      </p>
                    )}
                    {unlocked ? (
                      <div className="item-actions mt16">
                        <button className="btn primary small" onClick={() => startInvest(a.id)}>Invest</button>
                        {h && h.value > 0 && (
                          <button className="btn small" disabled={!!locked} onClick={() => { setAmount(""); setSelling(a.id); }}>Sell</button>
                        )}
                      </div>
                    ) : (
                      <p className="chip neutral mt16">{rule.label}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <SimDisclaimer />

      {riskConfirm && (
        <Modal title="High-risk asset" onClose={() => setRiskConfirm(null)}>
          <p>
            The crypto fund can swing from −12% to +15% in a single sim-month. Money you might need
            soon doesn't belong here. Diversified boring things usually win over a year.
          </p>
          <div className="actions">
            <button className="btn" onClick={() => setRiskConfirm(null)}>Step back</button>
            <button className="btn primary" onClick={() => { setAmount(""); setInvesting(riskConfirm); setRiskConfirm(null); }}>
              I understand the risk
            </button>
          </div>
        </Modal>
      )}

      {investing && (
        <Modal title={`Invest in ${ASSETS.find((a) => a.id === investing)?.name}`} onClose={() => setInvesting(null)}>
          <label className="field">Amount — any figure up to your Invest bucket</label>
          <MoneyInput value={amount} onChange={setAmount} max={game.buckets.investCash} />
          <SimDisclaimer />
          <div className="actions">
            <button className="btn" onClick={() => setInvesting(null)}>Cancel</button>
            <button className="btn primary" onClick={confirmInvest}>Invest</button>
          </div>
        </Modal>
      )}
      {selling && (
        <Modal title={`Sell ${ASSETS.find((a) => a.id === selling)?.name}`} onClose={() => setSelling(null)}>
          <label className="field">Amount to sell back to Invest cash</label>
          <MoneyInput value={amount} onChange={setAmount} max={holding(selling)?.value ?? 0} />
          <div className="actions">
            <button className="btn" onClick={() => setSelling(null)}>Cancel</button>
            <button className="btn primary" onClick={confirmSell}>Sell</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
