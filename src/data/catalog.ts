// Seeded product catalog. Generated once as data — never AI-generated per shop.

export interface Item {
  id: string;
  name: string;
  price: number;
  section: string;
  effect?: Partial<{
    energy: number;
    wellbeing: number;
    social: number;
    community: number;
    lifestyle: number;
  }>;
  breaksAfterMonths?: number; // cheap quality tiers wear out
  note?: string;
}

export interface LocationDef {
  id: string;
  name: string;
  tagline: string;
  icon: string; // lucide icon name key used by UI
  accent: string; // subtle tint
  necessary?: boolean;
  unlockMonth?: number;
  bnpl?: boolean;
  items: Item[];
}

const su = (
  id: string,
  name: string,
  price: number,
  section: string,
  energy = 0
): Item => ({ id, name, price, section, effect: energy ? { energy } : undefined });

export const LOCATIONS: LocationDef[] = [
  {
    id: "supermarket",
    name: "Supermarket",
    tagline: "Weekly groceries keep your energy up.",
    icon: "shopping-cart",
    accent: "#EAF3EE",
    necessary: true,
    items: [
      su("sm-bananas", "Bananas (1kg)", 6, "Fresh produce", 3),
      su("sm-apples", "Apples (1kg)", 9, "Fresh produce", 3),
      su("sm-oranges", "Oranges (1kg)", 8, "Fresh produce", 3),
      su("sm-tomatoes", "Tomatoes (1kg)", 7, "Fresh produce", 2),
      su("sm-cucumbers", "Cucumbers (500g)", 4, "Fresh produce", 2),
      su("sm-lettuce", "Lettuce", 6, "Fresh produce", 2),
      su("sm-carrots", "Carrots (1kg)", 5, "Fresh produce", 2),
      su("sm-dates", "Khalas dates (500g)", 18, "Fresh produce", 4),
      su("sm-chicken", "Chicken breast (1kg)", 28, "Fresh produce", 6),
      su("sm-fish", "Hammour fillet (500g)", 42, "Fresh produce", 6),
      su("sm-eggs", "Eggs (30)", 16, "Fresh produce", 5),
      su("sm-milk", "Fresh milk (2L)", 12, "Fresh produce", 3),
      su("sm-yogurt", "Laban (1L)", 8, "Fresh produce", 3),
      su("sm-rice", "Basmati rice (5kg)", 38, "Pantry staples", 6),
      su("sm-pasta", "Pasta (1kg)", 9, "Pantry staples", 4),
      su("sm-flour", "Flour (2kg)", 11, "Pantry staples", 3),
      su("sm-oil", "Sunflower oil (1.5L)", 19, "Pantry staples", 2),
      su("sm-lentils", "Lentils (1kg)", 10, "Pantry staples", 4),
      su("sm-chickpeas", "Chickpeas (1kg)", 8, "Pantry staples", 3),
      su("sm-tuna", "Canned tuna (4-pack)", 22, "Pantry staples", 4),
      su("sm-honey", "Sidr honey (250g)", 55, "Pantry staples", 3),
      su("sm-tea", "Karak tea mix", 14, "Pantry staples", 2),
      su("sm-coffee", "Arabic coffee (250g)", 26, "Pantry staples", 2),
      su("sm-zaatar", "Za'atar (200g)", 12, "Pantry staples", 1),
      su("sm-bread", "Khubz (10 pieces)", 5, "Pantry staples", 3),
      su("sm-chips", "Chips (family pack)", 12, "Snacks & drinks", 1),
      su("sm-chocolate", "Chocolate bar", 8, "Snacks & drinks", 1),
      su("sm-biscuits", "Biscuits", 7, "Snacks & drinks", 1),
      su("sm-juice", "Orange juice (1L)", 10, "Snacks & drinks", 2),
      su("sm-water", "Water (12-pack)", 14, "Snacks & drinks", 2),
      su("sm-soda", "Soft drinks (6-pack)", 15, "Snacks & drinks", 1),
      su("sm-icecream", "Ice cream (1L)", 20, "Snacks & drinks", 1),
      su("sm-nuts", "Mixed nuts (500g)", 34, "Snacks & drinks", 3),
      su("sm-detergent", "Laundry detergent", 25, "Household"),
      su("sm-dish", "Dish soap", 9, "Household"),
      su("sm-tissues", "Tissues (5 boxes)", 17, "Household"),
      su("sm-trash", "Trash bags", 12, "Household"),
      su("sm-cleaner", "All-purpose cleaner", 13, "Household"),
      su("sm-sponges", "Sponges (6)", 6, "Household"),
      su("sm-foil", "Aluminium foil", 8, "Household"),
    ],
  },
  {
    id: "pharmacy",
    name: "Pharmacy",
    tagline: "Health items and vitamins. Restores wellbeing.",
    icon: "cross",
    accent: "#EDF2F0",
    necessary: true,
    items: [
      { id: "ph-paracetamol", name: "Paracetamol", price: 20, section: "Medicine", effect: { wellbeing: 6 } },
      { id: "ph-coldmed", name: "Cold & flu relief", price: 32, section: "Medicine", effect: { wellbeing: 10 } },
      { id: "ph-allergy", name: "Allergy tablets", price: 38, section: "Medicine", effect: { wellbeing: 8 } },
      { id: "ph-firstaid", name: "First aid kit", price: 65, section: "Medicine", effect: { wellbeing: 5 } },
      { id: "ph-vitc", name: "Vitamin C", price: 45, section: "Vitamins", effect: { wellbeing: 6 } },
      { id: "ph-vitd", name: "Vitamin D", price: 55, section: "Vitamins", effect: { wellbeing: 6 } },
      { id: "ph-multi", name: "Multivitamins", price: 78, section: "Vitamins", effect: { wellbeing: 8 } },
      { id: "ph-protein", name: "Protein powder (small)", price: 95, section: "Vitamins", effect: { energy: 6, wellbeing: 4 } },
      { id: "ph-sunscreen", name: "Sunscreen SPF50", price: 60, section: "Personal care", effect: { wellbeing: 4 } },
      { id: "ph-toothpaste", name: "Toothpaste & brush set", price: 28, section: "Personal care", effect: { wellbeing: 4 } },
      { id: "ph-shampoo", name: "Shampoo", price: 30, section: "Personal care", effect: { wellbeing: 3 } },
      { id: "ph-deodorant", name: "Deodorant", price: 24, section: "Personal care", effect: { wellbeing: 3 } },
      { id: "ph-skincare", name: "Face wash & moisturizer", price: 85, section: "Personal care", effect: { wellbeing: 6 } },
    ],
  },
  {
    id: "cafe",
    name: "Café",
    tagline: "Coffee runs add up faster than you think.",
    icon: "coffee",
    accent: "#F4EFE6",
    items: [
      { id: "cf-espresso", name: "Espresso", price: 12, section: "Coffee", effect: { energy: 2, lifestyle: 1 } },
      { id: "cf-flatwhite", name: "Flat white", price: 18, section: "Coffee", effect: { energy: 3, lifestyle: 2 } },
      { id: "cf-spanish", name: "Spanish latte", price: 22, section: "Coffee", effect: { energy: 3, lifestyle: 3 } },
      { id: "cf-matcha", name: "Iced matcha", price: 25, section: "Coffee", effect: { energy: 2, lifestyle: 3 } },
      { id: "cf-croissant", name: "Butter croissant", price: 12, section: "Pastries", effect: { energy: 2, lifestyle: 1 } },
      { id: "cf-cookie", name: "Chocolate chip cookie", price: 8, section: "Pastries", effect: { lifestyle: 1 } },
      { id: "cf-cake", name: "Slice of cake", price: 18, section: "Pastries", effect: { lifestyle: 2 } },
      { id: "cf-avocado", name: "Avocado toast", price: 32, section: "Lunch", effect: { energy: 4, lifestyle: 2 } },
      { id: "cf-halloumi", name: "Halloumi wrap", price: 28, section: "Lunch", effect: { energy: 4, lifestyle: 2 } },
      { id: "cf-salad", name: "Quinoa salad bowl", price: 38, section: "Lunch", effect: { energy: 5, wellbeing: 2, lifestyle: 2 } },
      { id: "cf-club", name: "Club sandwich", price: 42, section: "Lunch", effect: { energy: 5, lifestyle: 2 } },
    ],
  },
  {
    id: "restaurants",
    name: "Restaurants",
    tagline: "Three tiers — from cafeteria shawarma to fine dining.",
    icon: "utensils",
    accent: "#F2EDE4",
    items: [
      { id: "rs-shawarma", name: "Shawarma meal (casual)", price: 30, section: "Casual", effect: { energy: 5, lifestyle: 2 } },
      { id: "rs-biryani", name: "Chicken biryani (casual)", price: 38, section: "Casual", effect: { energy: 6, lifestyle: 2 } },
      { id: "rs-burger", name: "Smash burger combo (casual)", price: 48, section: "Casual", effect: { energy: 5, lifestyle: 3 } },
      { id: "rs-machboos", name: "Machboos plate (casual)", price: 55, section: "Casual", effect: { energy: 6, lifestyle: 3 } },
      { id: "rs-lebanese", name: "Lebanese grill for two (mid-range)", price: 95, section: "Mid-range", effect: { energy: 7, social: 3, lifestyle: 4 } },
      { id: "rs-sushi", name: "Sushi set (mid-range)", price: 120, section: "Mid-range", effect: { energy: 6, lifestyle: 5 } },
      { id: "rs-steak", name: "Steakhouse dinner (mid-range)", price: 145, section: "Mid-range", effect: { energy: 7, lifestyle: 5 } },
      { id: "rs-omakase", name: "Omakase experience (fine dining)", price: 280, section: "Fine dining", effect: { energy: 6, lifestyle: 9 } },
      { id: "rs-tasting", name: "Chef's tasting menu (fine dining)", price: 420, section: "Fine dining", effect: { energy: 7, lifestyle: 11 } },
      { id: "rs-rooftop", name: "Rooftop fine dining for two", price: 560, section: "Fine dining", effect: { energy: 7, social: 4, lifestyle: 12 } },
    ],
  },
  {
    id: "mall",
    name: "Mall / Fashion",
    tagline: "Fast fashion or premium — price and quality trade off.",
    icon: "shirt",
    accent: "#EFEDEA",
    items: [
      { id: "ml-tee-fast", name: "Fast-fashion tee", price: 40, section: "Clothing", effect: { lifestyle: 2 }, breaksAfterMonths: 3, note: "Wears out in ~3 sim-months" },
      { id: "ml-tee-prem", name: "Premium cotton tee", price: 140, section: "Clothing", effect: { lifestyle: 3 } },
      { id: "ml-jeans-fast", name: "Fast-fashion jeans", price: 90, section: "Clothing", effect: { lifestyle: 3 }, breaksAfterMonths: 4, note: "Wears out in ~4 sim-months" },
      { id: "ml-jeans-prem", name: "Premium denim", price: 320, section: "Clothing", effect: { lifestyle: 5 } },
      { id: "ml-kandura", name: "Tailored kandura", price: 350, section: "Clothing", effect: { lifestyle: 6 } },
      { id: "ml-abaya", name: "Designer abaya", price: 480, section: "Clothing", effect: { lifestyle: 7 } },
      { id: "ml-jacket", name: "Statement jacket", price: 620, section: "Clothing", effect: { lifestyle: 8 } },
      { id: "ml-coat", name: "Premium coat", price: 800, section: "Clothing", effect: { lifestyle: 8 } },
      { id: "ml-sneak-fast", name: "Fast-fashion sneakers", price: 100, section: "Shoes", effect: { lifestyle: 3 }, breaksAfterMonths: 3, note: "Falls apart in ~3 sim-months" },
      { id: "ml-sneak-mid", name: "Everyday runners", price: 380, section: "Shoes", effect: { lifestyle: 5 } },
      { id: "ml-sneak-drop", name: "Limited sneaker drop", price: 400, section: "Shoes", effect: { lifestyle: 8, social: 3 } },
      { id: "ml-sneak-prem", name: "Premium sneakers", price: 750, section: "Shoes", effect: { lifestyle: 7 } },
      { id: "ml-dress-shoe", name: "Leather dress shoes", price: 1200, section: "Shoes", effect: { lifestyle: 8 } },
      { id: "ml-cap", name: "Cap", price: 20, section: "Accessories", effect: { lifestyle: 1 } },
      { id: "ml-belt", name: "Leather belt", price: 120, section: "Accessories", effect: { lifestyle: 2 } },
      { id: "ml-bag", name: "Crossbody bag", price: 260, section: "Accessories", effect: { lifestyle: 4 } },
      { id: "ml-watch", name: "Minimalist watch", price: 400, section: "Accessories", effect: { lifestyle: 6 } },
      { id: "ml-shades", name: "Designer sunglasses", price: 380, section: "Accessories", effect: { lifestyle: 5 } },
    ],
  },
  {
    id: "electronics",
    name: "Electronics",
    tagline: "Gadgets, gaming — and the BNPL trap.",
    icon: "smartphone",
    accent: "#ECEFEE",
    bnpl: true,
    items: [
      { id: "el-earbuds-cheap", name: "Budget earbuds", price: 50, section: "Audio", effect: { lifestyle: 2 }, breaksAfterMonths: 3, note: "Cheap build — breaks in ~3 sim-months" },
      { id: "el-earbuds-mid", name: "Mid-range earbuds", price: 280, section: "Audio", effect: { lifestyle: 4 } },
      { id: "el-headphones", name: "Over-ear headphones", price: 850, section: "Audio", effect: { lifestyle: 6 } },
      { id: "el-speaker", name: "Bluetooth speaker", price: 320, section: "Audio", effect: { lifestyle: 4 } },
      { id: "el-phone-basic", name: "Entry smartphone", price: 700, section: "Phones", effect: { lifestyle: 4 } },
      { id: "el-phone-mid", name: "Mid-range smartphone", price: 1600, section: "Phones", effect: { lifestyle: 7 } },
      { id: "el-phone-flag", name: "Flagship smartphone", price: 4200, section: "Phones", effect: { lifestyle: 12 } },
      { id: "el-repair", name: "Screen repair service", price: 250, section: "Phones" },
      { id: "el-laptop-repair", name: "Laptop repair service", price: 400, section: "Computers" },
      { id: "el-laptop-basic", name: "Budget laptop", price: 1500, section: "Computers", effect: { lifestyle: 5 } },
      { id: "el-laptop-mid", name: "Mid-range laptop", price: 2800, section: "Computers", effect: { lifestyle: 8 } },
      { id: "el-laptop-pro", name: "Pro laptop", price: 4800, section: "Computers", effect: { lifestyle: 11 } },
      { id: "el-controller", name: "Game controller", price: 240, section: "Gaming", effect: { lifestyle: 3 } },
      { id: "el-game", name: "New game title", price: 260, section: "Gaming", effect: { lifestyle: 4 } },
      { id: "el-console", name: "Games console", price: 2100, section: "Gaming", effect: { lifestyle: 10 } },
      { id: "el-monitor", name: "Gaming monitor", price: 1100, section: "Gaming", effect: { lifestyle: 6 } },
    ],
  },
  {
    id: "bookstore",
    name: "Bookstore / Library",
    tagline: "Buy books — or borrow for the price of a membership.",
    icon: "book-open",
    accent: "#F1EFE8",
    items: [
      { id: "bk-membership", name: "Library membership (1 year, free borrowing)", price: 50, section: "Library", effect: { wellbeing: 4 }, note: "Borrow unlimited books all year" },
      { id: "bk-novel", name: "Bestselling novel", price: 45, section: "Books", effect: { wellbeing: 3, lifestyle: 2 } },
      { id: "bk-finance", name: "Personal finance classic", price: 60, section: "Books", effect: { wellbeing: 3 } },
      { id: "bk-arabic", name: "Arabic literature collection", price: 75, section: "Books", effect: { wellbeing: 4 } },
      { id: "bk-selfhelp", name: "Habits & productivity book", price: 55, section: "Books", effect: { wellbeing: 3 } },
      { id: "bk-biography", name: "Founder biography", price: 68, section: "Books", effect: { wellbeing: 3 } },
      { id: "bk-coffee-table", name: "Coffee-table art book", price: 90, section: "Books", effect: { lifestyle: 3 } },
      { id: "bk-comics", name: "Manga volume", price: 30, section: "Books", effect: { lifestyle: 2 } },
    ],
  },
  {
    id: "entertainment",
    name: "Entertainment",
    tagline: "Cinema, arcades, concerts, matches.",
    icon: "clapperboard",
    accent: "#EFEDE9",
    items: [
      { id: "en-cinema", name: "Cinema ticket", price: 45, section: "Cinema", effect: { lifestyle: 4, social: 2 } },
      { id: "en-imax", name: "IMAX ticket + snacks", price: 95, section: "Cinema", effect: { lifestyle: 6, social: 2 } },
      { id: "en-arcade", name: "Arcade credits", price: 30, section: "Arcade", effect: { lifestyle: 3, social: 2 } },
      { id: "en-vr", name: "VR arena session", price: 100, section: "Arcade", effect: { lifestyle: 5, social: 3 } },
      { id: "en-karting", name: "Go-karting session", price: 120, section: "Arcade", effect: { lifestyle: 6, social: 3 } },
      { id: "en-concert-small", name: "Local gig ticket", price: 150, section: "Concerts", effect: { lifestyle: 6, social: 4 } },
      { id: "en-concert-mid", name: "Arena concert ticket", price: 380, section: "Concerts", effect: { lifestyle: 9, social: 5 } },
      { id: "en-concert-big", name: "Headline world-tour ticket", price: 800, section: "Concerts", effect: { lifestyle: 12, social: 6 } },
      { id: "en-football", name: "Pro League match ticket", price: 100, section: "Sports events", effect: { lifestyle: 5, social: 4 } },
      { id: "en-f1", name: "Grand Prix grandstand ticket", price: 500, section: "Sports events", effect: { lifestyle: 11, social: 5 } },
    ],
  },
  {
    id: "gym",
    name: "Gym / Fitness",
    tagline: "Commitment pricing: day pass vs annual maths.",
    icon: "dumbbell",
    accent: "#EAF1EC",
    items: [
      { id: "gy-day", name: "Day pass", price: 60, section: "Passes", effect: { wellbeing: 5, energy: 3 } },
      { id: "gy-month", name: "Monthly membership", price: 250, section: "Passes", effect: { wellbeing: 12, energy: 6 } },
      { id: "gy-annual", name: "Annual membership", price: 2000, section: "Passes", effect: { wellbeing: 18, energy: 8 }, note: "Cheapest per month if you actually go" },
      { id: "gy-class", name: "Padel court hour (split)", price: 75, section: "Classes", effect: { wellbeing: 6, social: 4 } },
      { id: "gy-swim", name: "Swimming session", price: 50, section: "Classes", effect: { wellbeing: 5, energy: 3 } },
    ],
  },
  {
    id: "salon",
    name: "Salon / Barber",
    tagline: "Looking sharp, priced two ways.",
    icon: "scissors",
    accent: "#F2EFEA",
    items: [
      { id: "sa-cut-basic", name: "Basic haircut", price: 40, section: "Basic", effect: { wellbeing: 4, lifestyle: 2 } },
      { id: "sa-cut-beard", name: "Cut + beard trim", price: 70, section: "Basic", effect: { wellbeing: 5, lifestyle: 3 } },
      { id: "sa-basic-style", name: "Wash & style", price: 80, section: "Basic", effect: { wellbeing: 5, lifestyle: 3 } },
      { id: "sa-premium-cut", name: "Premium salon cut", price: 150, section: "Premium", effect: { wellbeing: 6, lifestyle: 5 } },
      { id: "sa-spa", name: "Spa treatment", price: 280, section: "Premium", effect: { wellbeing: 10, lifestyle: 6 } },
      { id: "sa-full", name: "Full grooming package", price: 400, section: "Premium", effect: { wellbeing: 10, lifestyle: 8 } },
    ],
  },
  {
    id: "gifts",
    name: "Gifts Shop",
    tagline: "Birthdays, Eid, family occasions.",
    icon: "gift",
    accent: "#F3EEE6",
    items: [
      { id: "gf-card", name: "Card + chocolates", price: 35, section: "Gifts", effect: { social: 3, community: 2 } },
      { id: "gf-flowers", name: "Flower bouquet", price: 90, section: "Gifts", effect: { social: 4, community: 2 } },
      { id: "gf-perfume", name: "Oud gift set", price: 220, section: "Gifts", effect: { social: 6, community: 3 } },
      { id: "gf-eidiya-env", name: "Eidiya envelopes set", price: 25, section: "Gifts", effect: { community: 2 } },
      { id: "gf-hamper", name: "Premium gift hamper", price: 350, section: "Gifts", effect: { social: 7, community: 4 } },
      { id: "gf-custom", name: "Personalized keepsake", price: 160, section: "Gifts", effect: { social: 5, community: 3 } },
    ],
  },
  {
    id: "travel",
    name: "Travel Agency",
    tagline: "From staycations to the trip of the year.",
    icon: "plane",
    accent: "#EBF0EF",
    unlockMonth: 3,
    items: [
      { id: "tv-staycation", name: "Staycation weekend (RAK)", price: 500, section: "Weekend trips", effect: { wellbeing: 8, lifestyle: 8 } },
      { id: "tv-desert", name: "Desert camp overnight", price: 650, section: "Weekend trips", effect: { wellbeing: 8, lifestyle: 9, social: 4 } },
      { id: "tv-musandam", name: "Musandam dhow trip", price: 800, section: "Weekend trips", effect: { wellbeing: 9, lifestyle: 9 } },
      { id: "tv-georgia", name: "Georgia (4 days)", price: 2200, section: "Trips", effect: { wellbeing: 12, lifestyle: 14 } },
      { id: "tv-istanbul", name: "Istanbul (5 days)", price: 3200, section: "Trips", effect: { wellbeing: 13, lifestyle: 15 } },
      { id: "tv-japan", name: "Japan (8 days)", price: 8000, section: "Trips", effect: { wellbeing: 16, lifestyle: 20 } },
    ],
  },
];

export function getLocation(id: string): LocationDef | undefined {
  return LOCATIONS.find((l) => l.id === id);
}

export function getItem(locationId: string, itemId: string): Item | undefined {
  return getLocation(locationId)?.items.find((i) => i.id === itemId);
}
