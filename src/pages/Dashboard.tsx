import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Inbox, Loader, Trophy, CalendarClock, Wallet, Newspaper, Users, AlertCircle,
  SlidersHorizontal, Filter, Receipt,
} from "lucide-react";
import { useGame } from "../state/GameContext";
import { fmtAED, monthOf, netWorth, GameState, WEEKS_PER_MONTH } from "../engine/types";
import {
  allocateIncome, currentMonth, monthSpending, resolveEventAmount,
  resolveEventChoice, savingsRate,
} from "../engine/engine";
import { EVENT_DECK, DILEMMAS } from "../data/events";
import { TIER_RULES, tierUnlocked } from "../data/investments";
import { DeltaChip, Modal, MoneyInput, Sparkline } from "../components/ui";
import { getFriend } from "../data/friends";

export default function Dashboard() {
  const { game } = useGame();
  if (!game) return null;
  return (
    <>
      <AwaySummary />
      <Hero game={game} />
      <MetricRow game={game} />
      {game.pendingIncome > 0 && <AllocationCard />}
      <PayslipCard />
      <ThisWeek game={game} />
    </>
  );
}

function Hero({ game }: { game: GameState }) {
  const nw = netWorth(game);
  const lastMonthEndWeek = (monthOf(game.week) - 1) * WEEKS_PER_MONTH;
  const prev = game.history.filter((h) => h.week <= lastMonthEndWeek).at(-1)?.netWorth ?? nw;
  return (
    <div>
      <div className="row between">
        <div>
          <div className="hero-label">Your net worth</div>
          <div className="row" style={{ gap: 16 }}>
            <div className="hero-number money">{fmtAED(nw)}</div>
            <DeltaChip value={Math.round(nw - prev)} suffix=" vs last month" />
          </div>
          <div className="muted small mt8">
            Sim-week {game.week} · Month {monthOf(game.week)} · {game.actionsLeft} action{game.actionsLeft === 1 ? "" : "s"} left this week
          </div>
        </div>
        <div className="row">
          <button className="btn small"><SlidersHorizontal size={16} strokeWidth={1.5} /> Select period</button>
          <button className="btn small"><Filter size={16} strokeWidth={1.5} /> Filter</button>
        </div>
      </div>
    </div>
  );
}

function MetricRow({ game }: { game: GameState }) {
  const m = currentMonth(game);
  const sr = savingsRate(game, Math.max(1, m - 1));
  const srPrev = savingsRate(game, Math.max(1, m - 2));
  const invested = game.holdings.reduce((a, h) => a + h.value, 0);
  const investedIn = game.holdings.reduce((a, h) => a + h.invested, 0);
  const growth = invested - investedIn;
  const spentThisMonth = monthSpending(game, m);
  const spentLastMonth = monthSpending(game, Math.max(1, m - 1));
  const nwHist = game.history.map((h) => h.netWorth);
  const invHist = game.history.map((h) => h.invested);
  const spendHist = game.history.map((h) => h.spentThisWeek);

  return (
    <div className="metric-row">
      <div className="card metric-card">
        <div className="m-label">Savings rate</div>
        <div className="m-value money">{sr}%</div>
        <div className="row between">
          <DeltaChip value={sr - srPrev} suffix=" pts" />
          <Sparkline points={nwHist.slice(-12)} concerning={sr < 0} />
        </div>
      </div>
      <div className="card metric-card">
        <div className="m-label">Investment growth</div>
        <div className="m-value money">{fmtAED(growth)}</div>
        <div className="row between">
          <DeltaChip value={Math.round(growth)} />
          <Sparkline points={invHist.slice(-12)} concerning={growth < 0} />
        </div>
      </div>
      <div className="card metric-card">
        <div className="m-label">Spending pace</div>
        <div className="m-value money">{fmtAED(spentThisMonth)}</div>
        <div className="row between">
          <DeltaChip value={Math.round(spentThisMonth - spentLastMonth)} suffix=" vs last mo" />
          <Sparkline points={spendHist.slice(-12)} concerning={spentThisMonth > spentLastMonth * 1.3 && spentLastMonth > 0} />
        </div>
      </div>
    </div>
  );
}

function AllocationCard() {
  const { game, apply } = useGame();
  const total = game?.pendingIncome ?? 0;
  const [spendPct, setSpendPct] = useState(50);
  const [savePct, setSavePct] = useState(30);
  const investPct = Math.max(0, 100 - spendPct - savePct);
  if (!game || total <= 0) return null;

  const amounts = {
    spend: Math.round((total * spendPct) / 100),
    save: Math.round((total * savePct) / 100),
  };
  const investAmt = total - amounts.spend - amounts.save;

  const setS = (v: number) => {
    setSpendPct(v);
    if (v + savePct > 100) setSavePct(100 - v);
  };
  const setV = (v: number) => setSavePct(Math.min(v, 100 - spendPct));

  return (
    <div className="card lg mt24" style={{ borderColor: "#C9A961" }}>
      <div className="row between mb16">
        <h2 style={{ fontSize: 22 }}>Allocate {fmtAED(total)}</h2>
        <span className="chip gold">Suggested 50 / 30 / 20</span>
      </div>
      <div className="alloc-row">
        <label>Spend</label>
        <input type="range" min={0} max={100} value={spendPct} onChange={(e) => setS(+e.target.value)} />
        <span className="val money">{fmtAED(amounts.spend)}</span>
      </div>
      <div className="alloc-row">
        <label>Save</label>
        <input type="range" min={0} max={100} value={savePct} onChange={(e) => setV(+e.target.value)} />
        <span className="val money">{fmtAED(amounts.save)}</span>
      </div>
      <div className="alloc-row">
        <label>Invest</label>
        <input type="range" min={0} max={100} value={investPct} disabled />
        <span className="val money">{fmtAED(investAmt)}</span>
      </div>
      <div className="actions" style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          className="btn primary"
          onClick={() => apply((p) => allocateIncome(p, amounts.spend, amounts.save, investAmt))}
        >
          Confirm allocation
        </button>
      </div>
    </div>
  );
}

function PayslipCard() {
  const { game } = useGame();
  const [open, setOpen] = useState(false);
  const p = game?.lastPayslip;
  if (!game || !p || p.month !== currentMonth(game) - 1) return null;
  return (
    <>
      <button className="btn mt16" onClick={() => setOpen(true)}>
        <Receipt size={16} strokeWidth={1.5} /> View payslip — month {p.month}
      </button>
      {open && (
        <Modal title={`Payslip — sim-month ${p.month}`} onClose={() => setOpen(false)}>
          <table className="plain">
            <tbody>
              <tr><td>Gross salary {p.bonusNote && <span className="chip neutral">{p.bonusNote}</span>}{p.statPenalty && <span className="chip neg">−10% low energy/wellbeing</span>}</td><td className="num money">{fmtAED(p.gross)}</td></tr>
              <tr><td>End-of-service contribution <span className="muted small">(educational simplification)</span></td><td className="num money">−{fmtAED(p.eos)}</td></tr>
              {p.bills.map((b) => (
                <tr key={b.label}><td>{b.label}</td><td className="num money">−{fmtAED(b.amount)}</td></tr>
              ))}
              {p.bnpl > 0 && <tr><td>BNPL instalments</td><td className="num money">−{fmtAED(p.bnpl)}</td></tr>}
              <tr><td><b>Net pay deposited</b></td><td className="num money"><b>{fmtAED(p.net)}</b></td></tr>
              <tr><td className="muted">Estimated VAT inside last month's spending (5%)</td><td className="num money muted">{fmtAED(p.vatEstimate)}</td></tr>
            </tbody>
          </table>
          <div className="actions"><button className="btn primary" onClick={() => setOpen(false)}>Done</button></div>
        </Modal>
      )}
    </>
  );
}

function AwaySummary() {
  const { game, dismissAwaySummary } = useGame();
  if (!game?.awaySummary?.length) return null;
  return (
    <Modal title="While you were away" onClose={dismissAwaySummary}>
      {game.awaySummary.map((l, i) => (
        <p key={i} className={i === 0 ? "mb16" : "small muted mb8"}>{l}</p>
      ))}
      <div className="actions">
        <button className="btn primary" onClick={dismissAwaySummary}>Caught up</button>
      </div>
    </Modal>
  );
}

// ---------------- kanban ----------------

function ThisWeek({ game }: { game: GameState }) {
  const nav = useNavigate();
  const [openEvent, setOpenEvent] = useState<string | null>(null);

  const pendingInvites = game.invitations.filter((i) => i.status === "pending");
  const pendingEvents = game.pendingEvents.filter((e) => !e.resolved);
  const unreadNews = game.news.filter((n) => !n.read && n.editionWeek === game.week);
  const m = currentMonth(game);
  const nw = netWorth(game);

  const wins: { title: string; meta: string }[] = [];
  for (const g of game.goals.filter((g) => g.completedWeek && g.completedWeek >= game.week - 4))
    wins.push({ title: `Goal reached: ${g.name}`, meta: fmtAED(g.target) });
  for (const b of game.badges.slice(-2)) wins.push({ title: `Badge: ${b}`, meta: "Achievement" });
  const invGrowth = game.holdings.reduce((a, h) => a + h.value - h.invested, 0);
  if (invGrowth > 0) wins.push({ title: "Investments in the green", meta: `+${fmtAED(invGrowth)} overall` });
  for (const c of game.coursesOwned.slice(-1)) wins.push({ title: "Course completed", meta: c });

  const upcoming: { title: string; meta: string }[] = [];
  const weeksToPayday = WEEKS_PER_MONTH - ((game.week - 1) % WEEKS_PER_MONTH);
  upcoming.push({ title: "Payday", meta: `in ${weeksToPayday} sim-week${weeksToPayday > 1 ? "s" : ""}` });
  upcoming.push({ title: "New edition of The Daily", meta: "next sim-week" });
  for (const r of TIER_RULES) {
    if (!tierUnlocked(r.tier, m, nw) && r.tier > 1) {
      upcoming.push({ title: `Investment Tier ${r.tier}`, meta: r.label });
      break;
    }
  }
  if (game.flags.jobOfferExpiresWeek && game.flags.jobOfferExpiresWeek >= game.week)
    upcoming.push({ title: "Job offer pending", meta: `decide by week ${game.flags.jobOfferExpiresWeek}` });

  return (
    <>
      <div className="section-head">
        <h2>This week</h2>
        <button className="link" onClick={() => nav("/app/health")}>View all</button>
      </div>
      <div className="kanban">
        <div className="kanban-col">
          <div className="k-head"><Inbox size={16} strokeWidth={1.5} /> Decisions waiting <span className="k-count">{pendingInvites.length + pendingEvents.length + (unreadNews.length ? 1 : 0)}</span></div>
          {pendingEvents.map((e) => {
            const def = [...EVENT_DECK, ...DILEMMAS].find((d) => d.id === e.id);
            return (
              <div className="k-card" key={e.id} onClick={() => setOpenEvent(e.id)} style={{ cursor: "pointer" }}>
                <div className="k-top"><AlertCircle size={16} strokeWidth={1.5} /><span className="chip gold">{e.kind === "dilemma" ? "Dilemma" : "Event"}</span></div>
                <div className="k-title">{def?.title}</div>
                <div className="k-meta">Month {e.month} · tap to decide</div>
              </div>
            );
          })}
          {pendingInvites.map((i) => (
            <div className="k-card" key={i.id} onClick={() => nav("/app/friends")} style={{ cursor: "pointer" }}>
              <div className="k-top"><Users size={16} strokeWidth={1.5} /><span className="chip neutral">Invite</span></div>
              <div className="k-title">{getFriend(i.friendId).name}: {i.text}</div>
              <div className="k-meta">Reply on the Friends page</div>
            </div>
          ))}
          {unreadNews.length > 0 && (
            <div className="k-card" onClick={() => nav("/app/daily")} style={{ cursor: "pointer" }}>
              <div className="k-top"><Newspaper size={16} strokeWidth={1.5} /><span className="chip neutral">News</span></div>
              <div className="k-title">{unreadNews.length} unread stor{unreadNews.length === 1 ? "y" : "ies"} in this week's Daily</div>
              <div className="k-meta">Discounts & forecasts hide in there</div>
            </div>
          )}
        </div>

        <div className="kanban-col">
          <div className="k-head"><Loader size={16} strokeWidth={1.5} /> In progress <span className="k-count">{game.reservations.length + game.goals.filter((g) => !g.completedWeek).length + game.bnpl.length + game.ventures.length}</span></div>
          {game.reservations.map((r) => (
            <div className="k-card" key={r.id} onClick={() => nav("/app/goals")} style={{ cursor: "pointer" }}>
              <div className="k-top"><Wallet size={16} strokeWidth={1.5} /><span className="chip neutral">Reservation</span></div>
              <div className="k-title">{r.itemName}</div>
              <div className="progress"><div style={{ width: `${Math.min(100, (r.saved / (r.salePrice ?? r.price)) * 100)}%` }} /></div>
              <div className="k-meta money">{fmtAED(r.saved)} of {fmtAED(r.salePrice ?? r.price)}{r.salePrice ? " · on sale!" : ""}</div>
            </div>
          ))}
          {game.goals.filter((g) => !g.completedWeek).map((g) => (
            <div className="k-card" key={g.id} onClick={() => nav("/app/goals")} style={{ cursor: "pointer" }}>
              <div className="k-top"><Wallet size={16} strokeWidth={1.5} /><span className="chip neutral">Goal</span></div>
              <div className="k-title">{g.name}</div>
              <div className="progress"><div style={{ width: `${Math.min(100, (g.saved / g.target) * 100)}%` }} /></div>
              <div className="k-meta money">{fmtAED(g.saved)} of {fmtAED(g.target)}</div>
            </div>
          ))}
          {game.bnpl.map((p) => (
            <div className="k-card" key={p.id}>
              <div className="k-top"><Wallet size={16} strokeWidth={1.5} /><span className="chip neg">BNPL debt</span></div>
              <div className="k-title">{p.itemName}</div>
              <div className="k-meta money">{p.remaining} × {fmtAED(p.monthly)} remaining</div>
            </div>
          ))}
          {game.ventures.map((v, i) => (
            <div className="k-card" key={i}>
              <div className="k-top"><Loader size={16} strokeWidth={1.5} /><span className="chip neutral">Venture</span></div>
              <div className="k-title">{v.label}</div>
              <div className="k-meta money">{fmtAED(v.amount)} staked · resolves week {v.resolveWeek}</div>
            </div>
          ))}
        </div>

        <div className="kanban-col">
          <div className="k-head"><Trophy size={16} strokeWidth={1.5} /> Recent wins <span className="k-count">{wins.length}</span></div>
          {wins.length === 0 && <div className="k-card"><div className="k-title muted">Wins land here — save, invest, finish goals.</div></div>}
          {wins.slice(0, 5).map((w, i) => (
            <div className="k-card" key={i}>
              <div className="k-top"><Trophy size={16} strokeWidth={1.5} /><span className="chip pos">Win</span></div>
              <div className="k-title">{w.title}</div>
              <div className="k-meta">{w.meta}</div>
            </div>
          ))}
        </div>

        <div className="kanban-col">
          <div className="k-head"><CalendarClock size={16} strokeWidth={1.5} /> Upcoming <span className="k-count">{upcoming.length}</span></div>
          {upcoming.map((u, i) => (
            <div className="k-card" key={i}>
              <div className="k-top"><CalendarClock size={16} strokeWidth={1.5} /><span className="chip neutral">Ahead</span></div>
              <div className="k-title">{u.title}</div>
              <div className="k-meta">{u.meta}</div>
            </div>
          ))}
        </div>
      </div>
      {openEvent && <EventModal eventId={openEvent} onClose={() => setOpenEvent(null)} />}
    </>
  );
}

// ---------------- event / dilemma resolution (all open input) ----------------

export function EventModal({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const { game, apply } = useGame();
  const [amount, setAmount] = useState("");
  const nav = useNavigate();
  if (!game) return null;
  const def = [...EVENT_DECK, ...DILEMMAS].find((d) => d.id === eventId);
  if (!def) return null;
  const spend = game.buckets.spend;

  const submitAmount = () => {
    const err = apply((p) => resolveEventAmount(p, eventId, parseInt(amount || "0", 10)));
    if (!err) onClose();
  };
  const choose = (choice: string) => {
    const err = apply((p) => resolveEventChoice(p, eventId, choice));
    if (!err) onClose();
  };
  const go = (to: string) => { onClose(); nav(to); };

  return (
    <Modal title={def.title} onClose={onClose} wide>
      <p style={{ lineHeight: 1.6 }}>{def.body}</p>
      <div className="mt24">
        {(eventId === "ev-friend-borrow" || eventId === "ev-school-trip" || eventId === "dl-family-help" || eventId === "dl-yousef-deal") && (
          <>
            <label className="field">
              {eventId === "ev-friend-borrow" ? "How much do you lend?" :
               eventId === "ev-school-trip" ? "How much do you put toward the trip? (AED 350 covers it)" :
               eventId === "dl-family-help" ? "How much do you contribute?" :
               "How much do you stake?"}
            </label>
            <MoneyInput value={amount} onChange={setAmount}
              max={eventId === "dl-family-help" || eventId === "dl-yousef-deal" ? spend + game.buckets.save : spend} />
            <div className="reply-chips mt8">
              <button className="reply-chip" onClick={() => setAmount("0")}>AED 0 — sit this out</button>
              {"amount" in def && def.amount ? <button className="reply-chip" onClick={() => setAmount(String(def.amount))}>The full {fmtAED(def.amount as number)}</button> : null}
            </div>
            <div className="actions">
              <button className="btn primary" onClick={submitAmount}>Confirm</button>
            </div>
          </>
        )}

        {eventId === "dl-medical" && (
          <>
            <label className="field">Private clinic — enter what you'll pay (AED 150–500; more buys better care)</label>
            <MoneyInput value={amount} onChange={setAmount} max={spend} />
            <div className="actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
              <button className="btn primary" onClick={submitAmount}>Book private clinic</button>
              <button className="btn" onClick={() => choose("public")}>Public clinic (≈AED 10, long wait)</button>
              <button className="btn" onClick={() => go("/app/shopping/pharmacy")}>Go to Pharmacy</button>
              <button className="btn ghost" onClick={() => choose("dismiss")}>Ignore it</button>
            </div>
          </>
        )}

        {eventId === "dl-laptop" && (
          <div className="actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
            <button className="btn primary" onClick={() => go("/app/shopping/electronics")}>Go to Electronics (repair AED 400 or replace)</button>
            <button className="btn" onClick={() => choose("library")}>Use library computers — 2 weeks, AED 0</button>
            <button className="btn ghost" onClick={() => choose("dismiss")}>Deal with it later</button>
          </div>
        )}

        {(eventId === "dl-phone-stolen" || eventId === "ev-phone-crack" || eventId === "ev-sneaker-drop") && (
          <div className="actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
            <button className="btn primary" onClick={() => go(eventId === "ev-sneaker-drop" ? "/app/shopping/mall" : "/app/shopping/electronics")}>
              {eventId === "ev-sneaker-drop" ? "Go to the Mall" : "Go to Electronics"}
            </button>
            <button className="btn ghost" onClick={() => choose("dismiss")}>Do nothing</button>
          </div>
        )}

        {eventId === "dl-job-offer" && (
          <div className="actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
            <button className="btn primary" onClick={() => choose("accept")}>Accept — AED 2,800/mo, longer days</button>
            <button className="btn" onClick={() => choose("decline")}>Decline — keep the balance</button>
            <button className="btn ghost" onClick={onClose}>Leave pending (up to 2 sim-weeks)</button>
          </div>
        )}
      </div>
    </Modal>
  );
}
