import React from "react";
import { Award, Flame } from "lucide-react";
import { useGame } from "../state/GameContext";
import { currentMonth, savingsRate, spendingByCategory, yearReview } from "../engine/engine";
import { fmtAED, WEEKS_PER_MONTH } from "../engine/types";

const STAT_WORDS = (v: number) => (v >= 70 ? "Comfortable" : v >= 45 ? "Okay" : v >= 30 ? "Low" : "Critical");
const STAT_KIND = (v: number) => (v >= 45 ? "pos" : "neg");

export default function HealthCheck() {
  const { game } = useGame();
  if (!game) return null;
  const m = currentMonth(game);
  const lastFull = Math.max(1, m - 1);
  const sr = savingsRate(game, lastFull);
  const invested = game.holdings.reduce((a, h) => a + h.value, 0);
  const byCat = spendingByCategory(game, Math.max(1, game.week - 12), game.week);
  const total = Object.values(byCat).reduce((a, b) => a + b, 0) || 1;
  const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  const insight =
    sr < 0
      ? "You spent more than you earned last month. One month is a wobble; two is a pattern — trim one optional category before it becomes three."
      : sr < 20
      ? `A ${sr}% savings rate keeps you afloat but builds slowly. Moving one habit — say, café runs — into Save would double your pace.`
      : invested === 0
      ? `Saving ${sr}% is strong — but cash under the mattress doesn't grow. Even the boring savings account beats zero.`
      : `Saving ${sr}% with ${fmtAED(invested)} invested is genuinely solid. The next lever is diversification — spread across more asset groups.`;

  return (
    <div>
      <h2 style={{ fontSize: 28 }}>Financial Health Check</h2>
      <p className="muted mt8 mb24">A fresh check-in lands every 3 sim-months; this view is always live.</p>

      <div className="metric-row">
        <div className="card metric-card">
          <div className="m-label">Savings rate (last full month)</div>
          <div className="m-value money">{sr}%</div>
        </div>
        <div className="card metric-card">
          <div className="m-label">Total invested</div>
          <div className="m-value money">{fmtAED(invested)}</div>
        </div>
        <div className="card metric-card">
          <div className="m-label">Streak</div>
          <div className="m-value money row"><Flame size={24} strokeWidth={1.5} color="#C9A961" /> {game.streakMonths} mo</div>
        </div>
      </div>

      <div className="card lg mt24">
        <b>Where the money went (last 3 months)</b>
        {sorted.length === 0 && <p className="muted mt8">No spending recorded yet.</p>}
        {sorted.map(([cat, amt]) => (
          <div key={cat} className="mt16">
            <div className="row between small"><span>{cat}</span><span className="money">{fmtAED(amt)} · {Math.round((amt / total) * 100)}%</span></div>
            <div className="progress mt8"><div style={{ width: `${(amt / total) * 100}%` }} /></div>
          </div>
        ))}
      </div>

      <div className="card lg mt24" style={{ background: "#0F4C3A", color: "#FAFAF7", border: "none" }}>
        <b>One thing worth knowing</b>
        <p className="mt8" style={{ lineHeight: 1.6 }}>{insight}</p>
      </div>

      <div className="section-head"><h2 style={{ fontSize: 20 }}>How life feels</h2><span className="muted small">The sim tracks these quietly; here's the weather report</span></div>
      <div className="stat-row">
        <span className={`chip ${STAT_KIND(game.stats.energy)}`}>Energy: {STAT_WORDS(game.stats.energy)}</span>
        <span className={`chip ${STAT_KIND(game.stats.wellbeing)}`}>Wellbeing: {STAT_WORDS(game.stats.wellbeing)}</span>
        <span className={`chip ${STAT_KIND(game.stats.social)}`}>Social: {STAT_WORDS(game.stats.social)}</span>
        <span className={`chip ${STAT_KIND(game.stats.community)}`}>Community: {STAT_WORDS(game.stats.community)}</span>
        <span className={`chip ${STAT_KIND(game.stats.lifestyle)}`}>Lifestyle: {STAT_WORDS(game.stats.lifestyle)}</span>
      </div>

      {game.lastDigest && (
        <>
          <div className="section-head"><h2 style={{ fontSize: 20 }}>Last week's digest</h2></div>
          <div className="card">
            {Object.keys(game.lastDigest.byCategory).length === 0 && <p className="muted">No spending last week.</p>}
            {Object.entries(game.lastDigest.byCategory).map(([cat, amt]) => {
              const prev = game.lastDigest!.prevByCategory[cat] ?? 0;
              const diff = prev > 0 ? Math.round(((amt - prev) / prev) * 100) : null;
              return (
                <p key={cat} className="small mt8 money">
                  {cat}: {fmtAED(amt)}
                  {diff !== null && <span className={`chip ${diff > 15 ? "neg" : "neutral"}`} style={{ marginLeft: 8 }}>{diff >= 0 ? "+" : ""}{diff}% vs week before</span>}
                </p>
              );
            })}
            {game.lastDigest.missedNews.map((mn, i) => (
              <p key={i} className="muted small mt8">{mn}</p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const ALL_BADGES = [
  { name: "First Investment", how: "Put money into any non-savings asset" },
  { name: "3-Month Streak", how: "Three consecutive months spending less than you earn" },
  { name: "Goal Reached", how: "Complete any saving goal" },
  { name: "Survived a Market Dip", how: "Stay invested through a market dip month" },
  { name: "Year One Complete", how: "Reach sim-month 13" },
];

export function Achievements() {
  const { game } = useGame();
  if (!game) return null;
  return (
    <div>
      <h2 style={{ fontSize: 28 }}>Achievements</h2>
      <p className="muted mt8 mb24 row">
        <Flame size={16} strokeWidth={1.5} color="#C9A961" />
        Current savings streak: {game.streakMonths} month{game.streakMonths === 1 ? "" : "s"} (best: {game.bestStreak})
      </p>
      <div className="city-grid">
        {ALL_BADGES.map((b) => {
          const earned = game.badges.includes(b.name);
          return (
            <div className="card" key={b.name} style={{ opacity: earned ? 1 : 0.55 }}>
              <div className="row between">
                <Award size={24} strokeWidth={1.5} color={earned ? "#C9A961" : "#6f6f68"} />
                {earned ? <span className="chip pos">Earned</span> : <span className="chip neutral">Locked</span>}
              </div>
              <b className="mt8" style={{ display: "block" }}>{b.name}</b>
              <p className="muted small mt8">{b.how}</p>
            </div>
          );
        })}
      </div>
      <p className="muted small mt24">That's the whole list — five badges, no points, no leaderboards. The real scoreboard is your net worth chart.</p>
    </div>
  );
}

export function YearInReview() {
  const { game } = useGame();
  if (!game) return null;
  const m = currentMonth(game);
  if (m < 13) {
    return (
      <div>
        <h2 style={{ fontSize: 28 }}>Year in Review</h2>
        <div className="card lg mt24">
          <p>
            Your first sim-year wraps at month 13 — you're in month {m}. The review will grade
            Savings, Diversification, Emergency Fund, Generosity, Skill Investment, Peer Balance and
            News Literacy. No single score; life doesn't average that neatly.
          </p>
          <div className="progress mt16"><div style={{ width: `${Math.min(100, (m / 13) * 100)}%` }} /></div>
        </div>
      </div>
    );
  }
  const { grades, netStart, netNow } = yearReview(game);
  const best = game.txns.filter((t) => t.category === "Learning" || t.category === "Investments").at(-1);
  const worst = game.txns.filter((t) => t.amount < -300 && (t.category === "Shopping" || t.category === "Social")).at(-1);
  return (
    <div>
      <h2 style={{ fontSize: 28 }}>Year in Review</h2>
      <div className="card lg mt24">
        <div className="hero-label">Net worth change over year one</div>
        <div className="hero-number money" style={{ fontSize: 40 }}>
          {fmtAED(netStart)} → {fmtAED(netNow)}
        </div>
        {best && <p className="small mt16"><b>A decision that aged well:</b> {best.label}</p>}
        {worst && <p className="small mt8"><b>One to think about:</b> {worst.label} ({fmtAED(worst.amount)})</p>}
      </div>
      <div className="city-grid mt24">
        {Object.entries(grades).map(([k, v]) => (
          <div className="card" key={k}>
            <div className="row between">
              <b>{k}</b>
              <span className="hero-number money" style={{ fontSize: 32 }}>{v.grade}</span>
            </div>
            <p className="muted small mt8">{v.note}</p>
          </div>
        ))}
      </div>
      <p className="muted small mt24">
        A report card, not a verdict. Every grade here moves with next year's habits.
      </p>
    </div>
  );
}
