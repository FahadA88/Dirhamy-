# Dirhamy — UAE Teen Financial Literacy Simulator

A complete financial-life simulation web app for UAE teens aged 16–18. You're 16, living in the
UAE, with a part-time salary of AED 2,000/month. Parents cover rent and food — everything else
is on you: spending, saving, investing, friends, news, and consequences.

## Run it

```bash
npm install
npm run dev      # local dev server
npm run build    # typecheck + production build to dist/
npm run preview  # serve the production build
```

No backend required — it's a self-contained React + Vite + TypeScript SPA. All state
(accounts and full simulation state per account) persists in `localStorage`.

## What's inside

- **Auth & accounts** — email/password sign-up and login (local, demo-grade hashing), plus a
  clearly-labelled demo "Continue with Google" (real OAuth needs server credentials, which a
  static SPA doesn't have). Full simulation state persists per account.
- **Two modes** — Solo (turn-based "Next Week") and Live (1 real day = 1 sim-week, catch-up
  summary on return). Switching modes resets the run, with a warning.
- **Brand system** — emerald `#0F4C3A` / gold `#C9A961` / warm off-white `#FAFAF7`, Fraunces +
  Inter, Lucide icons at 1.5px stroke, 8-point grid, 1px borders, hover-only shadows, amber
  (never red) for negatives.
- **App shell** — 260px sidebar (Quick Access / Life / Progress + contextual prompt card),
  64px top bar (breadcrumbs, ⌘/ search, notification dot, avatar menu), responsive down to
  a drawer on mobile.
- **Dashboard** — net-worth hero, three metric cards with sparklines, Spend/Save/Invest
  allocation sliders (default 50/30/20, fully open), payslip modal (gross, end-of-service,
  bills, BNPL, VAT estimate), four-column "This week" kanban.
- **Core sim** — AED 2,500 start, AED 2,000 salary, fixed bills (phone 150 / transport 200 /
  family 100), five hidden stats with weekly decay and consequences, 5 actions per sim-week.
- **Investments** — 11 assets across 4 unlocking tiers (savings → index/halal equity →
  bonds/gold/sukuk → REITs/emerging → fractional real estate/crypto/small business), monthly
  returns within honest ranges, lock-ups, crypto risk-warning modal, open amount inputs,
  permanent educational disclaimer.
- **Locations** — 13 shoppable places (supermarket cart, pharmacy, café, 3-tier restaurants,
  mall with fast-vs-premium quality tiers, electronics with BNPL, bookstore/library,
  entertainment, gym, salon, gifts, travel agency unlocking at month 3), seeded catalog data,
  Daily-reader discounts, impulse-purchase confirmation over 20% of Spend.
- **The Daily** — weekly editorial newspaper: 44 news templates across 5 categories with
  variable substitution (never free-form AI text), Confirmed/Forecast/Speculation reliability
  tiers (100/70/50% accurate), retail discounts and consumer-alert shields unlocked by
  reading, market/real-estate/salary effects, outcome feedback and a hidden News Literacy
  stat, missed-opportunity digest.
- **Friends** — Layla (trend chaser), Omar (saver), Yousef (balanced); 1–3 weekly invitations
  answered by open text (200 chars) with dismissible suggestion chips; replies are classified
  (accept / counter-offer with any amount / polite or blunt decline) and friends respond by
  personality; Social scales with outcome.
- **Work & gigs** — weekly refreshing gig board, course-gated gigs, delivery always available.
- **Learn** — 5 courses that permanently unlock earning options, with payback framing.
- **Reserve & Save** — on any item over AED 300: open weekly amount, auto-transfers, ~25%
  sale chance while reserved, cancel anytime, max 3.
- **Give** — open-amount charity by cause and a simplified zakat calculator (nisab AED 3,500,
  2.5% suggested, any amount, dignified educational note, no gamification).
- **Events & dilemmas** — 12-card monthly event deck (same order for everyone) plus 6
  open-ended dilemmas every third month; every decision surface is open input (numeric with
  AED prefix and balance context, or free text) — no fixed 3-button choices.
- **Feedback layer** — health check with spending breakdown and plain-language insight,
  post-loss diversification explainers, weekly digest, year-end report card with letter
  grades in 7 areas (never a single score).
- **Gamification, restrained** — savings-streak counter and exactly 5 badges. No leaderboards,
  no points, no parallel currency.

## Deviations from the original spec (and why)

- **Real OAuth (Google/Apple)** needs a backend or hosted auth provider; the Google button is
  a labelled local demo account instead. Swap in a real provider when a backend exists.
- **Live mode advances on load** (catching up one sim-week per elapsed real day, capped at 8)
  rather than at a server-side 00:00 UTC tick — there is no server.
- The landing navbar is a hand-rolled equivalent of the shadcn Navbar1 (menu, Learn submenu,
  auth buttons) to keep the dependency tree at four packages.

Everything in this app is educational simulation — not real investing, banking, or financial
advice.
