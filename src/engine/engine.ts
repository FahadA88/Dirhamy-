// Simulation engine: all state transitions live here. UI components call
// these pure-ish functions (they clone, mutate the clone, and return it).

import {
  ACTIONS_PER_WEEK,
  GameState,
  Invitation,
  MONTHLY_SALARY,
  NewsItem,
  PendingEvent,
  Reliability,
  STARTING_BALANCE,
  Transaction,
  WEEKS_PER_MONTH,
  monthOf,
  netWorth,
  fmtAED,
} from "./types";
import { ASSETS, tierUnlocked } from "../data/investments";
import { LOCATIONS, getItem, getLocation, Item } from "../data/catalog";
import { GIGS, COURSES } from "../data/gigsCourses";
import { FRIENDS, getFriend } from "../data/friends";
import { EVENT_DECK, DILEMMAS } from "../data/events";
import { NEWS_TEMPLATES } from "../data/newsTemplates";
import { pick, randInt, rngFor } from "./rng";

let idCounter = 0;
export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function clone<T>(s: T): T {
  return JSON.parse(JSON.stringify(s));
}

export function initState(
  displayName: string,
  avatarColor: string,
  mode: "solo" | "live"
): GameState {
  const s: GameState = {
    version: 1,
    displayName,
    avatarColor,
    mode,
    week: 1,
    actionsLeft: ACTIONS_PER_WEEK,
    pendingIncome: 0,
    buckets: { spend: STARTING_BALANCE, save: 0, investCash: 0, reserved: 0 },
    holdings: [],
    stats: { energy: 76, wellbeing: 74, social: 72, community: 70, lifestyle: 72 },
    newsLiteracy: { read: 0, acted: 0, hits: 0, misses: 0 },
    txns: [
      {
        id: uid("tx"),
        week: 1,
        label: "Starting balance",
        amount: STARTING_BALANCE,
        category: "Income",
      },
    ],
    reservations: [],
    goals: [],
    invitations: [],
    news: [],
    coursesOwned: [],
    badges: [],
    streakMonths: 0,
    bestStreak: 0,
    gigBoard: [],
    gigsThisWeek: [],
    ownedItems: [],
    bnpl: [],
    friends: { layla: { warmth: 60 }, omar: { warmth: 60 }, yousef: { warmth: 60 } },
    discounts: [],
    marketSkews: [],
    salaryModPct: 0,
    loansOut: [],
    ventures: [],
    flags: {},
    pendingEvents: [],
    eventLog: [{ week: 1, text: "Welcome to your first week. You have AED 2,500 and five actions." }],
    history: [],
    monthEventIndex: 0,
    createdAt: new Date().toISOString(),
    lastAdvancedDay: new Date().toISOString().slice(0, 10),
  };
  seedWeek(s, "seed");
  snapshot(s, 0);
  return s;
}

function log(s: GameState, text: string) {
  s.eventLog.unshift({ week: s.week, text });
  if (s.eventLog.length > 200) s.eventLog.pop();
}

function tx(s: GameState, label: string, amount: number, category: string, locationId?: string) {
  s.txns.unshift({ id: uid("tx"), week: s.week, label, amount, category, locationId });
  if (s.txns.length > 800) s.txns.pop();
}

function snapshot(s: GameState, spentThisWeek: number) {
  s.history.push({
    week: s.week,
    netWorth: netWorth(s),
    spend: s.buckets.spend,
    save: s.buckets.save,
    invested: s.holdings.reduce((a, h) => a + h.value, 0),
    spentThisWeek,
  });
  if (s.history.length > 120) s.history.shift();
}

// ---------- Weekly seeding: news, invitations, gig board ----------

const RELIABILITY_ACCURACY: Record<Reliability, number> = {
  confirmed: 1,
  forecast: 0.7,
  speculation: 0.5,
};

function seedWeek(s: GameState, salt: string) {
  const rand = rngFor(s.createdAt, s.week, salt);

  // --- News edition (4-6 items, no template repeats vs last 2 editions) ---
  const recentTemplates = new Set(
    s.news.filter((n) => n.editionWeek >= s.week - 2).map((n) => n.templateId)
  );
  const pool = NEWS_TEMPLATES.filter((t) => !recentTemplates.has(t.id));
  const count = randInt(rand, 4, 6);
  const chosen: typeof NEWS_TEMPLATES = [];
  const cats = ["Markets", "Retail", "Real Estate", "Jobs & Economy", "Consumer Alerts"];
  // ensure at least one Markets and one Retail when possible, then fill randomly
  for (const mustCat of ["Markets", "Retail"]) {
    const cpool = pool.filter((t) => t.category === mustCat && !chosen.includes(t));
    if (cpool.length) chosen.push(pick(rand, cpool));
  }
  let guard = 0;
  while (chosen.length < count && guard++ < 60) {
    const t = pick(rand, pool);
    if (!chosen.includes(t)) chosen.push(t);
  }
  void cats;

  for (const t of chosen) {
    // global distribution 60/30/10 filtered by what the template allows
    const roll = rand();
    let rel: Reliability = roll < 0.6 ? "confirmed" : roll < 0.9 ? "forecast" : "speculation";
    if (!t.reliabilities.includes(rel)) rel = pick(rand, t.reliabilities as Reliability[]);
    const willBeTrue = rand() < RELIABILITY_ACCURACY[rel];

    let discountPct: number | undefined;
    const effect: NewsItem["effect"] = { kind: t.effect.kind } as NewsItem["effect"];
    if (t.effect.kind === "retailSale") {
      discountPct = randInt(rand, t.effect.discount[0], t.effect.discount[1]);
      effect.locationId = pick(rand, t.effect.locations);
      effect.discountPct = discountPct;
    } else if (t.effect.kind === "marketSkew") {
      effect.assetGroup = t.effect.assetGroup;
      effect.direction = t.effect.direction;
    } else if (t.effect.kind === "realEstate") {
      effect.assetGroup = "reit";
      effect.direction = t.effect.direction;
    } else if (t.effect.kind === "salary") {
      effect.salaryPct = t.effect.pct;
    } else if (t.effect.kind === "consumerAlert") {
      effect.alert = t.effect.alert;
    }

    const sub = (str: string) =>
      str.replace(/\{pct\}/g, String(discountPct ?? ""));
    const item: NewsItem = {
      id: uid("news"),
      templateId: t.id,
      editionWeek: s.week,
      category: t.category,
      reliability: rel,
      headline: sub(t.headline),
      body: t.body.map(sub),
      affects: t.affects,
      effect,
      willBeTrue,
      read: false,
    };
    s.news.unshift(item);

    // World effects happen whether or not the user reads — reading is how
    // you find out (and how you unlock discounts/shields).
    if (willBeTrue) {
      if (effect.kind === "marketSkew" && effect.assetGroup && effect.direction) {
        s.marketSkews.push({ assetGroup: effect.assetGroup, direction: effect.direction, untilWeek: s.week + 4 });
      } else if (effect.kind === "realEstate" && effect.direction) {
        s.marketSkews.push({ assetGroup: "reit", direction: effect.direction, untilWeek: s.week + randInt(rand, 8, 12) });
      } else if (effect.kind === "salary" && effect.salaryPct) {
        s.salaryModPct += effect.salaryPct;
      }
    } else if (effect.kind === "marketSkew" && effect.assetGroup && effect.direction) {
      // an inaccurate forecast: the market does the opposite, gently
      s.marketSkews.push({ assetGroup: effect.assetGroup, direction: (effect.direction * -1) as 1 | -1, untilWeek: s.week + 4 });
    }
  }
  // archive: drop editions older than 2 weeks that were read, keep bounded
  s.news = s.news.filter((n) => n.editionWeek >= s.week - 2);

  // --- Friend invitations (1-3 per week) ---
  const socialLow = s.stats.social < 40;
  for (const f of FRIENDS) {
    const freq = socialLow ? f.frequency * 0.4 : f.frequency;
    if (rand() < freq && s.invitations.filter((i) => i.status === "pending").length < 3) {
      const inv = pick(rand, f.invites);
      const cost = randInt(rand, inv.cost[0], inv.cost[1]);
      s.invitations.unshift({
        id: uid("inv"),
        friendId: f.id,
        week: s.week,
        text: inv.text.replace("{cost}", String(cost)),
        cost,
        altCost: Math.round(cost * Math.max(0.2, inv.altPct) * 0.5) || 15,
        status: "pending",
      });
    }
  }
  if (s.invitations.length > 40) s.invitations = s.invitations.slice(0, 40);

  // --- Gig board (2-4 options; delivery always available) ---
  const gigPool = GIGS.filter((g) => !g.alwaysAvailable);
  const board: string[] = ["delivery"];
  const n = randInt(rand, 1, 3);
  let g2 = 0;
  while (board.length < n + 1 && g2++ < 30) {
    const g = pick(rand, gigPool);
    if (!board.includes(g.id)) board.push(g.id);
  }
  s.gigBoard = board;
  s.gigsThisWeek = [];
}

// ---------- Advancing time ----------

export interface AdvanceResult {
  state: GameState;
  notices: string[];
}

export function advanceWeek(prev: GameState): AdvanceResult {
  const s = clone(prev);
  const notices: string[] = [];
  const spentThisWeek = weekSpending(s, s.week);

  // expire pending invitations from last week
  for (const inv of s.invitations) {
    if (inv.status === "pending" && inv.week < s.week) {
      inv.status = "expired";
      s.stats.social = clamp(s.stats.social - 4);
      s.friends[inv.friendId].warmth = clamp(s.friends[inv.friendId].warmth - 2);
      notices.push(`${getFriend(inv.friendId).name}'s invite expired unanswered. Social −4.`);
    }
  }

  // news outcome feedback for last week's read market stories
  for (const nw of s.news) {
    if (nw.read && !nw.outcomeShown && nw.editionWeek === s.week && (nw.effect.kind === "marketSkew" || nw.effect.kind === "realEstate")) {
      nw.outcomeShown = true;
      nw.outcomeMatched = nw.willBeTrue;
      if (nw.willBeTrue) s.newsLiteracy.hits++;
      else s.newsLiteracy.misses++;
      notices.push(
        `You read the ${nw.reliability} story "${nw.headline}". Outcome matched: ${nw.willBeTrue ? "Yes" : "No"}.`
      );
    }
  }

  // missed retail opportunities digest
  const missed = s.news
    .filter((n) => n.editionWeek === s.week && !n.read && n.effect.kind === "retailSale" && n.willBeTrue)
    .map((n) => `Unread: ${n.effect.discountPct}% off at ${getLocation(n.effect.locationId!)?.name} — the discount passed you by.`);

  // ---- advance the clock ----
  s.week += 1;
  s.actionsLeft = ACTIONS_PER_WEEK - (s.flags.newJob ? 1 : 0);

  // stat decay
  s.stats.energy = clamp(s.stats.energy - 4);
  s.stats.wellbeing = clamp(s.stats.wellbeing - 3);
  s.stats.social = clamp(s.stats.social - 3 - (s.flags.newJob ? 1 : 0));
  s.stats.community = clamp(s.stats.community - 2);
  s.stats.lifestyle = clamp(s.stats.lifestyle - 3);

  // ongoing condition effects
  if (s.flags.sickWeeksLeft && s.flags.sickWeeksLeft > 0) {
    s.stats.wellbeing = clamp(s.stats.wellbeing - 5);
    s.flags.sickWeeksLeft -= 1;
    notices.push("Still feeling unwell. Wellbeing −5.");
  }
  if (s.flags.libraryWeeksLeft && s.flags.libraryWeeksLeft > 0) {
    s.flags.libraryWeeksLeft -= 1;
    s.actionsLeft -= 1;
    s.stats.energy = clamp(s.stats.energy - 4);
    if (s.flags.libraryWeeksLeft === 0) {
      s.flags.laptopBroken = false;
      notices.push("You finished the assignment on library computers. Crisis over — for free, mostly.");
    }
  } else if (s.flags.laptopBroken) {
    s.stats.energy = clamp(s.stats.energy - 2);
    notices.push("Your laptop is still broken. Energy −2 from working around it.");
  }
  if (s.flags.phoneLost) {
    s.stats.social = clamp(s.stats.social - 2);
    s.stats.lifestyle = clamp(s.stats.lifestyle - 2);
  }
  if (s.flags.phoneCracked) s.stats.lifestyle = clamp(s.stats.lifestyle - 1);

  // low-stat warnings
  if (s.stats.energy < 30) notices.push("Energy below 30 — your salary will take a 10% hit until you recover. Groceries help.");
  if (s.stats.wellbeing < 30) notices.push("Wellbeing below 30 — your salary will take a 10% hit until you recover.");
  if (s.stats.social < 40) notices.push("Friends feel you've gone distant. Fewer invitations for a while.");

  // owned cheap items breaking
  for (const it of s.ownedItems) {
    if (it.breaksAtWeek && it.breaksAtWeek === s.week) {
      notices.push(`Your ${it.name} just gave out. Cheap turned out expensive — it needs replacing.`);
      s.stats.lifestyle = clamp(s.stats.lifestyle - 3);
    }
  }

  // reservations: move weekly amounts, roll sale chance
  const rand = rngFor(s.createdAt, s.week, "week");
  for (const r of s.reservations) {
    const move = Math.min(r.weeklyAmount, s.buckets.spend);
    if (move > 0) {
      s.buckets.spend -= move;
      s.buckets.reserved += move;
      r.saved += move;
    }
    if (!r.salePrice && rand() < 0.07) {
      const off = randInt(rand, 10, 20);
      r.salePrice = Math.round(r.price * (1 - off / 100));
      notices.push(`Sale! ${r.itemName} dropped ${off}% while reserved — you'll pay ${fmtAED(r.salePrice)} and pocket the difference.`);
    }
  }

  // goals: move weekly amounts from spend into save (earmarked)
  for (const g of s.goals) {
    if (g.completedWeek) continue;
    const move = Math.min(g.weeklyAmount, s.buckets.spend, g.target - g.saved);
    if (move > 0) {
      s.buckets.spend -= move;
      s.buckets.save += move;
      g.saved += move;
    }
    if (g.saved >= g.target) {
      g.completedWeek = s.week;
      awardBadge(s, "Goal Reached", notices);
      notices.push(`Goal reached: ${g.name} (${fmtAED(g.target)} saved).`);
    }
  }

  // loans repaid?
  s.loansOut = s.loansOut.filter((l) => {
    if (l.dueWeek <= s.week) {
      if (l.willRepay) {
        s.pendingIncome += l.amount;
        tx(s, "Loan repaid by friend", l.amount, "Income");
        notices.push(`Your friend paid back the ${fmtAED(l.amount)} you lent. Faith in humanity: retained.`);
      } else {
        notices.push(`The ${fmtAED(l.amount)} you lent isn't coming back. An expensive lesson in lending.`);
      }
      return false;
    }
    return true;
  });

  // ventures resolving
  s.ventures = s.ventures.filter((v) => {
    if (v.resolveWeek <= s.week) {
      const out = Math.round(v.amount * (1 + v.multPct / 100));
      if (out > 0) {
        s.pendingIncome += out;
        tx(s, `${v.label} paid out`, out, "Income");
      }
      notices.push(
        v.multPct >= 0
          ? `${v.label}: your ${fmtAED(v.amount)} returned ${fmtAED(out)} (+${v.multPct}%).`
          : `${v.label}: your ${fmtAED(v.amount)} came back as ${fmtAED(out)} (${v.multPct}%).`
      );
      return false;
    }
    return true;
  });

  // expire skews/discounts
  s.marketSkews = s.marketSkews.filter((m) => m.untilWeek >= s.week);
  s.discounts = s.discounts.filter((d) => d.expiresWeek >= s.week);

  // ---- month boundary ----
  const isMonthStart = (s.week - 1) % WEEKS_PER_MONTH === 0 && s.week > 1;
  if (isMonthStart) {
    runMonthEnd(s, notices);
  }

  // weekly digest
  const prevSpent = spentThisWeek;
  const byCat: Record<string, number> = {};
  const prevByCat: Record<string, number> = {};
  for (const t of s.txns) {
    if (t.amount < 0 && t.week === s.week - 1) byCat[t.category] = (byCat[t.category] ?? 0) - t.amount;
    if (t.amount < 0 && t.week === s.week - 2) prevByCat[t.category] = (prevByCat[t.category] ?? 0) - t.amount;
  }
  s.lastDigest = { week: s.week - 1, byCategory: byCat, prevByCategory: prevByCat, missedNews: missed, notes: [] };
  void prevSpent;

  // reseed the new week
  seedWeek(s, "seed");
  snapshot(s, spentThisWeek);
  for (const n of notices) log(s, n);
  return { state: s, notices };
}

function weekSpending(s: GameState, week: number): number {
  return s.txns.filter((t) => t.week === week && t.amount < 0).reduce((a, t) => a - t.amount, 0);
}

function monthSpending(s: GameState, month: number): number {
  const start = (month - 1) * WEEKS_PER_MONTH + 1;
  const end = month * WEEKS_PER_MONTH;
  return s.txns.filter((t) => t.week >= start && t.week <= end && t.amount < 0).reduce((a, t) => a - t.amount, 0);
}

function monthIncome(s: GameState, month: number): number {
  const start = (month - 1) * WEEKS_PER_MONTH + 1;
  const end = month * WEEKS_PER_MONTH;
  return s.txns.filter((t) => t.week >= start && t.week <= end && t.amount > 0).reduce((a, t) => a + t.amount, 0);
}

function awardBadge(s: GameState, badge: string, notices: string[]) {
  if (!s.badges.includes(badge)) {
    s.badges.push(badge);
    notices.push(`Badge earned: ${badge}.`);
  }
}

function runMonthEnd(s: GameState, notices: string[]) {
  const finishedMonth = monthOf(s.week - 1);
  const rand = rngFor(s.createdAt, s.week, "month");

  // --- investment returns for the finished month ---
  for (const h of s.holdings) {
    const def = ASSETS.find((a) => a.id === h.assetId)!;
    if (h.value <= 0) continue;
    const spread = def.maxMoPct - def.minMoPct;
    let r = def.avgMoPct + (rand() * 2 - 1) * (spread / 2) * 0.8;
    for (const skew of s.marketSkews) {
      if (skew.assetGroup === "all" || skew.assetGroup === def.group) {
        r += skew.direction * spread * 0.2;
      }
    }
    if (s.flags.marketDipMonth === finishedMonth) r = def.minMoPct + rand() * Math.abs(def.minMoPct) * 0.3;
    if (s.flags.marketRallyMonth === finishedMonth) r = def.maxMoPct - rand() * def.maxMoPct * 0.2;
    r = Math.max(def.minMoPct, Math.min(def.maxMoPct, r));
    const delta = Math.round(h.value * (r / 100));
    h.value += delta;
    if (Math.abs(delta) >= 1) {
      tx(s, `${def.name} ${delta >= 0 ? "gained" : "lost"} ${Math.abs(r).toFixed(1)}%`, 0, "Investments");
    }
    if (delta < 0 && h.value > 0) {
      notices.push(
        `${def.name} lost ${Math.abs(r).toFixed(1)}% this month. Diversification means one bad month never sinks you; time in the market beats timing the market.`
      );
    }
  }
  // dip survival badge
  if (s.flags.marketDipMonth === finishedMonth && s.holdings.some((h) => h.assetId !== "savings" && h.value > 0)) {
    awardBadge(s, "Survived a Market Dip", notices);
  }

  // --- salary payslip ---
  const statPenalty = s.stats.energy < 30 || s.stats.wellbeing < 30;
  const base = s.flags.newJob ? 2800 : MONTHLY_SALARY;
  let gross = Math.round(base * (1 + s.salaryModPct / 100));
  if (statPenalty) gross = Math.round(gross * 0.9);
  const eos = 100;
  const transport = s.transportDoubleMonth === finishedMonth || s.flags.newJob ? 400 : 200;
  const bills = [
    { label: "Phone plan", amount: 150 },
    { label: "Transport pass", amount: transport },
    { label: "Family contribution", amount: 100 },
  ];
  let bnplTotal = 0;
  s.bnpl = s.bnpl.filter((p) => {
    let pay = p.monthly;
    if (!s.flags.bnplShieldWeek || s.flags.bnplShieldWeek < s.week - 4) {
      // no shield read this month: 10% chance of surcharge event handled via news; keep base
    }
    bnplTotal += pay;
    p.remaining -= 1;
    if (p.remaining <= 0) notices.push(`BNPL plan for ${p.itemName} fully paid off.`);
    return p.remaining > 0;
  });
  const billTotal = bills.reduce((a, b) => a + b.amount, 0);
  const net = gross - eos - billTotal - bnplTotal;
  const vat = Math.round(monthSpending(s, finishedMonth) * 0.05);

  if (net >= 0) {
    s.pendingIncome += net;
  } else {
    s.buckets.spend += net; // bills exceeded salary
  }
  tx(s, `Salary (month ${finishedMonth})`, gross, "Income");
  tx(s, "Fixed bills + end-of-service", -(billTotal + eos + bnplTotal), "Bills");
  s.lastPayslip = {
    month: finishedMonth,
    gross,
    eos,
    bills,
    bnpl: bnplTotal,
    net,
    vatEstimate: vat,
    statPenalty,
    bonusNote: s.salaryModPct !== 0 ? `${s.salaryModPct > 0 ? "+" : ""}${s.salaryModPct}% from economy news` : undefined,
  };
  s.salaryModPct = 0;
  notices.push(`Payday. ${fmtAED(net)} net after bills — allocate it across Spend / Save / Invest.`);

  // --- streak: positive savings rate this month ---
  const income = monthIncome(s, finishedMonth);
  const spent = monthSpending(s, finishedMonth);
  if (income > 0 && spent < income) {
    s.streakMonths += 1;
    s.bestStreak = Math.max(s.bestStreak, s.streakMonths);
    if (s.streakMonths >= 3) awardBadge(s, "3-Month Streak", notices);
  } else {
    if (s.streakMonths > 0) notices.push("You spent more than you earned this month — savings streak reset.");
    s.streakMonths = 0;
  }

  // --- draw the monthly event (same order for every user) ---
  const newMonth = monthOf(s.week);
  const ev = EVENT_DECK[s.monthEventIndex % EVENT_DECK.length];
  s.monthEventIndex += 1;
  applyOrQueueEvent(s, ev.id, newMonth, notices, rand);

  // dilemma every 3rd month
  if (newMonth % 3 === 0) {
    const dl = DILEMMAS[(newMonth / 3 - 1) % DILEMMAS.length];
    queueDilemma(s, dl.id, newMonth, notices);
  }

  if (newMonth === 13 && !s.badges.includes("Year One Complete")) {
    awardBadge(s, "Year One Complete", notices);
    notices.push("Sim-year one complete — your Year in Review is ready.");
  }
}

function applyOrQueueEvent(
  s: GameState,
  evId: string,
  month: number,
  notices: string[],
  rand: () => number
) {
  const ev = EVENT_DECK.find((e) => e.id === evId)!;
  switch (ev.id) {
    case "ev-eidiya":
    case "ev-bonus":
    case "ev-weekend-gig":
      s.pendingIncome += ev.amount!;
      tx(s, ev.title, ev.amount!, "Income");
      notices.push(`${ev.title} — ${fmtAED(ev.amount!)} added to pending income.`);
      break;
    case "ev-forgotten-sub":
      if (s.flags.subShieldWeek && s.flags.subShieldWeek >= s.week - 4) {
        notices.push("A forgotten subscription tried to bill AED 60 — you'd read the alert and cancelled in time. Saved.");
      } else {
        s.buckets.spend -= 60;
        tx(s, "Forgotten subscription", -60, "Bills");
        notices.push("A forgotten subscription charged AED 60. Reading The Daily's consumer alerts would have caught it.");
      }
      break;
    case "ev-wedding":
      s.buckets.spend -= 100;
      s.stats.community = clamp(s.stats.community + 6);
      tx(s, "Family wedding contribution", -100, "Family");
      notices.push("Family wedding: AED 100 contributed. Community +6.");
      break;
    case "ev-market-dip":
      s.flags.marketDipMonth = month;
      s.marketSkews.push({ assetGroup: "all", direction: -1, untilWeek: s.week + 4 });
      notices.push("Markets dipped sharply. Your holdings will land near the low end this month.");
      break;
    case "ev-market-rally":
      s.flags.marketRallyMonth = month;
      s.marketSkews.push({ assetGroup: "all", direction: 1, untilWeek: s.week + 4 });
      notices.push("Markets are rallying. Holdings will land near the high end this month.");
      break;
    case "ev-transport-double":
      s.transportDoubleMonth = month;
      notices.push("Metro works: this month's transport bill doubles to AED 400.");
      break;
    case "ev-phone-crack":
      s.flags.phoneCracked = true;
      s.pendingEvents.push({ id: ev.id, kind: "event", month, resolved: false });
      notices.push("Your phone screen cracked. Repair at Electronics (AED 250) or live with the lifestyle hit.");
      break;
    case "ev-sneaker-drop":
      s.pendingEvents.push({ id: ev.id, kind: "event", month, resolved: false });
      notices.push("A limited sneaker drop lands this weekend. The Mall awaits — or doesn't.");
      break;
    case "ev-friend-borrow":
    case "ev-school-trip":
      s.pendingEvents.push({ id: ev.id, kind: "event", month, resolved: false });
      notices.push(`New decision waiting: ${ev.title}.`);
      break;
  }
  void rand;
}

function queueDilemma(s: GameState, dlId: string, month: number, notices: string[]) {
  const dl = DILEMMAS.find((d) => d.id === dlId)!;
  if (dl.id === "dl-laptop") s.flags.laptopBroken = true;
  if (dl.id === "dl-medical") s.flags.sickWeeksLeft = 3;
  if (dl.id === "dl-phone-stolen") s.flags.phoneLost = true;
  if (dl.id === "dl-job-offer") s.flags.jobOfferExpiresWeek = s.week + 2;
  s.pendingEvents.push({ id: dl.id, kind: "dilemma", month, resolved: false });
  notices.push(`Dilemma: ${dl.title}.`);
}

// ---------- Live mode catch-up ----------

export function catchUpLive(prev: GameState): AdvanceResult {
  let s = clone(prev);
  const today = new Date().toISOString().slice(0, 10);
  const last = s.lastAdvancedDay ?? today;
  const days = Math.floor((Date.parse(today) - Date.parse(last)) / 86400000);
  const steps = Math.max(0, Math.min(days, 8));
  const all: string[] = [];
  for (let i = 0; i < steps; i++) {
    const r = advanceWeek(s);
    s = r.state;
    all.push(...r.notices);
  }
  s.lastAdvancedDay = today;
  if (steps > 0) {
    s.awaySummary = [
      `While you were away, ${steps} sim-week${steps > 1 ? "s" : ""} passed.`,
      ...all.slice(0, 12),
    ];
    if (days > steps) s.awaySummary.push(`(Advancement is capped at 8 weeks per return.)`);
  }
  return { state: s, notices: all };
}

// ---------- Player actions ----------

export type ActionResult = { state: GameState; error?: string; notice?: string };

function fail(prev: GameState, error: string): ActionResult {
  return { state: prev, error };
}

export function allocateIncome(prev: GameState, spend: number, save: number, invest: number): ActionResult {
  const total = spend + save + invest;
  if (total <= 0) return fail(prev, "Nothing to allocate.");
  if (total > prev.pendingIncome + 0.5) return fail(prev, "That's more than your pending income.");
  const s = clone(prev);
  s.pendingIncome = Math.max(0, s.pendingIncome - total);
  s.buckets.spend += spend;
  s.buckets.save += save;
  s.buckets.investCash += invest;
  log(s, `Allocated income — Spend ${fmtAED(spend)}, Save ${fmtAED(save)}, Invest ${fmtAED(invest)}.`);
  return { state: s, notice: "Income allocated." };
}

export function transferBuckets(prev: GameState, from: "spend" | "save" | "investCash", to: "spend" | "save" | "investCash", amount: number): ActionResult {
  if (amount <= 0) return fail(prev, "Enter an amount.");
  if (prev.buckets[from] < amount) return fail(prev, "Not enough in that bucket.");
  const s = clone(prev);
  s.buckets[from] -= amount;
  s.buckets[to] += amount;
  return { state: s };
}

export function discountedPrice(s: GameState, locationId: string, price: number): number {
  const d = s.discounts.find((d) => d.locationId === locationId && d.expiresWeek >= s.week);
  return d ? Math.round(price * (1 - d.pct / 100)) : price;
}

export function buyCart(
  prev: GameState,
  locationId: string,
  itemIds: string[],
  opts?: { bnpl?: boolean }
): ActionResult {
  if (itemIds.length === 0) return fail(prev, "Cart is empty.");
  if (prev.actionsLeft < 1) return fail(prev, "No actions left this week. Advance to next week.");
  const loc = getLocation(locationId);
  if (!loc) return fail(prev, "Unknown location.");
  const items = itemIds.map((id) => getItem(locationId, id)).filter(Boolean) as Item[];
  const total = items.reduce((a, i) => a + discountedPrice(prev, locationId, i.price), 0);

  const s = clone(prev);
  if (opts?.bnpl && loc.bnpl) {
    if (items.length !== 1) return fail(prev, "BNPL applies to a single item.");
    const item = items[0];
    const price = discountedPrice(s, locationId, item.price);
    const withFee = Math.round(price * 1.08);
    const monthly = Math.ceil(withFee / 4);
    s.bnpl.push({ id: uid("bnpl"), itemName: item.name, remaining: 4, monthly, ratePct: 8 });
    tx(s, `${item.name} (BNPL, 4 × ${fmtAED(monthly)})`, 0, "Shopping", locationId);
    applyItemEffects(s, item, locationId);
    s.actionsLeft -= 1;
    log(s, `Bought ${item.name} on BNPL: ${fmtAED(withFee)} total (8% fee) over 4 months.`);
    return { state: s, notice: `BNPL plan started: 4 payments of ${fmtAED(monthly)} (8% fee included).` };
  }

  if (total > s.buckets.spend) return fail(prev, `Cart is ${fmtAED(total)} but your Spend balance is ${fmtAED(prev.buckets.spend)}.`);
  s.buckets.spend -= total;
  for (const item of items) {
    const price = discountedPrice(s, locationId, item.price);
    tx(s, item.name, -price, loc.name, locationId);
    applyItemEffects(s, item, locationId);
  }
  s.actionsLeft -= 1;

  // cancel matching reservation if user bought the same item outright
  const resIdx = s.reservations.findIndex((r) => itemIds.includes(r.itemId));
  if (resIdx >= 0) {
    const r = s.reservations[resIdx];
    s.buckets.spend += r.saved;
    s.buckets.reserved -= r.saved;
    s.reservations.splice(resIdx, 1);
    log(s, `Reservation for ${r.itemName} cancelled — you bought it outright and forfeited any sale.`);
  }

  return { state: s, notice: `Purchased ${items.length} item${items.length > 1 ? "s" : ""} for ${fmtAED(total)}.` };
}

function applyItemEffects(s: GameState, item: Item, locationId: string) {
  if (item.effect) {
    s.stats.energy = clamp(s.stats.energy + (item.effect.energy ?? 0));
    s.stats.wellbeing = clamp(s.stats.wellbeing + (item.effect.wellbeing ?? 0));
    s.stats.social = clamp(s.stats.social + (item.effect.social ?? 0));
    s.stats.community = clamp(s.stats.community + (item.effect.community ?? 0));
    s.stats.lifestyle = clamp(s.stats.lifestyle + (item.effect.lifestyle ?? 0));
  }
  if (item.breaksAfterMonths) {
    s.ownedItems.push({ itemId: item.id, name: item.name, week: s.week, breaksAtWeek: s.week + item.breaksAfterMonths * WEEKS_PER_MONTH });
  } else if (item.price >= 200) {
    s.ownedItems.push({ itemId: item.id, name: item.name, week: s.week });
  }
  // resolve condition flags
  if (item.id === "el-repair" && s.flags.phoneCracked) {
    s.flags.phoneCracked = false;
    log(s, "Phone screen repaired. Good as new.");
  }
  if (locationId === "electronics" && item.section === "Phones" && item.id !== "el-repair") {
    if (s.flags.phoneLost) log(s, "New phone acquired — you're reachable again.");
    s.flags.phoneLost = false;
    s.flags.phoneCracked = false;
  }
  if (item.id === "el-laptop-repair" || (item.section === "Computers" && item.id.startsWith("el-laptop") && item.id !== "el-laptop-repair")) {
    if (s.flags.laptopBroken) log(s, "Laptop situation resolved.");
    s.flags.laptopBroken = false;
    s.flags.libraryWeeksLeft = 0;
  }
  markEventResolvedByPurchase(s, item);
}

function markEventResolvedByPurchase(s: GameState, item: Item) {
  for (const pe of s.pendingEvents) {
    if (pe.resolved) continue;
    if (pe.id === "ev-phone-crack" && (item.id === "el-repair" || item.section === "Phones")) pe.resolved = true;
    if (pe.id === "dl-phone-stolen" && item.section === "Phones") pe.resolved = true;
    if (pe.id === "dl-laptop" && (item.id === "el-laptop-repair" || item.section === "Computers")) pe.resolved = true;
    if (pe.id === "ev-sneaker-drop" && item.id === "ml-sneak-drop") pe.resolved = true;
    if (pe.id === "dl-medical" && item.section === "Medicine") {
      pe.resolved = true;
      s.flags.sickWeeksLeft = 0;
      log(s, "Pharmacy run sorted you out. Feeling human again.");
    }
  }
}

export function reserveItem(prev: GameState, locationId: string, itemId: string, weeklyAmount: number): ActionResult {
  const item = getItem(locationId, itemId);
  if (!item) return fail(prev, "Unknown item.");
  if (item.price < 300) return fail(prev, "Reserve & Save is for items over AED 300.");
  if (prev.reservations.length >= 3) return fail(prev, "Maximum 3 active reservations.");
  if (weeklyAmount <= 0) return fail(prev, "Choose a weekly amount to set aside.");
  const s = clone(prev);
  s.reservations.push({
    id: uid("res"),
    itemId,
    itemName: item.name,
    locationId,
    price: discountedPrice(s, locationId, item.price),
    weeklyAmount: Math.round(weeklyAmount),
    saved: 0,
    startedWeek: s.week,
  });
  log(s, `Reserved ${item.name} — saving ${fmtAED(weeklyAmount)}/week toward ${fmtAED(item.price)}.`);
  return { state: s, notice: `Reserved ${item.name}. ${fmtAED(weeklyAmount)} moves aside each week.` };
}

export function cancelReservation(prev: GameState, resId: string): ActionResult {
  const s = clone(prev);
  const idx = s.reservations.findIndex((r) => r.id === resId);
  if (idx < 0) return fail(prev, "Reservation not found.");
  const r = s.reservations[idx];
  s.buckets.spend += r.saved;
  s.buckets.reserved -= r.saved;
  s.reservations.splice(idx, 1);
  return { state: s, notice: `Reservation cancelled — ${fmtAED(r.saved)} returned to Spend.` };
}

export function completeReservation(prev: GameState, resId: string): ActionResult {
  const s = clone(prev);
  const r = s.reservations.find((x) => x.id === resId);
  if (!r) return fail(prev, "Reservation not found.");
  const price = r.salePrice ?? r.price;
  if (r.saved < price) return fail(prev, `Still ${fmtAED(price - r.saved)} short.`);
  s.buckets.reserved -= r.saved;
  const change = r.saved - price;
  s.buckets.spend += change;
  tx(s, `${r.itemName}${r.salePrice ? " (caught on sale)" : " (reserved)"}`, -price, "Shopping", r.locationId);
  const item = getItem(r.locationId, r.itemId);
  if (item) applyItemEffects(s, item, r.locationId);
  s.reservations = s.reservations.filter((x) => x.id !== resId);
  log(s, `Bought ${r.itemName} via Reserve & Save for ${fmtAED(price)}.${change > 0 ? ` Pocketed ${fmtAED(change)}.` : ""}`);
  return { state: s, notice: `${r.itemName} is yours — patience paid.` };
}

export function invest(prev: GameState, assetId: string, amount: number): ActionResult {
  const def = ASSETS.find((a) => a.id === assetId);
  if (!def) return fail(prev, "Unknown asset.");
  if (amount <= 0) return fail(prev, "Enter an amount.");
  if (amount > prev.buckets.investCash) return fail(prev, `Your Invest bucket has ${fmtAED(prev.buckets.investCash)}. Allocate more income to it first.`);
  if (!tierUnlocked(def.tier, monthOf(prev.week), netWorth(prev))) return fail(prev, "This tier hasn't unlocked yet.");
  const s = clone(prev);
  s.buckets.investCash -= amount;
  let h = s.holdings.find((x) => x.assetId === assetId);
  if (!h) {
    h = { assetId, value: 0, invested: 0 };
    s.holdings.push(h);
  }
  h.value += amount;
  h.invested += amount;
  if (def.lockMonths) h.lockedUntilWeek = s.week + def.lockMonths * WEEKS_PER_MONTH;
  tx(s, `Invested in ${def.name}`, 0, "Investments");
  const wasFirst = !prev.badges.includes("First Investment") && prev.holdings.every((x) => x.invested === 0 || x.assetId === "savings");
  if (wasFirst && assetId !== "savings") {
    const notices: string[] = [];
    awardBadge(s, "First Investment", notices);
  }
  // news literacy: acting after reading a live market story this week
  if (s.news.some((n) => n.read && n.editionWeek === s.week && (n.effect.kind === "marketSkew" || n.effect.kind === "realEstate"))) {
    s.newsLiteracy.acted += 1;
  }
  log(s, `Invested ${fmtAED(amount)} in ${def.name}.`);
  return { state: s, notice: `Invested ${fmtAED(amount)} in ${def.name}.` };
}

export function sellInvestment(prev: GameState, assetId: string, amount: number): ActionResult {
  const h = prev.holdings.find((x) => x.assetId === assetId);
  const def = ASSETS.find((a) => a.id === assetId);
  if (!h || !def) return fail(prev, "No holding found.");
  if (h.lockedUntilWeek && h.lockedUntilWeek > prev.week)
    return fail(prev, `${def.name} is locked until sim-week ${h.lockedUntilWeek}.`);
  if (amount <= 0 || amount > h.value) return fail(prev, "Invalid amount.");
  const s = clone(prev);
  const hh = s.holdings.find((x) => x.assetId === assetId)!;
  hh.value -= amount;
  hh.invested = Math.max(0, hh.invested - amount);
  s.buckets.investCash += amount;
  tx(s, `Sold ${def.name}`, 0, "Investments");
  log(s, `Sold ${fmtAED(amount)} of ${def.name} back to Invest cash.`);
  return { state: s, notice: `Sold ${fmtAED(amount)} of ${def.name}.` };
}

export function doGig(prev: GameState, gigId: string): ActionResult {
  const gig = GIGS.find((g) => g.id === gigId);
  if (!gig) return fail(prev, "Unknown gig.");
  if (!prev.gigBoard.includes(gigId)) return fail(prev, "That gig isn't on this week's board.");
  if (prev.gigsThisWeek.includes(gigId)) return fail(prev, "Already done this week.");
  if (gig.requiresCourse && !prev.coursesOwned.includes(gig.requiresCourse))
    return fail(prev, `Requires the ${COURSES.find((c) => c.id === gig.requiresCourse)?.name}.`);
  if (prev.actionsLeft < gig.actions) return fail(prev, `Needs ${gig.actions} actions; you have ${prev.actionsLeft}.`);
  const s = clone(prev);
  const rand = rngFor(s.createdAt, s.week, `gig:${gigId}`);
  const pay = randInt(rand, gig.pay[0], gig.pay[1]);
  s.actionsLeft -= gig.actions;
  s.pendingIncome += pay;
  s.gigsThisWeek.push(gigId);
  s.stats.energy = clamp(s.stats.energy - gig.actions * 2);
  tx(s, `Gig: ${gig.name}`, pay, "Gig income");
  log(s, `Completed ${gig.name} for ${fmtAED(pay)}.`);
  return { state: s, notice: `${gig.name} done — ${fmtAED(pay)} earned (pending allocation).` };
}

export function buyCourse(prev: GameState, courseId: string): ActionResult {
  const c = COURSES.find((x) => x.id === courseId);
  if (!c) return fail(prev, "Unknown course.");
  if (prev.coursesOwned.includes(courseId)) return fail(prev, "Already owned.");
  if (prev.buckets.spend < c.price) return fail(prev, `Costs ${fmtAED(c.price)}; Spend balance is ${fmtAED(prev.buckets.spend)}.`);
  if (prev.actionsLeft < 1) return fail(prev, "No actions left this week.");
  const s = clone(prev);
  s.buckets.spend -= c.price;
  s.coursesOwned.push(courseId);
  s.actionsLeft -= 1;
  if (c.socialBonus) s.stats.social = clamp(s.stats.social + c.socialBonus);
  tx(s, c.name, -c.price, "Learning");
  log(s, `Enrolled in ${c.name}. New earning options unlocked.`);
  return { state: s, notice: `${c.name} complete — ${c.unlocks}.` };
}

export function donate(prev: GameState, cause: string, amount: number, isZakat = false): ActionResult {
  if (amount <= 0) return fail(prev, "Enter an amount.");
  const available = prev.buckets.spend + (isZakat ? prev.buckets.save : 0);
  if (amount > available) return fail(prev, "Not enough available funds.");
  const s = clone(prev);
  let remaining = amount;
  const fromSpend = Math.min(remaining, s.buckets.spend);
  s.buckets.spend -= fromSpend;
  remaining -= fromSpend;
  if (remaining > 0) s.buckets.save -= remaining;
  const share = amount / Math.max(1, netWorth(prev));
  s.stats.community = clamp(s.stats.community + Math.min(15, 4 + Math.round(share * 100)));
  s.stats.wellbeing = clamp(s.stats.wellbeing + 3);
  tx(s, isZakat ? "Zakat" : `Donation — ${cause}`, -amount, "Giving");
  log(s, `${isZakat ? "Paid zakat of" : `Donated ${cause ? `to ${cause}` : ""}`} ${fmtAED(amount)}.`);
  return { state: s, notice: isZakat ? "Zakat paid. Wealth, purified." : "Donation made. It counts for more than the number." };
}

// ---------- Friends: open-text reply classification ----------

export interface ReplyOutcome {
  type: "accept" | "counterAccepted" | "counterRejected" | "declinePolite" | "declineBlunt";
  friendLine: string;
  cost: number;
  socialDelta: number;
}

export function respondInvitation(prev: GameState, invId: string, reply: string): ActionResult & { outcome?: ReplyOutcome } {
  const inv = prev.invitations.find((i) => i.id === invId);
  if (!inv || inv.status !== "pending") return fail(prev, "Invitation is no longer open.");
  const friend = getFriend(inv.friendId);
  const s = clone(prev);
  const sInv = s.invitations.find((i) => i.id === invId)!;
  const rand = rngFor(s.createdAt, s.week, `inv:${invId}`);
  const text = reply.trim().slice(0, 200);
  sInv.reply = text;
  const lower = text.toLowerCase();

  const numMatch = lower.replace(/,/g, "").match(/(\d+)/);
  const num = numMatch ? parseInt(numMatch[1], 10) : undefined;
  const acceptWords = /\b(yes|yeah|yep|sure|deal|keen|down|in|yalla|let'?s|count me|sounds good|ok(ay)?)\b/;
  const declineWords = /\b(no|nah|can'?t|cannot|pass|won'?t|not this|skip|sorry)\b/;
  const softWords = /\b(sorry|next time|another time|inshallah|wish|saving|budget|broke|tight|maybe later|rain ?check)\b/;
  const altWords = /\b(cheaper|instead|how about|what about|home|library|free|karak|park|corniche|split|somewhere else|budget option)\b/;

  let outcome: ReplyOutcome;
  const warmth = s.friends[inv.friendId].warmth;

  const isCounter =
    (num !== undefined && num < inv.cost && num >= 0 && !declineWords.test(lower)) ||
    (altWords.test(lower) && !declineWords.test(lower));

  if (isCounter) {
    const counterAmount = num !== undefined && num < inv.cost ? num : sInv.altCost;
    // reasonableness: offering a decent fraction, or a genuinely social alternative
    let chance = friend.acceptsAlternatives;
    const frac = counterAmount / Math.max(1, inv.cost);
    if (frac >= 0.35) chance += 0.2;
    else if (frac < 0.1 && !altWords.test(lower)) chance -= 0.3;
    if (warmth > 70) chance += 0.1;
    if (rand() < Math.max(0.05, Math.min(0.95, chance))) {
      const cost = Math.min(counterAmount, s.buckets.spend);
      s.buckets.spend -= cost;
      if (cost > 0) tx(s, `Out with ${friend.name} (your plan)`, -cost, "Social");
      const delta = 7;
      s.stats.social = clamp(s.stats.social + delta);
      s.stats.lifestyle = clamp(s.stats.lifestyle + 3);
      s.friends[inv.friendId].warmth = clamp(warmth + 4);
      sInv.status = "countered";
      sInv.resolution = `Went with your alternative (~${fmtAED(cost)}).`;
      outcome = { type: "counterAccepted", friendLine: friend.acceptAltLine, cost, socialDelta: delta };
    } else {
      sInv.status = "declined";
      sInv.resolution = "They went with the original plan without you.";
      const delta = 1;
      s.stats.social = clamp(s.stats.social + delta);
      s.friends[inv.friendId].warmth = clamp(warmth - 1);
      outcome = { type: "counterRejected", friendLine: friend.insistLine, cost: 0, socialDelta: delta };
    }
  } else if (acceptWords.test(lower) && !declineWords.test(lower)) {
    if (s.buckets.spend < inv.cost) return fail(prev, `Accepting costs ${fmtAED(inv.cost)} but Spend has ${fmtAED(prev.buckets.spend)}.`);
    if (s.actionsLeft < 1) return fail(prev, "No actions left this week to go out.");
    s.buckets.spend -= inv.cost;
    s.actionsLeft -= 1;
    tx(s, `Out with ${friend.name}`, -inv.cost, "Social");
    const delta = 9;
    s.stats.social = clamp(s.stats.social + delta);
    s.stats.lifestyle = clamp(s.stats.lifestyle + Math.min(8, Math.round(inv.cost / 50)));
    s.friends[inv.friendId].warmth = clamp(warmth + 5);
    sInv.status = "accepted";
    sInv.resolution = `You went. ${fmtAED(inv.cost)} well spent — probably.`;
    outcome = { type: "accept", friendLine: "It's a plan! 🎉", cost: inv.cost, socialDelta: delta };
  } else {
    const polite = softWords.test(lower) || text.length > 25;
    sInv.status = "declined";
    if (polite) {
      const delta = -2;
      s.stats.social = clamp(s.stats.social + delta);
      s.friends[inv.friendId].warmth = clamp(warmth - 1);
      sInv.resolution = "Declined kindly.";
      outcome = { type: "declinePolite", friendLine: friend.declineOkLine, cost: 0, socialDelta: delta };
    } else {
      const delta = -5;
      s.stats.social = clamp(s.stats.social + delta);
      s.friends[inv.friendId].warmth = clamp(warmth - 3);
      sInv.resolution = "Declined flatly.";
      outcome = { type: "declineBlunt", friendLine: friend.declineHurtLine, cost: 0, socialDelta: delta };
    }
  }
  return { state: s, outcome };
}

// ---------- News ----------

export function readNews(prev: GameState, newsId: string): ActionResult {
  const s = clone(prev);
  const n = s.news.find((x) => x.id === newsId);
  if (!n) return fail(prev, "Story not found.");
  if (n.read) return { state: prev };
  n.read = true;
  s.newsLiteracy.read += 1;
  let notice: string | undefined;
  if (n.editionWeek === s.week) {
    if (n.effect.kind === "retailSale" && n.willBeTrue && n.effect.locationId && n.effect.discountPct) {
      s.discounts.push({ locationId: n.effect.locationId, pct: n.effect.discountPct, expiresWeek: s.week });
      notice = `${n.effect.discountPct}% off unlocked at ${getLocation(n.effect.locationId)?.name} this week.`;
    } else if (n.effect.kind === "consumerAlert") {
      if (n.effect.alert === "subscription") s.flags.subShieldWeek = s.week;
      if (n.effect.alert === "scam") s.flags.scamShieldWeek = s.week;
      if (n.effect.alert === "bnpl") s.flags.bnplShieldWeek = s.week;
      notice = "Alert noted — you're protected from this one if it comes your way.";
    }
  }
  return { state: s, notice };
}

// ---------- Events / dilemmas resolution ----------

export function resolveEventAmount(prev: GameState, eventId: string, amount: number): ActionResult {
  const pe = prev.pendingEvents.find((e) => e.id === eventId && !e.resolved);
  if (!pe) return fail(prev, "Event not found.");
  const s = clone(prev);
  const spe = s.pendingEvents.find((e) => e.id === eventId && !e.resolved)!;
  const rand = rngFor(s.createdAt, s.week, `ev:${eventId}`);
  const amt = Math.max(0, Math.round(amount));

  switch (eventId) {
    case "ev-friend-borrow": {
      if (amt > s.buckets.spend) return fail(prev, "You can't lend more than your Spend balance.");
      spe.resolved = true;
      if (amt === 0) {
        s.stats.social = clamp(s.stats.social - 2);
        log(s, "You didn't lend anything. He said it's fine. It was probably fine.");
        return { state: s, notice: "You kept your money. Social −2." };
      }
      s.buckets.spend -= amt;
      s.loansOut.push({ amount: amt, dueWeek: s.week + 4, willRepay: rand() < 0.8 });
      s.stats.social = clamp(s.stats.social + Math.min(6, Math.ceil(amt / 40)));
      tx(s, "Lent to a friend", -amt, "Social");
      return { state: s, notice: `Lent ${fmtAED(amt)}. Repayment expected next month — usually.` };
    }
    case "ev-school-trip": {
      spe.resolved = true;
      if (amt >= 350) {
        if (s.buckets.spend < 350) return fail(prev, "Spend balance can't cover the AED 350.");
        s.buckets.spend -= 350;
        s.stats.social = clamp(s.stats.social + 10);
        s.stats.wellbeing = clamp(s.stats.wellbeing + 8);
        s.stats.lifestyle = clamp(s.stats.lifestyle + 6);
        tx(s, "School trip", -350, "Experiences");
        return { state: s, notice: "Trip booked. Social +10, Wellbeing +8. Some spending is investing." };
      }
      s.stats.social = clamp(s.stats.social - 3);
      return { state: s, notice: "You skipped the trip. The group chat will be unbearable for a week. Social −3." };
    }
    case "dl-family-help": {
      const available = s.buckets.spend + s.buckets.save;
      if (amt > available) return fail(prev, "That's more than your available Spend + Save.");
      spe.resolved = true;
      if (amt === 0) {
        s.stats.community = clamp(s.stats.community - 5);
        return { state: s, notice: "You stayed out of it. Community −5. Nobody said anything — which somehow felt worse." };
      }
      const fromSpend = Math.min(amt, s.buckets.spend);
      s.buckets.spend -= fromSpend;
      s.buckets.save -= amt - fromSpend;
      const shareOfWealth = amt / Math.max(1, netWorth(prev));
      const communityGain = Math.min(20, Math.round(5 + shareOfWealth * 60));
      s.stats.community = clamp(s.stats.community + communityGain);
      s.stats.social = clamp(s.stats.social + Math.min(10, Math.round(shareOfWealth * 30)));
      tx(s, "Helped family", -amt, "Family");
      return { state: s, notice: `You contributed ${fmtAED(amt)} — ${(shareOfWealth * 100).toFixed(0)}% of everything you have. Community +${communityGain}. It's the share that matters, not the sum.` };
    }
    case "dl-yousef-deal": {
      if (amt > s.buckets.spend + s.buckets.save) return fail(prev, "More than your available cash.");
      spe.resolved = true;
      if (amt === 0) return { state: s, notice: "You passed on Yousef's deal. He said you'd regret it. Maybe." };
      const fromSpend = Math.min(amt, s.buckets.spend);
      s.buckets.spend -= fromSpend;
      s.buckets.save -= amt - fromSpend;
      const multPct = Math.round(-80 + rand() * 200);
      s.ventures.push({ label: "Yousef's accessories venture", amount: amt, resolveWeek: s.week + 8, multPct });
      tx(s, "Staked Yousef's venture", -amt, "Investments");
      return { state: s, notice: `${fmtAED(amt)} staked. Results in 2 sim-months. No, you can't see the odds — that's the lesson.` };
    }
    case "dl-medical": {
      // amt = private clinic spend, 150-500
      if (amt < 150) return fail(prev, "Private clinics start at AED 150.");
      if (amt > s.buckets.spend) return fail(prev, "Not enough in Spend.");
      if (s.actionsLeft < 1) return fail(prev, "No actions left this week.");
      spe.resolved = true;
      s.buckets.spend -= amt;
      s.actionsLeft -= 1;
      s.flags.sickWeeksLeft = 0;
      const boost = Math.min(20, 8 + Math.round(amt / 50));
      s.stats.wellbeing = clamp(s.stats.wellbeing + boost);
      tx(s, "Private clinic visit", -amt, "Health");
      return { state: s, notice: `Seen same-day. Wellbeing +${boost}. Health is the one bill you never regret paying.` };
    }
    default:
      return fail(prev, "This event doesn't take an amount.");
  }
}

export function resolveEventChoice(prev: GameState, eventId: string, choice: string): ActionResult {
  const pe = prev.pendingEvents.find((e) => e.id === eventId && !e.resolved);
  if (!pe) return fail(prev, "Event not found.");
  const s = clone(prev);
  const spe = s.pendingEvents.find((e) => e.id === eventId && !e.resolved)!;

  if (eventId === "dl-laptop" && choice === "library") {
    spe.resolved = true;
    s.flags.libraryWeeksLeft = 2;
    return { state: s, notice: "Library plan it is: two weeks, 1 action and some energy per week, AED 0." };
  }
  if (eventId === "dl-medical" && choice === "public") {
    if (s.actionsLeft < 1) return fail(prev, "No actions left this week.");
    spe.resolved = true;
    s.actionsLeft -= 1;
    s.buckets.spend -= Math.min(10, s.buckets.spend);
    s.flags.sickWeeksLeft = 0;
    s.stats.energy = clamp(s.stats.energy - 10);
    s.stats.wellbeing = clamp(s.stats.wellbeing + 10);
    tx(s, "Public clinic visit", -10, "Health");
    return { state: s, notice: "Four hours in the waiting room (Energy −10), but treated for nearly nothing. Wellbeing +10." };
  }
  if (eventId === "dl-job-offer") {
    spe.resolved = true;
    if (choice === "accept") {
      s.flags.newJob = true;
      return { state: s, notice: "You took the job. AED 2,800/month from next payday — minus AED 400 transport, one action a week, and easy Fridays with friends." };
    }
    return { state: s, notice: "You declined. Sometimes the raise isn't worth the life around it." };
  }
  if (choice === "dismiss") {
    spe.resolved = true;
    if (eventId === "dl-phone-stolen") return { state: s, notice: "No phone for now. Social and Lifestyle will keep slipping until you replace it." };
    if (eventId === "ev-sneaker-drop") return { state: s, notice: "You let the drop pass. Your wallet nods approvingly." };
    if (eventId === "ev-phone-crack") return { state: s, notice: "Living with the crack. Minor ongoing Lifestyle hit until repaired." };
    if (eventId === "dl-medical") {
      return { state: s, notice: "Ignoring it. Wellbeing will keep dropping for 3 weeks. Bold strategy." };
    }
    if (eventId === "dl-laptop") return { state: s, notice: "Left unresolved — the Energy drain continues until you deal with it." };
    return { state: s };
  }
  return fail(prev, "Unknown choice.");
}

// ---------- Goals ----------

export function addGoal(prev: GameState, name: string, target: number, weeklyAmount: number): ActionResult {
  if (!name.trim()) return fail(prev, "Give the goal a name.");
  if (target <= 0 || weeklyAmount <= 0) return fail(prev, "Target and weekly amount must be positive.");
  const s = clone(prev);
  s.goals.push({ id: uid("goal"), name: name.trim(), target: Math.round(target), saved: 0, weeklyAmount: Math.round(weeklyAmount) });
  log(s, `New goal: ${name.trim()} — ${fmtAED(target)}.`);
  return { state: s, notice: "Goal created. It funds itself weekly from Spend." };
}

export function cancelGoal(prev: GameState, goalId: string): ActionResult {
  const s = clone(prev);
  const g = s.goals.find((x) => x.id === goalId);
  if (!g) return fail(prev, "Goal not found.");
  s.goals = s.goals.filter((x) => x.id !== goalId);
  return { state: s, notice: `Goal removed. The ${fmtAED(g.saved)} already saved stays in your Save bucket.` };
}

// ---------- Derived metrics for UI ----------

export function savingsRate(s: GameState, month: number): number {
  const inc = monthIncome(s, month);
  if (inc <= 0) return 0;
  return Math.round((1 - monthSpending(s, month) / inc) * 100);
}

export function currentMonth(s: GameState): number {
  return monthOf(s.week);
}

export { monthSpending, monthIncome };

export function spendingByCategory(s: GameState, fromWeek: number, toWeek: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of s.txns) {
    if (t.amount < 0 && t.week >= fromWeek && t.week <= toWeek) {
      out[t.category] = (out[t.category] ?? 0) - t.amount;
    }
  }
  return out;
}

export interface YearGrades {
  [k: string]: { grade: string; note: string };
}

function letter(x: number): string {
  return x >= 90 ? "A" : x >= 75 ? "B" : x >= 55 ? "C" : x >= 35 ? "D" : "E";
}

export function yearReview(s: GameState): { grades: YearGrades; netStart: number; netNow: number } {
  const netStart = s.history[0]?.netWorth ?? STARTING_BALANCE;
  const netNow = netWorth(s);
  const invested = s.holdings.reduce((a, h) => a + h.value, 0);
  const groups = new Set(s.holdings.filter((h) => h.value > 50).map((h) => ASSETS.find((a) => a.id === h.assetId)?.group));
  const giving = s.txns.filter((t) => t.category === "Giving").reduce((a, t) => a - t.amount, 0);
  const skills = s.coursesOwned.length;
  const months = Math.max(1, currentMonth(s) - 1);
  const avgSavings = Array.from({ length: months }, (_, i) => savingsRate(s, i + 1)).reduce((a, b) => a + b, 0) / months;
  const emergencyMonths = s.buckets.save / 450; // vs monthly bills
  const socialBalance = s.stats.social;
  const lit = s.newsLiteracy;
  const litScore = lit.read === 0 ? 0 : Math.min(100, 40 + lit.read * 3 + lit.hits * 5 - lit.misses * 2);

  const grades: YearGrades = {
    Savings: { grade: letter(Math.min(100, avgSavings * 2.2)), note: `Average savings rate ${avgSavings.toFixed(0)}%.` },
    Diversification: { grade: letter(Math.min(100, groups.size * 28)), note: `${groups.size} asset group${groups.size === 1 ? "" : "s"} held (${invested > 0 ? fmtAED(invested) + " invested" : "nothing invested"}).` },
    "Emergency Fund": { grade: letter(Math.min(100, emergencyMonths * 30)), note: `Save bucket covers ~${emergencyMonths.toFixed(1)} months of bills.` },
    Generosity: { grade: letter(Math.min(100, (giving / Math.max(1, netNow)) * 900 + (giving > 0 ? 25 : 0))), note: giving > 0 ? `${fmtAED(giving)} given.` : "No donations yet." },
    "Skill Investment": { grade: letter(Math.min(100, skills * 35)), note: `${skills} course${skills === 1 ? "" : "s"} completed.` },
    "Peer Balance": { grade: letter(socialBalance), note: `Social sits at ${socialBalance} — saying yes and no in workable proportion.` },
    "News Literacy": { grade: letter(litScore), note: `${lit.read} stories read; forecast hit rate ${lit.hits + lit.misses > 0 ? Math.round((lit.hits / (lit.hits + lit.misses)) * 100) + "%" : "n/a"}.` },
  };
  return { grades, netStart, netNow };
}
