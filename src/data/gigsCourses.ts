export interface GigDef {
  id: string;
  name: string;
  pay: [number, number]; // min, max
  actions: number;
  requiresCourse?: string;
  alwaysAvailable?: boolean;
  blurb: string;
}

export const GIGS: GigDef[] = [
  { id: "tutoring", name: "Tutoring", pay: [80, 80], actions: 1, blurb: "Help a neighbour's kid with maths after school." },
  { id: "event-help", name: "Weekend event help", pay: [200, 200], actions: 2, blurb: "Setup and ushering at a weekend exhibition." },
  { id: "freelance-design", name: "Freelance design", pay: [300, 300], actions: 2, requiresCourse: "design", blurb: "Logo and social posts for a small business." },
  { id: "content", name: "Content creation", pay: [150, 500], actions: 2, requiresCourse: "digital", blurb: "Short-form video for a local brand. Pay varies with performance." },
  { id: "delivery", name: "Delivery shift", pay: [120, 120], actions: 1, alwaysAvailable: true, blurb: "An evening of deliveries. Always available, always tiring." },
  { id: "premium-tutoring", name: "Premium tutoring", pay: [400, 400], actions: 3, requiresCourse: "language", blurb: "Private language coaching for a family." },
  { id: "event-hosting", name: "Event hosting", pay: [300, 300], actions: 2, requiresCourse: "speaking", blurb: "MC a community event. Unlocked by the Public Speaking Workshop." },
  { id: "bookkeeping", name: "Part-time bookkeeping", pay: [250, 250], actions: 2, requiresCourse: "modeling", blurb: "Monthly books for a small trading company." },
];

export interface CourseDef {
  id: string;
  name: string;
  price: number;
  unlocks: string;
  payback: string;
  blurb: string;
  socialBonus?: number;
}

export const COURSES: CourseDef[] = [
  { id: "design", name: "Design Course", price: 400, unlocks: "Freelance design gigs (AED 300 each)", payback: "Typically pays for itself in 2 gigs", blurb: "Figma, layout, and brand basics over six evening sessions." },
  { id: "digital", name: "Digital Skills Course", price: 350, unlocks: "Content creation gigs (AED 150–500)", payback: "Typically pays for itself in 1–3 gigs", blurb: "Editing, posting cadence, and what actually gets views." },
  { id: "language", name: "Language Course", price: 500, unlocks: "Premium tutoring (AED 400 per session)", payback: "Typically pays for itself in 2 gigs", blurb: "Certification that lets you charge premium tutoring rates." },
  { id: "modeling", name: "Financial Modeling Course", price: 600, unlocks: "Part-time bookkeeping (AED 250/mo)", payback: "Typically pays for itself in 3 months", blurb: "Spreadsheets that businesses will pay you to keep tidy." },
  { id: "speaking", name: "Public Speaking Workshop", price: 250, unlocks: "Event hosting gigs (AED 300/session) + small Social boost", payback: "Typically pays for itself in 1 gig", blurb: "A weekend workshop. Confidence compounds.", socialBonus: 5 },
];
