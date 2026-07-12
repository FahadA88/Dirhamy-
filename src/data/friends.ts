export interface FriendDef {
  id: string;
  name: string;
  archetype: string;
  color: string;
  // invitation templates: {cost} substituted
  invites: { text: string; cost: [number, number]; altPct: number }[];
  // probability weights of sending an invite in a given week
  frequency: number;
  acceptsAlternatives: number; // 0..1 base chance of accepting a reasonable counter
  insistLine: string;
  acceptAltLine: string;
  declineOkLine: string;
  declineHurtLine: string;
}

export const FRIENDS: FriendDef[] = [
  {
    id: "layla",
    name: "Layla",
    archetype: "Trend Chaser",
    color: "#C9A961",
    frequency: 0.75,
    acceptsAlternatives: 0.25,
    invites: [
      { text: "New rooftop restaurant opening Friday — dinner? AED {cost}pp 🤍", cost: [180, 260], altPct: 0.3 },
      { text: "The sneaker drop is THIS weekend. Camping the queue with me? AED {cost}", cost: [350, 450], altPct: 0.2 },
      { text: "Girls are doing the new padel place + dinner after. AED {cost} all in", cost: [150, 220], altPct: 0.4 },
      { text: "Concert tickets go live tonight!! AED {cost} for the good section", cost: [300, 500], altPct: 0.35 },
      { text: "Beach club day pass Saturday? Everyone's going. AED {cost}", cost: [200, 320], altPct: 0.3 },
      { text: "That omakase place finally has a table. Split it? AED {cost}pp", cost: [250, 320], altPct: 0.25 },
    ],
    insistLine: "Nooo it has to be the real thing, that's the whole point! You in or not?",
    acceptAltLine: "Okay fine, that actually sounds cute. You're lucky I like you.",
    declineOkLine: "Ugh okay. You owe me next time though!",
    declineHurtLine: "You've bailed like every time lately... okay.",
  },
  {
    id: "omar",
    name: "Omar",
    archetype: "Saver",
    color: "#0F4C3A",
    frequency: 0.45,
    acceptsAlternatives: 0.9,
    invites: [
      { text: "Cooking machboos at mine Friday, just bring dessert? ~AED {cost}", cost: [20, 40], altPct: 1 },
      { text: "Library study session then karak after? AED {cost} max", cost: [10, 20], altPct: 1 },
      { text: "Free outdoor cinema at the park this weekend. Snacks ~AED {cost}?", cost: [15, 30], altPct: 1 },
      { text: "Corniche cycle + breakfast cafeteria run? AED {cost}", cost: [25, 40], altPct: 1 },
      { text: "There's a free workshop at the youth hub Saturday. Karak on me after — you in?", cost: [0, 0], altPct: 1 },
    ],
    insistLine: "Haha fair, it was already the cheap option though!",
    acceptAltLine: "Even better. Deal.",
    declineOkLine: "No stress, next time inshallah.",
    declineHurtLine: "All good... we haven't hung out in a while though.",
  },
  {
    id: "yousef",
    name: "Yousef",
    archetype: "Balanced",
    color: "#5B7268",
    frequency: 0.55,
    acceptsAlternatives: 0.6,
    invites: [
      { text: "Match tickets Thursday — decent seats AED {cost}. Keen?", cost: [90, 140], altPct: 0.6 },
      { text: "New burger spot, people say it's worth it. AED {cost}ish?", cost: [50, 70], altPct: 0.7 },
      { text: "Karting Saturday morning? AED {cost} for the group rate", cost: [100, 130], altPct: 0.5 },
      { text: "Cinema + arcade night? Should be about AED {cost}", cost: [70, 100], altPct: 0.7 },
      { text: "Desert BBQ with the cousins Friday, chip in AED {cost} for supplies?", cost: [40, 60], altPct: 0.8 },
    ],
    insistLine: "Hmm, meet me halfway? I'll cover part if you come.",
    acceptAltLine: "Yeah that works, smart. See you there.",
    declineOkLine: "All good bro, next one's on me.",
    declineHurtLine: "You keep dodging us man... hope everything's okay.",
  },
];

export function getFriend(id: string): FriendDef {
  return FRIENDS.find((f) => f.id === id)!;
}
