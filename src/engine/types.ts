// Core simulation types. 1 sim-month = 4 sim-weeks.

export type Mode = "solo" | "live";

export type Reliability = "confirmed" | "forecast" | "speculation";

export type NewsCategory =
  | "Markets"
  | "Retail"
  | "Real Estate"
  | "Jobs & Economy"
  | "Consumer Alerts";

export interface NewsEffect {
  kind: "retailSale" | "marketSkew" | "realEstate" | "consumerAlert" | "salary";
  locationId?: string;
  discountPct?: number;
  assetGroup?: "equity" | "gold" | "bonds" | "reit" | "crypto" | "all";
  direction?: 1 | -1;
  salaryPct?: number;
  alert?: "bnpl" | "scam" | "subscription";
}

export interface NewsItem {
  id: string;
  templateId: string;
  editionWeek: number;
  category: NewsCategory;
  reliability: Reliability;
  headline: string;
  body: string[];
  affects: string;
  effect: NewsEffect;
  willBeTrue: boolean;
  read: boolean;
  outcomeShown?: boolean;
  outcomeMatched?: boolean;
}

export interface Transaction {
  id: string;
  week: number;
  label: string;
  amount: number; // signed; negative = money out
  category: string;
  locationId?: string;
}

export interface Holding {
  assetId: string;
  value: number;
  invested: number; // total principal put in
  lockedUntilWeek?: number;
}

export interface Reservation {
  id: string;
  itemId: string;
  itemName: string;
  locationId: string;
  price: number;
  weeklyAmount: number;
  saved: number;
  startedWeek: number;
  salePrice?: number;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  saved: number;
  weeklyAmount: number;
  completedWeek?: number;
}

export interface Invitation {
  id: string;
  friendId: string;
  week: number;
  text: string;
  cost: number;
  altCost: number; // cost of a cheaper alternative if negotiated
  status: "pending" | "accepted" | "countered" | "declined" | "expired";
  reply?: string;
  resolution?: string;
}

export interface OwnedItem {
  itemId: string;
  name: string;
  week: number;
  breaksAtWeek?: number;
}

export interface BnplPlan {
  id: string;
  itemName: string;
  remaining: number; // payments left
  monthly: number;
  ratePct: number;
}

export interface Stats {
  energy: number;
  wellbeing: number;
  social: number;
  community: number;
  lifestyle: number;
}

export interface WeekSnapshot {
  week: number;
  netWorth: number;
  spend: number;
  save: number;
  invested: number;
  spentThisWeek: number;
}

export interface PendingEvent {
  id: string;
  kind: "event" | "dilemma";
  month: number;
  resolved: boolean;
  data?: Record<string, unknown>;
}

export interface PayslipInfo {
  month: number;
  gross: number;
  eos: number;
  bonusNote?: string;
  bills: { label: string; amount: number }[];
  bnpl: number;
  net: number;
  vatEstimate: number;
  statPenalty: boolean;
}

export interface DigestInfo {
  week: number;
  byCategory: Record<string, number>;
  prevByCategory: Record<string, number>;
  missedNews: string[];
  notes: string[];
}

export interface GameState {
  version: number;
  displayName: string;
  avatarColor: string;
  mode: Mode;
  week: number; // starts at 1
  actionsLeft: number;
  pendingIncome: number; // awaiting Spend/Save/Invest allocation
  buckets: { spend: number; save: number; investCash: number; reserved: number };
  holdings: Holding[];
  stats: Stats;
  newsLiteracy: { read: number; acted: number; hits: number; misses: number };
  txns: Transaction[];
  reservations: Reservation[];
  goals: Goal[];
  invitations: Invitation[];
  news: NewsItem[];
  coursesOwned: string[];
  badges: string[];
  streakMonths: number;
  bestStreak: number;
  gigBoard: string[];
  gigsThisWeek: string[];
  ownedItems: OwnedItem[];
  bnpl: BnplPlan[];
  friends: Record<string, { warmth: number }>;
  discounts: { locationId: string; pct: number; expiresWeek: number }[];
  marketSkews: { assetGroup: string; direction: 1 | -1; untilWeek: number }[];
  salaryModPct: number; // next-month salary modifier from news/events
  transportDoubleMonth?: number;
  loansOut: { amount: number; dueWeek: number; willRepay: boolean }[];
  ventures: { label: string; amount: number; resolveWeek: number; multPct: number }[];
  flags: {
    phoneCracked?: boolean;
    phoneLost?: boolean;
    laptopBroken?: boolean;
    libraryWeeksLeft?: number;
    sickWeeksLeft?: number;
    newJob?: boolean;
    jobOfferExpiresWeek?: number;
    scamShieldWeek?: number;
    subShieldWeek?: number;
    bnplShieldWeek?: number;
    marketDipMonth?: number;
    marketRallyMonth?: number;
    heldThroughDip?: boolean;
  };
  pendingEvents: PendingEvent[];
  eventLog: { week: number; text: string }[];
  history: WeekSnapshot[];
  lastPayslip?: PayslipInfo;
  lastDigest?: DigestInfo;
  awaySummary?: string[];
  lastAdvancedDay?: string; // ISO date, live mode
  monthEventIndex: number;
  createdAt: string;
  yearReviewSeen?: boolean;
}

export interface Account {
  id: string;
  email: string;
  passwordHash: string;
  provider: "email" | "google";
  displayName: string;
}

export const WEEKS_PER_MONTH = 4;
export const ACTIONS_PER_WEEK = 5;
export const STARTING_BALANCE = 2500;
export const MONTHLY_SALARY = 2000;
export const NISAB = 3500;

export function monthOf(week: number): number {
  return Math.ceil(week / WEEKS_PER_MONTH);
}

export function netWorth(s: GameState): number {
  return (
    s.buckets.spend +
    s.buckets.save +
    s.buckets.investCash +
    s.buckets.reserved +
    s.pendingIncome +
    s.holdings.reduce((a, h) => a + h.value, 0) +
    s.ventures.reduce((a, v) => a + v.amount, 0)
  );
}

export function fmtAED(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}AED ${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}
