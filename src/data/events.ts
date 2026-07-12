// Regular event deck (12) — one drawn per sim-month, same order for all users.
// Dilemma cards (6) — open-ended, drawn every 3rd month.

export interface EventDef {
  id: string;
  title: string;
  body: string;
  // how the UI resolves it
  resolver:
    | "auto" // applied automatically, informational
    | "openAmount" // numeric open input
    | "navigate" // user navigates to a location freely
    | "offer"; // accept / decline / leave pending (job offer)
  amount?: number;
  navigateTo?: string;
  meta?: Record<string, number | string>;
}

export const EVENT_DECK: EventDef[] = [
  {
    id: "ev-phone-crack",
    title: "Your phone screen cracked",
    body: "It slipped off the majlis armrest. Still works, but the crack is spreading. Repair costs AED 250 at the Electronics store — or live with it (small ongoing hit to Lifestyle Satisfaction until fixed).",
    resolver: "navigate",
    navigateTo: "electronics",
  },
  {
    id: "ev-eidiya",
    title: "Eid Mubarak — AED 300 Eidiya",
    body: "Between grandparents, uncles and aunts, you collected AED 300 in Eidiya. It's been added to your pending income — allocate it across Spend, Save and Invest.",
    resolver: "auto",
    amount: 300,
  },
  {
    id: "ev-market-dip",
    title: "Markets dip sharply",
    body: "A rough week across DFM, ADX and global markets. All investments will land near the low end of their range this month. Selling now locks in losses; holding rides it out.",
    resolver: "auto",
  },
  {
    id: "ev-market-rally",
    title: "Markets rally",
    body: "Strong earnings and upbeat sentiment. All investments will land near the high end of their range this month.",
    resolver: "auto",
  },
  {
    id: "ev-bonus",
    title: "AED 200 employer bonus",
    body: "Your manager noticed you covering extra shifts. A one-off AED 200 bonus lands in your pending income.",
    resolver: "auto",
    amount: 200,
  },
  {
    id: "ev-friend-borrow",
    title: "A friend asks to borrow AED 150",
    body: "A classmate is short before his family's salary day and asks to borrow AED 150 until next month. He's usually reliable. How much do you lend? (He'll repay 80% of the time next month.)",
    resolver: "openAmount",
    amount: 150,
    meta: { repayChance: 0.8 },
  },
  {
    id: "ev-sneaker-drop",
    title: "Limited sneaker drop this weekend",
    body: "The pair everyone's talking about drops Saturday — AED 400, and resale is unpredictable. If you want them, head to the Mall. If not, do nothing and this passes.",
    resolver: "navigate",
    navigateTo: "mall",
  },
  {
    id: "ev-transport-double",
    title: "Transport costs doubled this month",
    body: "Your usual route is closed for metro works and the alternative costs more. This month's transport bill will be AED 400 instead of AED 200.",
    resolver: "auto",
  },
  {
    id: "ev-school-trip",
    title: "School trip opportunity — AED 350",
    body: "A three-day school trip with your class. AED 350 covers everything. Big boost to Social and Wellbeing if you go. Decide how much to pay — AED 0 means you skip it.",
    resolver: "openAmount",
    amount: 350,
  },
  {
    id: "ev-weekend-gig",
    title: "Surprise weekend gig — AED 250",
    body: "A neighbour needed last-minute help at their shop. AED 250 earned — added to your pending income.",
    resolver: "auto",
    amount: 250,
  },
  {
    id: "ev-forgotten-sub",
    title: "Forgotten subscription charged AED 60",
    body: "A streaming trial you forgot to cancel just billed AED 60. It's been deducted. Lesson noted: audit your subscriptions.",
    resolver: "auto",
    amount: -60,
  },
  {
    id: "ev-wedding",
    title: "Family wedding contribution",
    body: "Your cousin is getting married and the family is pooling contributions. Your share is AED 100 — deducted this month. Community rises a little; weddings are worth it.",
    resolver: "auto",
    amount: -100,
  },
];

export interface DilemmaDef {
  id: string;
  title: string;
  body: string;
  resolver: "navigate" | "openAmount" | "offer" | "laptop" | "medical" | "invest";
}

export const DILEMMAS: DilemmaDef[] = [
  {
    id: "dl-laptop",
    title: "Your laptop died mid-assignment",
    body: "It won't turn on. Options are yours to figure out: repair it at the Electronics store (AED 400), replace it with any laptop in your budget, or use the library computers for two weeks (costs 1 action per week and drains Energy). No buttons here — go handle it, or toggle the library plan below.",
    resolver: "laptop",
  },
  {
    id: "dl-family-help",
    title: "A family member quietly needs help",
    body: "An uncle's business had a bad quarter and your mother hints the family is gathering what they can. Nobody will ask you directly. You can contribute anything from AED 0 to everything you have. The impact on Community and family closeness scales with what the amount means relative to what you have — not the raw number.",
    resolver: "openAmount",
  },
  {
    id: "dl-medical",
    title: "You've been feeling genuinely unwell",
    body: "Two weeks of headaches and fatigue. Your choices, handled wherever you want: the Pharmacy for over-the-counter help, a private clinic (fast, AED 150–500 depending on level), the public clinic (nearly free, but the waiting costs you a week of low Energy) — or ignore it, and Wellbeing drops for the next 3 weeks.",
    resolver: "medical",
  },
  {
    id: "dl-phone-stolen",
    title: "Your phone was stolen",
    body: "Gone from your bag after training. Report filed, but don't hold your breath. You can replace it with anything from the Electronics store — entry model to flagship, BNPL if you dare — or tough it out with no phone (ongoing Social and Lifestyle hit until you replace it).",
    resolver: "navigate",
  },
  {
    id: "dl-yousef-deal",
    title: "Yousef has an 'opportunity'",
    body: "Yousef's older brother is importing phone accessories and needs small backers. \"Put in whatever you want — we split profits in 2 months.\" It could return anywhere from -80% to +120%, scaled to whatever you stake. Enter any amount from AED 0 up.",
    resolver: "invest",
  },
  {
    id: "dl-job-offer",
    title: "Job offer in another emirate",
    body: "A retailer in another emirate offers AED 2,800/month — AED 800 more than now. But commuting costs AED 400/month extra in transport, you'd lose 1 action every week to travel, and seeing friends gets harder (slow Social decay). Accept, decline, or sit on it for up to 2 weeks.",
    resolver: "offer",
  },
];
