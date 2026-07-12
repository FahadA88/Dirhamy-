import React from "react";
import { useGame } from "../state/GameContext";
import { GIGS, COURSES } from "../data/gigsCourses";
import { doGig, currentMonth, buyCourse } from "../engine/engine";
import { fmtAED, MONTHLY_SALARY, WEEKS_PER_MONTH } from "../engine/types";

export default function Work() {
  const { game, apply } = useGame();
  if (!game) return null;
  const m = currentMonth(game);
  const gigIncome = game.txns
    .filter((t) => t.category === "Gig income" && t.week > (m - 1) * WEEKS_PER_MONTH)
    .reduce((a, t) => a + t.amount, 0);

  return (
    <div>
      <h2 style={{ fontSize: 28 }}>Work & Gigs</h2>
      <div className="grid2 mt24">
        <div className="card">
          <b>Main job</b>
          <p className="muted small mt8">Part-time retail associate</p>
          <p className="mt8 money" style={{ fontSize: 22, fontFamily: "Fraunces, serif", fontWeight: 300 }}>
            {fmtAED(game.flags.newJob ? 2800 : MONTHLY_SALARY)}<span className="muted small"> /month</span>
          </p>
          {game.flags.newJob && <span className="chip gold">New job in another emirate — higher pay, higher costs</span>}
          {(game.stats.energy < 30 || game.stats.wellbeing < 30) && (
            <p className="chip neg mt8">Running on empty — salary takes a 10% hit until you recover</p>
          )}
        </div>
        <div className="card">
          <b>Gig income this month</b>
          <p className="mt8 money" style={{ fontSize: 22, fontFamily: "Fraunces, serif", fontWeight: 300 }}>{fmtAED(gigIncome)}</p>
          <p className="muted small mt8">{game.actionsLeft} action{game.actionsLeft === 1 ? "" : "s"} left this week</p>
        </div>
      </div>

      <div className="section-head"><h2 style={{ fontSize: 20 }}>This week's gig board</h2><span className="muted small">Refreshes every sim-week</span></div>
      <div className="city-grid">
        {game.gigBoard.map((id) => {
          const g = GIGS.find((x) => x.id === id)!;
          const needsCourse = g.requiresCourse && !game.coursesOwned.includes(g.requiresCourse);
          const done = game.gigsThisWeek.includes(id);
          return (
            <div className="card hoverable" key={id}>
              <div className="row between">
                <b>{g.name}</b>
                <span className="chip pos money">{g.pay[0] === g.pay[1] ? fmtAED(g.pay[0]) : `${fmtAED(g.pay[0])}–${fmtAED(g.pay[1])}`}</span>
              </div>
              <p className="muted small mt8">{g.blurb}</p>
              <p className="small mt8">{g.actions} action{g.actions > 1 ? "s" : ""}{g.alwaysAvailable ? " · always available" : ""}</p>
              {needsCourse ? (
                <span className="chip neutral mt8">Requires {COURSES.find((c) => c.id === g.requiresCourse)?.name}</span>
              ) : (
                <button className="btn primary small mt16" disabled={done || game.actionsLeft < g.actions} onClick={() => apply((p) => doGig(p, id))}>
                  {done ? "Done this week" : "Take the gig"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Learn() {
  const { game, apply } = useGame();
  if (!game) return null;
  return (
    <div>
      <h2 style={{ fontSize: 28 }}>Learn</h2>
      <p className="muted mt8 mb24">
        One-time purchases that permanently unlock better-paid work. Real bets: they only pay off if you use them.
      </p>
      <div className="city-grid">
        {COURSES.map((c) => {
          const owned = game.coursesOwned.includes(c.id);
          return (
            <div className="card hoverable" key={c.id}>
              <div className="row between">
                <b>{c.name}</b>
                {owned ? <span className="chip pos">Completed</span> : <span className="chip neutral money">{fmtAED(c.price)}</span>}
              </div>
              <p className="muted small mt8">{c.blurb}</p>
              <p className="small mt8"><b>Unlocks:</b> {c.unlocks}</p>
              <p className="muted small mt8">{c.payback}</p>
              {!owned && (
                <button className="btn primary small mt16" onClick={() => apply((p) => buyCourse(p, c.id))}>
                  Enrol — {fmtAED(c.price)}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
