export interface AssetDef {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4;
  group: "equity" | "gold" | "bonds" | "reit" | "crypto";
  halal?: boolean;
  avgMoPct: number; // average monthly return %
  minMoPct: number;
  maxMoPct: number;
  lockMonths?: number;
  riskWarning?: boolean;
  blurb: string;
}

export const ASSETS: AssetDef[] = [
  {
    id: "savings",
    name: "Savings account",
    tier: 1,
    group: "bonds",
    avgMoPct: 0.5,
    minMoPct: 0.5,
    maxMoPct: 0.5,
    blurb: "Zero risk. Your money grows slowly but never shrinks.",
  },
  {
    id: "index",
    name: "Diversified index fund",
    tier: 1,
    group: "equity",
    avgMoPct: 1.0,
    minMoPct: -4,
    maxMoPct: 5,
    blurb: "A slice of hundreds of companies. Bumpy months, steady years.",
  },
  {
    id: "halal-equity",
    name: "Sharia-compliant equity fund",
    tier: 1,
    group: "equity",
    halal: true,
    avgMoPct: 0.9,
    minMoPct: -3.5,
    maxMoPct: 4.5,
    blurb: "Screened for Sharia compliance. Halal-labeled equity exposure.",
  },
  {
    id: "bonds",
    name: "Corporate bonds",
    tier: 2,
    group: "bonds",
    avgMoPct: 0.7,
    minMoPct: -1,
    maxMoPct: 2,
    blurb: "Lending to companies for steady, modest returns.",
  },
  {
    id: "gold",
    name: "Gold",
    tier: 2,
    group: "gold",
    avgMoPct: 0.6,
    minMoPct: -3,
    maxMoPct: 4,
    blurb: "The classic store of value. Shines when markets wobble.",
  },
  {
    id: "sukuk",
    name: "Sukuk",
    tier: 2,
    group: "bonds",
    halal: true,
    avgMoPct: 0.65,
    minMoPct: -1,
    maxMoPct: 2,
    blurb: "Sharia-compliant certificates — the halal counterpart to bonds.",
  },
  {
    id: "reit",
    name: "REITs / Real estate fund",
    tier: 3,
    group: "reit",
    avgMoPct: 1.1,
    minMoPct: -5,
    maxMoPct: 6,
    blurb: "Own slivers of towers and malls without buying a building.",
  },
  {
    id: "emerging",
    name: "Emerging markets fund",
    tier: 3,
    group: "equity",
    avgMoPct: 1.3,
    minMoPct: -7,
    maxMoPct: 8,
    blurb: "Fast-growing economies. Higher highs, lower lows.",
  },
  {
    id: "frac-re",
    name: "Fractional real estate",
    tier: 4,
    group: "reit",
    avgMoPct: 1.0,
    minMoPct: -3,
    maxMoPct: 4,
    lockMonths: 3,
    blurb: "A share of a specific property. Locked for 3 sim-months once bought.",
  },
  {
    id: "crypto",
    name: "Crypto fund",
    tier: 4,
    group: "crypto",
    avgMoPct: 1.5,
    minMoPct: -12,
    maxMoPct: 15,
    riskWarning: true,
    blurb: "Extreme swings both ways. Only what you can afford to lose.",
  },
  {
    id: "smallbiz",
    name: "Small business investment",
    tier: 4,
    group: "equity",
    avgMoPct: 1.4,
    minMoPct: -8,
    maxMoPct: 10,
    lockMonths: 6,
    blurb: "Back a local venture. Locked for 6 sim-months once invested.",
  },
];

export interface TierRule {
  tier: 1 | 2 | 3 | 4;
  month: number;
  netWorth: number;
  label: string;
}

export const TIER_RULES: TierRule[] = [
  { tier: 1, month: 0, netWorth: 0, label: "Available from the start" },
  { tier: 2, month: 6, netWorth: 0, label: "Unlocks at sim-month 6" },
  {
    tier: 3,
    month: 12,
    netWorth: 3000,
    label: "Unlocks at sim-month 12 + AED 3,000 net worth",
  },
  {
    tier: 4,
    month: 18,
    netWorth: 8000,
    label: "Unlocks at sim-month 18 + AED 8,000 net worth",
  },
];

export function tierUnlocked(
  tier: 1 | 2 | 3 | 4,
  month: number,
  netWorth: number
): boolean {
  const r = TIER_RULES.find((t) => t.tier === tier)!;
  return month >= r.month && netWorth >= r.netWorth;
}
